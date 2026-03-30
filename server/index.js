// server/index.js
// ═══════════════════════════════════════════════════════════════
// Entry point del servidor FacturaCL.
// Inicializa Express con todos los middleware y rutas.
// ═══════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════
// MIDDLEWARE GLOBAL
// ════════════════════════════════════════════════════════════════

// Seguridad HTTP (headers)
app.use(helmet({
  // CSP permisiva en dev para el servidor Vite
  contentSecurityPolicy: config.isProduction ? undefined : false,
}));

// CORS
app.use(corsMiddleware);

// Compresión gzip
app.use(compression());

// Parse JSON (límite 1MB para proteger contra payloads gigantes)
app.use(express.json({ limit: '1mb' }));

// Logging de requests
app.use(requestLogger);

// Añadir request ID a la respuesta para trazabilidad
app.use((_req, res, next) => {
  res.setHeader('X-Request-Id', `fcl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  next();
});

// ════════════════════════════════════════════════════════════════
// RUTAS
// ════════════════════════════════════════════════════════════════

// Health check (sin rate limit — Railway/Azure necesita consultarlo frecuente)
app.use('/health', healthRouter);

// API manual (UI embebida / iframe)
app.use('/api/koywe', apiLimiter, koyweRouter);

// API nativa POS — requiere API key de QuickPOS
app.use('/api/pos', apiKeyAuth, posRouter);

// ════════════════════════════════════════════════════════════════
// FRONTEND ESTÁTICO
// ════════════════════════════════════════════════════════════════

if (config.isProduction) {
  // Servir el build de Vite
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath, {
    maxAge:  '1d',    // assets con hash → cacheables
    etag:    true,
    lastModified: true,
  }));

  // SPA fallback — todas las rutas no reconocidas sirven index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ════════════════════════════════════════════════════════════════
// ERROR HANDLER GLOBAL
// ════════════════════════════════════════════════════════════════

// CORS error
app.use((err, _req, res, next) => {
  if (err.message && err.message.startsWith('Origen no permitido')) {
    return res.status(403).json({ error: 'CORS_BLOCKED', message: err.message });
  }
  next(err);
});

// Error genérico
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Error no manejado');
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error interno del servidor' });
});

// ════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════

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

// Graceful shutdown para Railway / Docker / Azure
function gracefulShutdown(signal) {
  logger.info(`${signal} recibido, cerrando servidor…`);
  server.close(() => {
    logger.info('Servidor cerrado correctamente');
    process.exit(0);
  });
  // Forzar cierre si tarda más de 10s
  setTimeout(() => {
    logger.error('Forzando cierre por timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

export { app };
