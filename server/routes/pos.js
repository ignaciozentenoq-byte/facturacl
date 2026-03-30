// server/routes/pos.js
// ═══════════════════════════════════════════════════════════════
// Endpoint nativo para QuickPOS — modo caja.
// Autenticado con X-API-Key (nunca desde el browser).
//
// POST /api/pos/emit
//   QuickPOS envía los datos mínimos de la venta;
//   el servidor construye el DTE completo y lo emite.
//   Respuesta optimizada para el POS: solo los datos necesarios.
//
// POST /api/pos/emit-batch (futuro — comentado)
//   Para emitir múltiples documentos en una sola llamada.
// ═══════════════════════════════════════════════════════════════

import { Router }           from 'express';
import { PosDocumentSchema } from '../validators/documentSchema.js';
import { buildKoywePayload } from '../services/documentBuilder.js';
import { createDocument }    from '../services/koyweClient.js';
import { posLimiter }        from '../middleware/rateLimiter.js';
import logger                from '../middleware/logger.js';

export const posRouter = Router();

// ── POST /api/pos/emit ────────────────────────────────────────

posRouter.post('/emit', posLimiter, async (req, res) => {
  // Validar payload simplificado del POS
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

  // Construir el payload completo para Koywe
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
    const data = await createDocument(koywePayload);

    // Extraer datos relevantes para el POS
    const docNumber = data.header?.document_number ?? data.document_id;
    const pdfBase64 = data.electronic_document?.document_pdf ?? null;

    logger.info({
      document_id:  data.document_id,
      doc_number:   docNumber,
      type:         document_type,
      pos_sale_id,
      pos_terminal,
    }, 'DTE emitido desde caja POS');

    // Respuesta minimalista para el POS
    res.status(201).json({
      ok:          true,
      document_id: data.document_id,
      doc_number:  docNumber,
      type:        document_type,
      total:       koywePayload.totals.total_amount,
      issued_at:   new Date().toISOString(),
      has_pdf:     pdfBase64 !== null,
      pdf_base64:  pdfBase64,
      // Estado del SII
      sii_status:  data.result?.status === 0 ? 'accepted' : 'pending',
      sii_message: data.result?.error_message ?? null,
      // Trazabilidad
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

// ── GET /api/pos/health ───────────────────────────────────────
// Permite a QuickPOS verificar que el módulo está disponible

posRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'facturacl-pos', ts: new Date().toISOString() });
});
