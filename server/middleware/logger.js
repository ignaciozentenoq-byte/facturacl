// server/middleware/logger.js
// ═══════════════════════════════════════════════════════════════
// Logger estructurado con pino.
// • Development  → pino-pretty (legible en terminal)
// • Production   → JSON puro (compatible con Railway, Azure)
// Exporta tanto el logger base como el middleware de Express.
// ═══════════════════════════════════════════════════════════════

import pino from 'pino';
import { config } from '../config/index.js';

// ── Instancia del logger ──────────────────────────────────────

const transport = config.log.pretty
  ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
  : undefined;

export const logger = pino({
  level:     config.log.level,
  transport,
  base:      { service: 'facturacl', env: config.nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redacta campos sensibles para que nunca aparezcan en los logs
  redact: {
    paths: [
      'req.headers.authorization',
      'body.client_secret',
      'body.password',
      '*.client_secret',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
});

// ── Middleware de Express ─────────────────────────────────────

/**
 * Loguea cada request entrante con método, URL, status y duración.
 * Omite /health para no ensuciar los logs de Railway.
 */
export function requestLogger(req, res, next) {
  if (req.path === '/health') return next();

  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'info';

    logger[level]({
      method:  req.method,
      url:     req.originalUrl,
      status:  res.statusCode,
      ms,
      ip:      req.ip,
    }, `${req.method} ${req.originalUrl} ${res.statusCode} (${ms}ms)`);
  });

  next();
}

export default logger;
