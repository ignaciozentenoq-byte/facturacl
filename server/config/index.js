// server/config/index.js
// ═══════════════════════════════════════════════════════════════
// Carga y valida variables de entorno al arrancar el servidor.
// Si falta una variable requerida → proceso termina con mensaje
// claro. Nunca se accede a process.env directamente en el resto
// del código; siempre se importa este módulo.
// ═══════════════════════════════════════════════════════════════

import 'dotenv/config';

// ── Helpers de carga ─────────────────────────────────────────

/**
 * Lee una variable requerida. Si no existe, termina el proceso
 * con un mensaje descriptivo (fail-fast).
 */
function required(name) {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    console.error(`\n[config] ❌ Variable de entorno requerida no definida: ${name}`);
    console.error('[config]    Copia .env.example a .env y completa los valores.\n');
    process.exit(1);
  }
  return val.trim();
}

/**
 * Lee una variable opcional con valor por defecto.
 */
function optional(name, defaultVal) {
  const val = process.env[name];
  return (val && val.trim() !== '') ? val.trim() : defaultVal;
}

/**
 * Lee una variable numérica. Falla si no es un entero válido.
 */
function requiredInt(name) {
  const val = required(name);
  const num = parseInt(val, 10);
  if (isNaN(num)) {
    console.error(`[config] ❌ La variable ${name} debe ser un número entero (recibido: "${val}")`);
    process.exit(1);
  }
  return num;
}

function optionalInt(name, defaultVal) {
  const val = optional(name, null);
  if (val === null) return defaultVal;
  const num = parseInt(val, 10);
  if (isNaN(num)) {
    console.error(`[config] ❌ La variable ${name} debe ser un número entero (recibido: "${val}")`);
    process.exit(1);
  }
  return num;
}

// ── Configuración exportada ───────────────────────────────────

export const config = {

  // ── Servidor ────────────────────────────────────────────────
  port:         optionalInt('PORT', 3000),
  nodeEnv:      optional('NODE_ENV', 'development'),
  isProduction: optional('NODE_ENV', 'development') === 'production',
  isDev:        optional('NODE_ENV', 'development') === 'development',

  // ── Koywe API ────────────────────────────────────────────────
  koywe: {
    baseUrl:      optional('KOYWE_BASE_URL', 'https://api-billing.koywe.com'),
    timeoutMs:    optionalInt('KOYWE_TIMEOUT_MS', 15_000),
    clientId:     required('KOYWE_CLIENT_ID'),
    clientSecret: required('KOYWE_CLIENT_SECRET'),
    username:     required('KOYWE_USERNAME'),
    password:     required('KOYWE_PASSWORD'),
    accountId:    requiredInt('KOYWE_ACCOUNT_ID'),
  },

  // ── Datos del emisor ─────────────────────────────────────────
  // Se usan como defaults; pueden sobreescribirse por documento
  issuer: {
    rut:       required('ISSUER_RUT'),
    legalName: required('ISSUER_LEGAL_NAME'),
    activity:  required('ISSUER_ACTIVITY'),
    address:   required('ISSUER_ADDRESS'),
    district:  required('ISSUER_DISTRICT'),
    city:      required('ISSUER_CITY'),
    countryId: optional('ISSUER_COUNTRY_ID', '253'),
  },

  // ── CORS ─────────────────────────────────────────────────────
  allowedOrigins: optional('ALLOWED_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),

  // ── Integración QuickPOS ─────────────────────────────────────
  // La API key protege el endpoint /api/pos/* que llama la caja
  quickpos: {
    apiKey: required('QUICKPOS_API_KEY'),
  },

  // ── Rate limiting ────────────────────────────────────────────
  rateLimit: {
    windowMs:  optionalInt('RATE_LIMIT_WINDOW_MS', 60_000),
    maxGlobal: optionalInt('RATE_LIMIT_MAX',        60),
    maxDocs:   optionalInt('RATE_LIMIT_DOCS_MAX',   20),
  },

  // ── Logs ─────────────────────────────────────────────────────
  log: {
    level:  optional('LOG_LEVEL', 'info'),
    pretty: optional('LOG_PRETTY', 'false') === 'true',
  },

};
