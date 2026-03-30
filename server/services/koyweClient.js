// server/services/koyweClient.js
// ═══════════════════════════════════════════════════════════════
// Cliente HTTP hacia la API de Koywe Billing.
//
// Características:
//   • Caché del token con renovación automática (55 min)
//   • Timeout configurable por llamada
//   • Retry automático con backoff exponencial (2xx/5xx/timeout)
//   • Mapeo de errores HTTP a KoyweError con código semántico
//   • Las credenciales NUNCA se exponen fuera de este módulo
// ═══════════════════════════════════════════════════════════════

import { config } from '../config/index.js';
import logger from '../middleware/logger.js';

// ── Clase de error tipado ─────────────────────────────────────

export class KoyweError extends Error {
  /**
   * @param {string} code   - Código semántico (AUTH_FAILED, TIMEOUT, etc.)
   * @param {string} message
   * @param {number} statusCode - HTTP status a retornar al cliente
   * @param {object} [detail]   - Datos extra del error original de Koywe
   */
  constructor(code, message, statusCode = 500, detail = null) {
    super(message);
    this.name       = 'KoyweError';
    this.code       = code;
    this.statusCode = statusCode;
    this.detail     = detail;
  }
}

// ── Token cache (en memoria) ──────────────────────────────────

let _token    = null;
let _tokenExp = 0;

/**
 * Retorna el access_token vigente.
 * Si expiró o no existe, autentica y cachea uno nuevo.
 */
export async function getToken() {
  if (_token && Date.now() < _tokenExp) {
    return _token;
  }

  logger.info('Renovando token Koywe…');

  const data = await _request({
    method: 'POST',
    path:   '/V1/auth',
    body: {
      grant_type:    'password',
      client_id:     config.koywe.clientId,
      client_secret: config.koywe.clientSecret,
      username:      config.koywe.username,
      password:      config.koywe.password,
    },
    // Auth no necesita token; tampoco retries (credenciales incorrectas → falla inmediata)
    skipAuth: true,
    retries:  0,
  });

  if (!data.access_token) {
    throw new KoyweError('AUTH_FAILED', 'Koywe no retornó access_token', 502, data);
  }

  _token    = data.access_token;
  _tokenExp = Date.now() + 55 * 60 * 1000; // 55 minutos
  logger.info('Token Koywe renovado correctamente');

  return _token;
}

/** Fuerza renovación del token (útil al recibir 401 de Koywe) */
export function invalidateToken() {
  _token    = null;
  _tokenExp = 0;
}

// ── API pública ───────────────────────────────────────────────

/**
 * Emite un documento DTE.
 * @param {object} payload - Documento validado por Zod
 * @returns {object} Respuesta de Koywe
 */
export async function createDocument(payload) {
  const token = await getToken();
  return _request({ method: 'POST', path: '/V1/documents', body: payload, token });
}

/**
 * Obtiene un documento por ID.
 * @param {string} documentId
 */
export async function getDocument(documentId) {
  const token = await getToken();
  return _request({ method: 'GET', path: `/V1/documents/${documentId}`, token });
}

/**
 * Lista documentos de una cuenta.
 * @param {object} params - Query params (account_id, page, etc.)
 */
export async function listDocuments(params = {}) {
  const token = await getToken();
  const qs    = new URLSearchParams({ account_id: config.koywe.accountId, ...params }).toString();
  return _request({ method: 'GET', path: `/V1/documents?${qs}`, token });
}

// ── HTTP core con retry y timeout ────────────────────────────

/**
 * Ejecuta una llamada HTTP a Koywe.
 * @private
 */
async function _request({ method, path, body, token, skipAuth = false, retries = 2, attempt = 1 }) {
  const url        = `${config.koywe.baseUrl}${path}`;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), config.koywe.timeoutMs);

  const headers = {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
  };

  if (!skipAuth && token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const startMs = Date.now();

  try {
    const res = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      body:   body ? JSON.stringify(body) : undefined,
    });

    clearTimeout(timer);
    const elapsed = Date.now() - startMs;

    // Parsear respuesta (Koywe siempre retorna JSON)
    const data = await res.json().catch(() => ({}));

    logger.debug({ method, path, status: res.status, ms: elapsed }, 'Koywe response');

    // 401 → token expirado → invalidar y reintentar UNA vez
    if (res.status === 401 && !skipAuth && attempt === 1) {
      logger.warn('Token rechazado por Koywe, renovando…');
      invalidateToken();
      const freshToken = await getToken();
      return _request({ method, path, body, token: freshToken, retries: 0, attempt: 2 });
    }

    // 429 o 5xx → retry con backoff exponencial
    if ((res.status === 429 || res.status >= 500) && retries > 0) {
      const delay = 300 * Math.pow(2, attempt - 1); // 300ms, 600ms, 1200ms...
      logger.warn({ status: res.status, delay, retries }, 'Koywe error temporal, reintentando…');
      await _sleep(delay);
      return _request({ method, path, body, token, retries: retries - 1, attempt: attempt + 1 });
    }

    // Error de negocio de Koywe (4xx)
    if (!res.ok) {
      const msg = data?.message || data?.error_message || `Error ${res.status} de Koywe`;
      throw new KoyweError(
        data?.error || `HTTP_${res.status}`,
        msg,
        res.status,
        data
      );
    }

    return data;

  } catch (err) {
    clearTimeout(timer);

    // Timeout
    if (err.name === 'AbortError') {
      if (retries > 0) {
        logger.warn({ retries }, 'Koywe timeout, reintentando…');
        await _sleep(500);
        return _request({ method, path, body, token, retries: retries - 1, attempt: attempt + 1 });
      }
      throw new KoyweError(
        'TIMEOUT',
        `Koywe no respondió en ${config.koywe.timeoutMs}ms`,
        504
      );
    }

    // Error de red (DNS, conexión rechazada, etc.)
    if (err instanceof TypeError && retries > 0) {
      logger.warn({ message: err.message, retries }, 'Error de red, reintentando…');
      await _sleep(400);
      return _request({ method, path, body, token, retries: retries - 1, attempt: attempt + 1 });
    }

    // Relanzar errores ya tipados
    if (err instanceof KoyweError) throw err;

    throw new KoyweError('NETWORK_ERROR', err.message, 502);
  }
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
