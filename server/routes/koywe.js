// server/routes/koywe.js
import { Router }                                           from 'express';
import { DocumentSchema }                                   from '../validators/documentSchema.js';
import { createDocument, getToken, listDocuments, getDocument } from '../services/koyweClient.js';
import { saveDocument }                                     from '../services/db.js';
import { config }                                           from '../config/index.js';
import { documentLimiter }                                  from '../middleware/rateLimiter.js';
import logger                                               from '../middleware/logger.js';

export const koyweRouter = Router();

// POST /api/koywe/documents
koyweRouter.post('/documents', documentLimiter, async (req, res) => {
  const rawPayload = {
    ...req.body,
    header: {
      ...req.body.header,
      account_id: config.koywe.accountId,
    },
  };

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

    // Guardar en BD en paralelo — no bloquea la respuesta
    saveDocument({
      tenantId:      null,
      saleId:        null,
      terminalId:    null,
      koyweResponse: data,
      posPayload:    null,
    }).catch(err => logger.error({ err }, 'Error guardando DTE en BD'));

    logger.info({
      document_id: data.document_id,
      type:        parse.data.header.document_type_id,
    }, 'DTE emitido vía UI');

    res.status(201).json(data);
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/koywe/token
koyweRouter.get('/token', async (_req, res) => {
  try {
    const token = await getToken();
    res.json({ access_token: token });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/koywe/documents
koyweRouter.get('/documents', async (req, res) => {
  try {
    const data = await listDocuments(req.query);
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/koywe/documents/:id
koyweRouter.get('/documents/:id', async (req, res) => {
  try {
    const data = await getDocument(req.params.id);
    res.json(data);
  } catch (err) {
    handleError(err, res);
  }
});

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
