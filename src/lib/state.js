// src/lib/state.js
// ═══════════════════════════════════════════════════════════════
// Store global minimalista — pub/sub sin dependencias externas.
// Pensado para escalar a un store más robusto (Zustand, etc.)
// cuando se migre a React/Vue si QuickPOS lo requiere.
// ═══════════════════════════════════════════════════════════════

const _state = {
  // Auth
  token:       null,
  tokenExpires: 0,
  connStatus:  'disconnected', // 'connecting' | 'connected' | 'error'

  // Formulario activo
  currentDocType: '37',
  items: [],          // [{ id, description, quantity, unit_price }]

  // Historial de la sesión
  docs:  [],          // [{ document_id, doc_number, type, total, date, status, raw }]
  stats: { total: 0, boletas: 0, facturas: 0, nc: 0 },

  // Configuración del emisor (leída del servidor al iniciar)
  issuer: {
    rut:       '',
    legalName: '',
    activity:  '',
    address:   '',
    city:      '',
  },
};

// ── Subscriptores ─────────────────────────────────────────────
const _listeners = {};

/**
 * Suscribirse a cambios de una clave del state.
 * @param {string}   key      - Clave del estado ('token', 'docs', etc.)
 * @param {Function} callback - fn(newValue, oldValue)
 * @returns {Function} unsub  - Llama para cancelar la suscripción
 */
export function subscribe(key, callback) {
  if (!_listeners[key]) _listeners[key] = new Set();
  _listeners[key].add(callback);
  return () => _listeners[key].delete(callback);
}

/**
 * Actualiza una o más claves del estado y notifica a los suscriptores.
 * @param {object} patch - { key: value }
 */
export function setState(patch) {
  for (const [key, value] of Object.entries(patch)) {
    const old = _state[key];
    _state[key] = value;
    if (_listeners[key]) {
      _listeners[key].forEach(cb => cb(value, old));
    }
  }
}

/**
 * Lee una clave del estado actual.
 * @param {string} key
 * @returns {*}
 */
export function getState(key) {
  return _state[key];
}

/** Snapshot completo del estado (solo lectura) */
export function getSnapshot() {
  return { ..._state };
}
