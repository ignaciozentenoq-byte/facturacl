// server/routes/koywe.js
// ═══════════════════════════════════════════════════════════════
// Rutas para el módulo de facturación manual (UI embebida).
// Usadas tanto por la UI standalone como cuando se embebe
// como iframe en QuickPOS.
//
// POST /api/koywe/documents  → emitir DTE
// GET  /api/koywe/token      → obtener token (sin credenciales)
// GET  /api/koywe/documents  → listar documentos
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { DocumentSchema }                       from '../validators/documentSchema.js';
import { createDocument, getToken, listDocuments, getDocument } from '../services/koyweClient.js';
import { config }                               from '../config/index.js';
import { documentLimiter }                      from '../middleware/rateLimiter.js';
import logger                                   from '../middleware/logger.js';

export const koyweRouter = Router();

// ── POST /api/koywe/documents ────────────────────────────────

koyweRouter.post('/documents', documentLimiter, async (req, res) => {
  // El account_id siempre viene del servidor — nunca del cliente
  const rawPayload = {
    ...req.body,
    header: {
      ...req.body.header,
      account_id: config.koywe.accountId,
    },
  };

  // Validar con Zod
  const parse = DocumentSchema.safeParse(rawPayload);
  if (!parse.success) {
    logger.warn({ issues: parse.error.issues }, 'Validación de documento fallida');
    return res.status(400).json({
      error:  'VALIDATION_ERROR',
      issues: parse.error.issues.map(i => ({
        path:    i.path.join('.'),
        message: i.message,
      })),
    });
  }

  try {
    const data = await createDocument(parse.data);
    logger.info({
      document_id: data.document_id,
      type:        parse.data.header.document_type_id,
    }, 'DTE emitido vía UI');
    res.status(201).json(data);
  } catch (err) {
    handleError(err, res);
  }
});

// ── GET /api/koywe/token ─────────────────────────────────────
// Expone solo el access_token al frontend, sin las credenciales

koyweRouter.get('/token', async (_req, res) => {
  try {
    const token = await getToken();
    res.json({ access_token: token });
  } catch (err) {
    handleError(err, res);
  }
});

// ── GET /api/koywe/documents ─────────────────────────────────

koyweRouter.get('/documents', async (req, res) => {
  try {
    const data = await listDocuments(req.query);
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
});

// ── GET /api/koywe/documents/:id ────────────────────────────

koyweRouter.get('/documents/:id', async (req, res) => {
  try {
    const data = await getDocument(req.params.id);
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
});

// ── Error handler local ───────────────────────────────────────

function handleError(err, res) {
  if (err.name === 'KoyweError') {
    logger.error({ code: err.code, detail: err.detail }, err.message);
    return res.status(err.statusCode).json({
      error:   err.code,
      message: err.message,
      detail:  err.detail,
    });
  }
  logger.error({ err }, 'Error inesperado en ruta Koywe');
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
}
