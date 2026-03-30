// server/middleware/apiKeyAuth.js
// ═══════════════════════════════════════════════════════════════
// Autenticación por API key para el endpoint nativo de QuickPOS.
// QuickPOS envía la key en el header X-API-Key.
// Este middleware protege /api/pos/* que es el canal directo
// entre la caja y el módulo de facturación.
// ═══════════════════════════════════════════════════════════════

import { config } from '../config/index.js';
import logger from './logger.js';

export function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'];

  if (!key) {
    logger.warn({ ip: req.ip, url: req.originalUrl }, 'API key ausente');
    return res.status(401).json({
      error:   'UNAUTHORIZED',
      message: 'Se requiere el header X-API-Key para este endpoint.',
    });
  }

  // Comparación en tiempo constante para evitar timing attacks
  // (no usamos === porque revela información por tiempo de respuesta)
  if (!safeCompare(key, config.quickpos.apiKey)) {
    logger.warn({ ip: req.ip, url: req.originalUrl }, 'API key inválida');
    return res.status(403).json({
      error:   'FORBIDDEN',
      message: 'API key inválida.',
    });
  }

  next();
}

/**
 * Comparación en tiempo constante para strings.
 * Previene timing attacks donde un atacante mide el tiempo
 * de respuesta para adivinar la key carácter a carácter.
 */
function safeCompare(a, b) {
  if (a.length !== b.length) {
    // Ejecutar el loop igual para no revelar la longitud
    let result = 0;
    for (let i = 0; i < b.length; i++) {
      result |= (a[0] || 0) ^ b.charCodeAt(i);
    }
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
