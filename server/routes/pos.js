// server/routes/pos.js
import { Router }            from 'express';
import { PosDocumentSchema } from '../validators/documentSchema.js';
import { buildKoywePayload } from '../services/documentBuilder.js';
import { createDocument }    from '../services/koyweClient.js';
import { saveDocument }      from '../services/db.js';
import { enqueueDocument }   from '../services/emissionWorker.js';
import { posLimiter }        from '../middleware/rateLimiter.js';
import logger                from '../middleware/logger.js';

export const posRouter = Router();

// POST /api/pos/emit
posRouter.post('/emit', posLimiter, async (req, res) => {
  const parse = PosDocumentSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      ok:     false,
      error:  'VALIDATION_ERROR',
      issues: parse.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  const { document_type, items, receiver, pos_sale_id, pos_terminal } = parse.data;

  const koywePayload = buildKoywePayload({
    documentType: document_type,
    items:        items.map(i => ({
      description: i.description,
      quantity:    i.quantity,
      unit_price:  i.unit_price,
    })),
    receiver: receiver ?? null,
  });

  try {
    // Intentar emisión inmediata
    const data      = await createDocument(koywePayload);
    const docNumber = data.header?.document_number ?? data.document_id;
    const pdfBase64 = data.electronic_document?.document_pdf ?? null;
    const xmlBase64 = data.electronic_document?.document_xml ?? null;

    // Guardar en BD
    saveDocument({
      tenantId:      req.tenantId ?? null,
      saleId:        null,
      terminalId:    null,
      koyweResponse: data,
      posPayload:    parse.data,
    }).catch(err => logger.error({ err: err.message }, 'Error guardando DTE en BD'));

    logger.info({ doc_number: docNumber, type: document_type, pos_sale_id }, 'DTE emitido desde caja');

    return res.status(201).json({
      ok:          true,
      queued:      false,
      document_id: data.document_id,
      doc_number:  docNumber,
      type:        document_type,
      total:       koywePayload.totals.total_amount,
      issued_at:   new Date().toISOString(),
      has_pdf:     pdfBase64 !== null,
      pdf_base64:  pdfBase64,
      xml_base64:  xmlBase64,
      sii_status:  data.result?.status === 0 ? 'accepted' : 'pending',
      sii_message: data.result?.error_message ?? null,
      pos_sale_id: pos_sale_id ?? null,
    });

  } catch (err) {
    // Koywe falló — agregar a la cola para reintento automático
    logger.warn({
      error:       err.message,
      pos_sale_id,
      pos_terminal,
    }, 'Koywe no disponible — agregando a cola de emisión');

    const queued = await enqueueDocument({
      tenantId:   req.tenantId ?? null,
      saleId:     null,
      terminalId: null,
      payload:    koywePayload,
      posPayload: parse.data,
    });

    // La venta siempre responde OK — la caja no se detiene
    return res.status(202).json({
      ok:          true,
      queued:      true,              // indica que está en cola
      queue_id:    queued?.id ?? null,
      document_id: null,
      doc_number:  null,
      type:        document_type,
      total:       koywePayload.totals.total_amount,
      issued_at:   new Date().toISOString(),
      has_pdf:     false,
      sii_status:  'queued',
      sii_message: 'DTE en cola — se emitirá automáticamente cuando Koywe esté disponible',
      pos_sale_id: pos_sale_id ?? null,
    });
  }
});

// GET /api/pos/health
posRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'facturacl-pos', ts: new Date().toISOString() });
});

// GET /api/pos/queue-status/:pos_sale_id
// QuickPOS puede consultar si un DTE en cola ya fue emitido
posRouter.get('/queue-status/:pos_sale_id', async (req, res) => {
  const { supabase } = await import('../services/db.js');
  if (!supabase) return res.json({ status: 'unknown' });

  const { data } = await supabase
    .from('emission_queue')
    .select('status, document_id, error_message, attempts')
    .eq('pos_sale_id', req.params.pos_sale_id)
    .single();

  res.json(data ?? { status: 'not_found' });
});
