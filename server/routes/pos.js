// server/routes/pos.js
import { Router }            from 'express';
import { PosDocumentSchema } from '../validators/documentSchema.js';
import { buildKoywePayload } from '../services/documentBuilder.js';
import { createDocument }    from '../services/koyweClient.js';
import { saveDocument }      from '../services/db.js';
import { posLimiter }        from '../middleware/rateLimiter.js';
import logger                from '../middleware/logger.js';

export const posRouter = Router();

// POST /api/pos/emit
posRouter.post('/emit', posLimiter, async (req, res) => {
  const parse = PosDocumentSchema.safeParse(req.body);
  if (!parse.success) {
    logger.warn({ issues: parse.error.issues }, 'Validación POS fallida');
    return res.status(400).json({
      ok:     false,
      error:  'VALIDATION_ERROR',
      issues: parse.error.issues.map(i => ({
        field:   i.path.join('.'),
        message: i.message,
      })),
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
    const data    = await createDocument(koywePayload);
    const docNumber = data.header?.document_number ?? data.document_id;
    const pdfBase64 = data.electronic_document?.document_pdf ?? null;
    const xmlBase64 = data.electronic_document?.document_xml ?? null;

    // Guardar en BD (no bloquea la respuesta si falla)
    saveDocument({
      tenantId:      req.tenantId ?? null,
      saleId:        null,
      terminalId:    null,
      koyweResponse: data,
      posPayload:    parse.data,
    }).catch(err => logger.error({ err }, 'Error guardando DTE en BD'));

    logger.info({
      document_id: data.document_id,
      doc_number:  docNumber,
      type:        document_type,
      pos_sale_id,
      pos_terminal,
    }, 'DTE emitido desde caja POS');

    res.status(201).json({
      ok:          true,
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
    if (err.name === 'KoyweError') {
      logger.error({ code: err.code, pos_sale_id }, `Error Koywe en caja: ${err.message}`);
      return res.status(err.statusCode).json({
        ok:      false,
        error:   err.code,
        message: err.message,
      });
    }
    logger.error({ err, pos_sale_id }, 'Error inesperado en emisión POS');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: 'Error interno' });
  }
});

// GET /api/pos/health
posRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'facturacl-pos', ts: new Date().toISOString() });
});
