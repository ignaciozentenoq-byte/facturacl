// server/config/index.js
import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

function get(name, defaultVal) {
  return process.env[name]?.trim() || defaultVal;
}

export const config = {
  port:         parseInt(get('PORT', '3000'), 10),
  nodeEnv:      get('NODE_ENV', 'development'),
  isProduction: get('NODE_ENV', 'development') === 'production',
  isDev:        get('NODE_ENV', 'development') === 'development',

  koywe: {
    baseUrl:      get('KOYWE_BASE_URL',    'https://api-billing.koywe.com'),
    timeoutMs:    parseInt(get('KOYWE_TIMEOUT_MS', '15000'), 10),
    clientId:     get('KOYWE_CLIENT_ID',     'demo/001'),
    clientSecret: get('KOYWE_CLIENT_SECRET', 'ad258748356c5104df2bf4bdbabd3352'),
    username:     get('KOYWE_USERNAME',      '1.111.111-1/demoapi'),
    password:     get('KOYWE_PASSWORD',      '76be37bcc4970d29e519fca46edead19'),
    accountId:    parseInt(get('KOYWE_ACCOUNT_ID', '423'), 10),
  },

  issuer: {
    rut:       get('ISSUER_RUT',          '76399932-7'),
    legalName: get('ISSUER_LEGAL_NAME',   'Empresa Demo Chile SpA'),
    activity:  get('ISSUER_ACTIVITY',     'Comidas rápidas y bebidas'),
    address:   get('ISSUER_ADDRESS',      'Av. Libertador 1234'),
    district:  get('ISSUER_DISTRICT',     'Santiago'),
    city:      get('ISSUER_CITY',         'Santiago'),
    countryId: get('ISSUER_COUNTRY_ID',   '253'),
  },

  allowedOrigins: get('ALLOWED_ORIGINS', 'http://localhost:5173')
    .split(',').map(o => o.trim()).filter(Boolean),

  quickpos: {
    apiKey: get('QUICKPOS_API_KEY', 'dev-key-insecure'),
  },

  rateLimit: {
    windowMs:  parseInt(get('RATE_LIMIT_WINDOW_MS', '60000'), 10),
    maxGlobal: parseInt(get('RATE_LIMIT_MAX',        '60'),    10),
    maxDocs:   parseInt(get('RATE_LIMIT_DOCS_MAX',   '20'),    10),
  },

  log: {
    level:  get('LOG_LEVEL',  'info'),
    pretty: get('LOG_PRETTY', 'false') === 'true',
  },

  supabase: {
    url:        get('SUPABASE_URL',         ''),
    serviceKey: get('SUPABASE_SERVICE_KEY', ''),
    dbUrl:      get('DATABASE_URL',         ''),
  },

  defaultTenantId: get('DEFAULT_TENANT_ID', ''),
};
