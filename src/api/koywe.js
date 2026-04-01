// src/api/koywe.js
// ═══════════════════════════════════════════════════════════════
// Capa de acceso al servidor FacturaCL desde el frontend.
// El frontend NUNCA llama directamente a api-billing.koywe.com.
// Todas las llamadas van a /api/koywe/* del propio servidor.
// ═══════════════════════════════════════════════════════════════

const BASE = '/api/koywe';

/**
 * Fetch tipado con manejo de errores consistente.
 * @returns {Promise<object>} data
 * @throws  {{ code, message, issues? }}
 */
async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err      = new Error(data.message || `Error ${res.status}`);
    err.code       = data.error   || `HTTP_${res.status}`;
    err.issues     = data.issues  || null;
    err.statusCode = res.status;
    throw err;
  }

  return data;
}

/** Obtiene el access_token desde el servidor */
export async function fetchToken() {
  const data = await request('GET', '/token');
  return data.access_token;
}

/**
 * Emite un documento DTE.
 * @param {object} payload - Validado con Zod en el servidor también
 * @returns {object} Respuesta de Koywe
 */
export async function emitDocument(payload) {
  return request('POST', '/documents', payload);
}

/**
 * Lista documentos (para el historial de sesión en la UI).
 * @param {object} params - Query params opcionales
 */
export async function listDocuments(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return request('GET', `/documents${qs ? '?' + qs : ''}`);
}

/**
 * Obtiene un documento por ID.
 * @param {string} documentId
 */
export async function getDocument(documentId) {
  return request('GET', `/documents/${documentId}`);
}
/**
 * Obtiene el historial de documentos desde la BD
 */
export async function fetchHistory({ limit = 50, offset = 0 } = {}) {
  return request('GET', `/history?limit=${limit}&offset=${offset}`);
}
