// server/middleware/jwtAuth.js
// ═══════════════════════════════════════════════════════════════
// Middleware para validar JWT en rutas protegidas del POS.
// Inyecta req.user con {id, tenant_id, email, role}.
// ═══════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import logger from './logger.js';

export function jwtAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Se requiere token de autenticación.',
    });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret);

    // Rechazar refresh tokens usados como access tokens
    if (payload.type === 'refresh') {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Token inválido para esta operación.',
      });
    }

    req.user = {
      id: payload.sub,
      tenant_id: payload.tenant_id,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TOKEN_EXPIRED',
        message: 'Token expirado. Usa el refresh token para renovar.',
      });
    }
    logger.warn({ err: err.message }, 'JWT inválido');
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Token inválido.',
    });
  }
}
