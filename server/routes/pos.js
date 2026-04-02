// server/routes/pos.js
import { Router }            from 'express';
import { PosDocumentSchema } from '../validators/documentSchema.js';
import { buildKoywePayload } from '../services/documentBuilder.js';
import { createDocument }    from '../services/koyweClient.js';
import { saveDocument, supabase } from '../services/db.js';
import { enqueueDocument }   from '../services/emissionWorker.js';
import { posLimiter }        from '../middleware/rateLimiter.js';
import logger                from '../middleware/logger.js';

export const posRouter = Router();

// ── Idempotencia: buscar documento ya emitido por pos_sale_id ─
async function findExistingDocument(tenantId, posSaleId) {
  if (!supabase || !posSaleId) return null;
  const { data } = await supabase
    .from('documents')
    .select('id, koywe_document_id, doc_number, type, total, status, xml_base64, pdf_base64, issued_at')
    .eq('pos_sale_id', posSaleId)
    .eq('status', 'ok')
    .maybeSingle();
  return data ?? null;
}

// ── Idempotencia: buscar en cola por pos_sale_id ──────────────
async function findExistingQueue(posSaleId) {
  if (!supabase || !posSaleId) return null;
  const { data } = await supabase
    .from('emission_queue')
    .select('id, status, attempts, error_detail, emitted_at')
    .eq('pos_sale_id', posSaleId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// ── POST /api/pos/emit ────────────────────────────────────────
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
  const tenantId = req.tenantId ?? null;

  // ── 1a/1b: Verificar si ya existe documento ok con este pos_sale_id ──
  if (pos_sale_id) {
    const existing = await findExistingDocument(tenantId, pos_sale_id);
    if (existing) {
      logger.info({ pos_sale_id, doc_number: existing.doc_number }, 'Idempotencia: DTE ya emitido, devolviendo existente');
      return res.status(200).json({
        ok:          true,
        queued:      false,
        idempotent:  true,           // indica que es respuesta de reintento
        document_id: existing.koywe_document_id,
        doc_number:  existing.doc_number,
        type:        existing.type,
        total:       existing.total,
        issued_at:   existing.issued_at,
        has_pdf:     !!existing.pdf_base64,
        pdf_base64:  existing.pdf_base64,
        xml_base64:  existing.xml_base64,
        sii_status:  'accepted',
        sii_message: 'Documento ya emitido anteriormente (idempotencia)',
        pos_sale_id,
      });
    }

    // ── 1c: Verificar si está en cola processing ──────────────
    const inQueue = await findExistingQueue(pos_sale_id);
    if (inQueue?.status === 'processing') {
      logger.info({ pos_sale_id, queue_id: inQueue.id }, 'Idempotencia: DTE en procesamiento, devolviendo estado');
      return res.status(202).json({
        ok:          true,
        queued:      true,
        idempotent:  true,
        queue_id:    inQueue.id,
        document_id: null,
        doc_number:  null,
        type:        document_type,
        total:       null,
        issued_at:   new Date().toISOString(),
        has_pdf:     false,
        sii_status:  'processing',
        sii_message: 'DTE en procesamiento — espera la respuesta',
        pos_sale_id,
      });
    }

    // ── 1e: Si estaba en cola como emitted, devolver sin reemitir ─
    if (inQueue?.status === 'emitted') {
      logger.info({ pos_sale_id, queue_id: inQueue.id }, 'Idempotencia: DTE ya emitido vía cola');
      return res.status(200).json({
        ok:          true,
        queued:      false,
        idempotent:  true,
        queue_id:    inQueue.id,
        document_id: null,
        doc_number:  null,
        type:        document_type,
        total:       null,
        issued_at:   inQueue.emitted_at ?? new Date().toISOString(),
        has_pdf:     false,
        sii_status:  'accepted',
        sii_message: 'Documento emitido vía cola de reintentos',
        pos_sale_id,
      });
    }
  }

  // ── Construir payload Koywe ───────────────────────────────────
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
    // ── Intentar emisión inmediata ────────────────────────────
    const data      = await createDocument(koywePayload);
    const docNumber = data.header?.document_number ?? data.document_id;
    const pdfBase64 = data.electronic_document?.document_pdf ?? null;
    const xmlBase64 = data.electronic_document?.document_xml ?? null;

    // Guardar en BD — no bloquea la respuesta
    saveDocument({
      tenantId,
      saleId:        null,
      terminalId:    null,
      koyweResponse: data,
      posPayload:    parse.data,
    }).catch(err => logger.error({ err: err.message }, 'Error guardando DTE en BD'));

    logger.info({ doc_number: docNumber, type: document_type, pos_sale_id }, 'DTE emitido desde caja');

    return res.status(201).json({
      ok:          true,
      queued:      false,
      idempotent:  false,
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
    // ── 1e: Koywe falló — puede ser timeout ambiguo ───────────
    // Antes de encolar, verificar una vez más si Koywe procesó
    // (el error pudo ser solo de respuesta, no de procesamiento)
    if (pos_sale_id) {
      const retryCheck = await findExistingDocument(tenantId, pos_sale_id);
      if (retryCheck) {
        logger.info({ pos_sale_id }, 'Timeout ambiguo resuelto: DTE ya existe en BD');
        return res.status(200).json({
          ok:          true,
          queued:      false,
          idempotent:  true,
          document_id: retryCheck.koywe_document_id,
          doc_number:  retryCheck.doc_number,
          type:        retryCheck.type,
          total:       retryCheck.total,
          issued_at:   retryCheck.issued_at,
          has_pdf:     !!retryCheck.pdf_base64,
          pdf_base64:  retryCheck.pdf_base64,
          xml_base64:  retryCheck.xml_base64,
          sii_status:  'accepted',
          sii_message: 'Documento recuperado tras timeout',
          pos_sale_id,
        });
      }
    }

    // ── Agregar a cola de reintentos ──────────────────────────
    logger.warn({ error: err.message, pos_sale_id, pos_terminal }, 'Koywe no disponible — encolando DTE');

    const queued = await enqueueDocument({
      tenantId,
      saleId:     null,
      terminalId: null,
      payload:    koywePayload,
      posPayload: parse.data,
    });

    return res.status(202).json({
      ok:          true,
      queued:      true,
      idempotent:  false,
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

// ── GET /api/pos/health ───────────────────────────────────────
posRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'facturacl-pos', ts: new Date().toISOString() });
});

// ── GET /api/pos/queue-status/:pos_sale_id ────────────────────
// QuickPOS consulta si un DTE en cola ya fue emitido
posRouter.get('/queue-status/:pos_sale_id', async (req, res) => {
  if (!supabase) return res.json({ status: 'unknown' });

  const { data } = await supabase
    .from('emission_queue')
    .select('id, status, attempts, error_detail, error_code, emitted_at, created_at')
    .eq('pos_sale_id', req.params.pos_sale_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return res.json({ status: 'not_found' });

  // Si ya fue emitido, buscar el documento real
  if (data.status === 'emitted') {
    const doc = await findExistingDocument(req.tenantId ?? null, req.params.pos_sale_id);
    return res.json({ ...data, document: doc ?? null });
  }

  res.json(data);
});
