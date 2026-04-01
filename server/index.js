// server/index.js
import express      from 'express';
import helmet       from 'helmet';
import compression  from 'compression';
import path         from 'path';
import { fileURLToPath } from 'url';

import { config }           from './config/index.js';
import { corsMiddleware }   from './middleware/cors.js';
import { requestLogger }    from './middleware/logger.js';
import logger               from './middleware/logger.js';
import { apiLimiter }       from './middleware/rateLimiter.js';
import { apiKeyAuth }       from './middleware/apiKeyAuth.js';

import { healthRouter }     from './routes/health.js';
import { koyweRouter }      from './routes/koywe.js';
import { posRouter }        from './routes/pos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app       = express();
// Railway y Azure tienen un proxy delante — necesario para rate limiter e IPs reales
app.set('trust proxy', 1);

// ── Seguridad HTTP ────────────────────────────────────────────
// CSP desactivado — el frontend usa onclick inline en el HTML
app.use(helmet({ contentSecurityPolicy: false }));
app.use(corsMiddleware);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// Request ID para trazabilidad
app.use((_req, res, next) => {
  res.setHeader('X-Request-Id', `fcl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  next();
});


// ── Rutas ─────────────────────────────────────────────────────
app.use('/health',    healthRouter);
app.use('/api/koywe', apiLimiter, optionalTenantAuth, koyweRouter);
app.use('/api/pos',   apiKeyAuth, posRouter);
// ── Middleware opcional de tenant ─────────────────────────────
async function optionalTenantAuth(req, _res, next) {
  const key = req.headers['x-api-key'];
  if (key) {
    const { createHash }       = await import('crypto');
    const { getTenantByApiKey } = await import('./services/db.js');
    const keyHash = createHash('sha256').update(key).digest('hex');
    const record  = await getTenantByApiKey(keyHash);
    if (record) {
      req.tenantId = record.tenant_id;
      req.tenant   = record.tenants;
    }
  }
  next();
}

// ── Rutas ─────────────────────────────────────────────────────
app.use('/health',    healthRouter);
app.use('/api/koywe', apiLimiter, optionalTenantAuth, koyweRouter);
app.use('/api/pos',   apiKeyAuth, posRouter);

// ── Frontend estático (producción) ────────────────────────────
if (config.isProduction) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath, { maxAge: '1d', etag: true }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Error handler global ──────────────────────────────────────
app.use((err, _req, res, next) => {
  if (err.message?.startsWith('Origen no permitido')) {
    return res.status(403).json({ error: 'CORS_BLOCKED', message: err.message });
  }
  next(err);
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Error no manejado');
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
});

// ── Start ─────────────────────────────────────────────────────
const server = app.listen(config.port, () => {
  logger.info(`
╔══════════════════════════════════════════════════════╗
║     FacturaCL v2.0  ×  Koywe Billing API             ║
╚══════════════════════════════════════════════════════╝

  ✓ Puerto:     ${config.port}
  ✓ Entorno:    ${config.nodeEnv}
  ✓ CORS:       ${config.allowedOrigins.join(', ')}
  ✓ /api/koywe  → Módulo manual (UI / iframe)
  ✓ /api/pos    → Caja nativa QuickPOS (API key)
  ✓ /health     → Health check
`);
});

// Graceful shutdown
function gracefulShutdown(signal) {
  logger.info(`${signal} recibido, cerrando servidor…`);
  server.close(() => { logger.info('Servidor cerrado'); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

export { app };
