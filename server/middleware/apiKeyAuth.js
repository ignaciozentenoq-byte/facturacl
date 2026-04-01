// server/middleware/apiKeyAuth.js
import { createHash }      from 'crypto';
import { config }          from '../config/index.js';
import { getTenantByApiKey } from '../services/db.js';
import logger              from './logger.js';

export async function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'];

  if (!key) {
    logger.warn({ ip: req.ip, url: req.originalUrl }, 'API key ausente');
    return res.status(401).json({
      error:   'UNAUTHORIZED',
      message: 'Se requiere el header X-API-Key para este endpoint.',
    });
  }

  // Hash SHA-256 de la key recibida
  const keyHash = createHash('sha256').update(key).digest('hex');

  // Buscar en BD
  const record = await getTenantByApiKey(keyHash);

  if (record) {
    // Tenant encontrado en BD — adjuntar al request
    req.tenantId = record.tenant_id;
    req.tenant   = record.tenants;
    req.keyScope = record.scope;
    logger.info({ tenant_id: req.tenantId }, 'API key válida — tenant identificado');
    return next();
  }

  // Fallback — comparar con la key estática del .env (para desarrollo)
  if (!safeCompare(key, config.quickpos.apiKey)) {
    logger.warn({ ip: req.ip }, 'API key inválida');
    return res.status(403).json({
      error:   'FORBIDDEN',
      message: 'API key inválida.',
    });
  }

  // Key estática válida — sin tenant en BD
  req.tenantId = null;
  next();
}

function safeCompare(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
