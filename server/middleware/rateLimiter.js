// server/middleware/rateLimiter.js
// ═══════════════════════════════════════════════════════════════
// Rate limiting por capa:
// • apiLimiter      → todas las rutas /api/*  (60 req/min)
// • documentLimiter → solo emisión de DTEs    (20 req/min)
// • posLimiter      → endpoint de caja POS    (120 req/min)
//   (más alto porque la caja puede emitir rápido en hora pico)
// ═══════════════════════════════════════════════════════════════

import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

const defaults = {
  standardHeaders: true,
  legacyHeaders:   false,
  // En Railway/Azure hay un proxy delante — usar el IP real
  trustProxy:      true,
};

/** Límite general para /api/* */
export const apiLimiter = rateLimit({
  ...defaults,
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.maxGlobal,
  message: {
    error:   'RATE_LIMIT_EXCEEDED',
    message: `Demasiadas solicitudes. Máximo ${config.rateLimit.maxGlobal} por minuto.`,
  },
});

/** Límite estricto para emisión de documentos (POST /api/koywe/documents) */
export const documentLimiter = rateLimit({
  ...defaults,
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.maxDocs,
  message: {
    error:   'DOCUMENT_RATE_LIMIT',
    message: `Límite de emisión alcanzado. Máximo ${config.rateLimit.maxDocs} documentos por minuto.`,
  },
});

/** Límite para el endpoint nativo de caja POS */
export const posLimiter = rateLimit({
  ...defaults,
  windowMs: 60_000,
  max:      120,
  message: {
    error:   'POS_RATE_LIMIT',
    message: 'Límite de operaciones de caja alcanzado.',
  },
});
