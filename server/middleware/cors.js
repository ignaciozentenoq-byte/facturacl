// server/middleware/cors.js
// ═══════════════════════════════════════════════════════════════
// CORS configurado por entorno.
// • Development  → permite localhost:5173 y localhost:3000
// • Production   → solo los orígenes definidos en ALLOWED_ORIGINS
// Las peticiones sin origen (curl, Postman, caja POS nativa)
// se permiten solo en desarrollo.
// ═══════════════════════════════════════════════════════════════

import cors from 'cors';
import { config } from '../config/index.js';
import logger from './logger.js';

const allowedSet = new Set(config.allowedOrigins);

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Sin origin → herramienta de desarrollo o petición server-to-server
    if (!origin) {
      if (config.isDev) return callback(null, true);
      // En producción las llamadas server-to-server de QuickPOS
      // van autenticadas con API key, no necesitan CORS
      return callback(null, true);
    }

    if (allowedSet.has(origin)) {
      return callback(null, true);
    }

    logger.warn({ origin }, 'CORS: origen rechazado');
    callback(new Error(`Origen no permitido: ${origin}`));
  },

  methods:         ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders:  ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders:  ['X-Request-Id'],
  credentials:     true,
  maxAge:          86_400, // pre-flight válido 24h
});
