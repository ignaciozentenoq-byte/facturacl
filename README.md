# FacturaCL v2.0 — Módulo de Facturación Electrónica

Módulo profesional de facturación electrónica vía [Koywe Billing API](https://koywe.com).
Soporta boletas, facturas y notas de crédito para Chile (SII).

Diseñado para funcionar en **dos modos**:
- **Manual / embebido** — UI standalone o como `<iframe>` dentro de QuickPOS
- **Caja nativa** — API REST que QuickPOS llama directamente al emitir una venta

---

## Stack tecnológico

| Capa | Tecnología | Por qué |
|---|---|---|
| Servidor | Node.js 20 + Express | Mismo stack que QuickPOS, sin fricción |
| Validación | Zod | Schemas tipados, mensajes en español |
| Logging | Pino | JSON estructurado, compatible con Railway/Azure |
| Frontend | Vite + ES Modules | Build rápido, sin frameworks pesados |
| Seguridad | Helmet + express-rate-limit | Headers seguros, rate limiting por capa |
| Deploy | Docker multi-stage | Railway ahora → Azure Container Apps después |
| Tests | Vitest | Rápido, compatible con ESM |
| CI/CD | GitHub Actions | Tests + build en cada PR |

---

## Estructura del proyecto

```
facturacl/
├── server/
│   ├── config/index.js          # Carga y valida variables de entorno
│   ├── middleware/
│   │   ├── apiKeyAuth.js        # Protege /api/pos/* (QuickPOS)
│   │   ├── cors.js              # CORS por entorno
│   │   ├── logger.js            # Pino + middleware Express
│   │   └── rateLimiter.js       # Rate limiting por capa
│   ├── routes/
│   │   ├── health.js            # GET /health
│   │   ├── koywe.js             # /api/koywe/* (UI manual)
│   │   └── pos.js               # /api/pos/* (caja nativa)
│   ├── services/
│   │   ├── documentBuilder.js   # Construye payload Koywe
│   │   └── koyweClient.js       # HTTP client con retry/timeout/cache
│   ├── validators/
│   │   ├── documentSchema.js    # Zod schemas DTE
│   │   └── rut.js               # Validación RUT chileno
│   └── index.js                 # Entry point Express
├── src/                         # Frontend (Vite)
│   ├── api/koywe.js             # Fetch wrapper → /api/koywe
│   ├── components/
│   │   ├── Dashboard.js
│   │   ├── DocsList.js
│   │   ├── DocumentForm.js
│   │   ├── ItemsTable.js
│   │   ├── modal.js
│   │   └── notify.js
│   ├── lib/
│   │   ├── rut.js               # Helpers RUT (cliente)
│   │   ├── state.js             # Store global pub/sub
│   │   └── tax.js               # Lógica tributaria (cliente)
│   ├── styles/
│   │   ├── main.css
│   │   └── variables.css
│   ├── index.html
│   └── main.js                  # Orquestador SPA
├── tests/
│   └── unit/
│       ├── documentSchema.test.js
│       ├── rut.test.js
│       └── tax.test.js
├── .env.example
├── .github/workflows/ci.yml
├── Dockerfile
├── package.json
├── vite.config.js
└── vitest.config.js
```

---

## Setup local (5 minutos)

### 1. Clonar y configurar

```bash
git clone https://github.com/tu-usuario/facturacl.git
cd facturacl
cp .env.example .env
```

### 2. Editar `.env`

```bash
# Las credenciales sandbox ya vienen pre-configuradas en .env.example
# Solo necesitas cambiar QUICKPOS_API_KEY por un valor propio:
QUICKPOS_API_KEY=mi_api_key_secreto_aqui
```

### 3. Instalar y levantar

```bash
npm install
npm run dev        # Levanta servidor (3000) + Vite dev server (5173)
```

Abre **http://localhost:5173** — ya está conectado a Koywe Sandbox.

---

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `KOYWE_CLIENT_ID` | ✅ | Client ID de Koywe |
| `KOYWE_CLIENT_SECRET` | ✅ | Client Secret (nunca en frontend) |
| `KOYWE_USERNAME` | ✅ | Usuario de autenticación |
| `KOYWE_PASSWORD` | ✅ | Contraseña |
| `KOYWE_ACCOUNT_ID` | ✅ | ID de cuenta Koywe |
| `ISSUER_RUT` | ✅ | RUT del emisor |
| `ISSUER_LEGAL_NAME` | ✅ | Razón social |
| `ISSUER_ACTIVITY` | ✅ | Giro del negocio |
| `ISSUER_ADDRESS` | ✅ | Dirección |
| `ISSUER_DISTRICT` | ✅ | Comuna |
| `ISSUER_CITY` | ✅ | Ciudad |
| `QUICKPOS_API_KEY` | ✅ | API key para el endpoint de caja |
| `ALLOWED_ORIGINS` | ✅ | Orígenes CORS permitidos (separados por coma) |
| `PORT` | — | Puerto (default: 3000) |
| `NODE_ENV` | — | `development` o `production` |
| `KOYWE_BASE_URL` | — | URL base Koywe (default: https://api-billing.koywe.com) |
| `LOG_LEVEL` | — | `info` (default) |
| `LOG_PRETTY` | — | `true` en dev para logs legibles |

---

## Deploy en Railway

### Opción A: desde GitHub (recomendado)

1. Sube el proyecto a GitHub
2. En Railway: **New Project → Deploy from GitHub repo**
3. Railway detecta el `Dockerfile` automáticamente
4. En **Variables** agrega todas las variables de `.env.example`
5. Railway hace el deploy en cada push a `main`

### Opción B: Docker local

```bash
# Build
docker build -t facturacl .

# Run
docker run --env-file .env -p 3000:3000 facturacl
```

---

## Deploy en Azure (migración futura)

El Dockerfile está listo para Azure Container Apps:

```bash
# 1. Build y push a Azure Container Registry
az acr build --registry miregistry --image facturacl:latest .

# 2. Deploy en Container Apps
az containerapp create \
  --name facturacl \
  --resource-group mi-rg \
  --image miregistry.azurecr.io/facturacl:latest \
  --env-vars KOYWE_CLIENT_ID=... KOYWE_ACCOUNT_ID=... \
  --min-replicas 1 --max-replicas 3 \
  --ingress external --target-port 3000
```

---

## Integración con QuickPOS

### Modo 1: Iframe embebido (UI manual)

```html
<!-- En QuickPOS, embeder el módulo de facturación -->
<iframe
  id="facturacl-frame"
  src="https://facturacl.railway.app"
  width="100%"
  height="800px"
  frameborder="0"
></iframe>

<script>
// Pre-cargar ítems desde una venta del POS
document.getElementById('facturacl-frame').contentWindow.postMessage({
  type:     'FCL_NEW_DOC',
  docType:  '37',
  items: [
    { description: 'Hamburguesa clásica', quantity: 2, unit_price: 4500 },
    { description: 'Bebida 350ml',        quantity: 1, unit_price: 1500 },
  ],
}, 'https://facturacl.railway.app');
</script>
```

### Modo 2: Caja nativa (API REST)

Al cerrar una venta en QuickPOS, llama directamente:

```javascript
// En QuickPOS — emitir boleta al cerrar una venta
const response = await fetch('https://facturacl.railway.app/api/pos/emit', {
  method:  'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key':    process.env.FACTURACL_API_KEY,
  },
  body: JSON.stringify({
    document_type: '37',       // boleta
    items: [
      { description: 'Hamburguesa clásica', quantity: 2, unit_price: 4500 },
      { description: 'Bebida 350ml',        quantity: 1, unit_price: 1500 },
    ],
    pos_sale_id:  'VENTA-001234',    // para trazabilidad
    pos_terminal: 'CAJA-1',
  }),
});

const dte = await response.json();
// dte.ok = true
// dte.doc_number = "B-000123"
// dte.total = 10500
// dte.pdf_base64 = "JVBERi0x..." (para imprimir)
```

#### Para factura electrónica desde caja:

```javascript
{
  document_type: '2',
  items: [...],
  receiver: {
    rut:      '76399932-7',
    name:     'Empresa Cliente SpA',
    giro:     'Comercio al por menor',
    district: 'Providencia',
    city:     'Santiago',
  }
}
```

#### Respuesta del endpoint POS:

```json
{
  "ok":         true,
  "document_id": "kyw_doc_abc123",
  "doc_number":  "B-000123",
  "type":        "37",
  "total":       10500,
  "issued_at":   "2024-01-15T14:30:00.000Z",
  "has_pdf":     true,
  "pdf_base64":  "JVBERi0x...",
  "sii_status":  "accepted",
  "pos_sale_id": "VENTA-001234"
}
```

---

## Tests

```bash
npm test                # Corre todos los tests
npm run test:coverage   # Con cobertura
npm run test:watch      # Watch mode
```

Tests unitarios incluidos:
- `tests/unit/rut.test.js` — Validación RUT (9 casos)
- `tests/unit/tax.test.js` — Cálculos tributarios IVA
- `tests/unit/documentSchema.test.js` — Schemas Zod

---

## Endpoints del servidor

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | Ninguna | Health check |
| GET | `/api/koywe/token` | Ninguna | Obtener access_token |
| POST | `/api/koywe/documents` | Ninguna | Emitir DTE (UI) |
| GET | `/api/koywe/documents` | Ninguna | Listar documentos |
| GET | `/api/koywe/documents/:id` | Ninguna | Ver documento |
| POST | `/api/pos/emit` | `X-API-Key` | **Emitir DTE desde caja** |
| GET | `/api/pos/health` | `X-API-Key` | Health check POS |

---

## Seguridad implementada

- ✅ Credenciales **nunca en el frontend** — solo variables de entorno
- ✅ `account_id` forzado desde el servidor — cliente no puede cambiarlo
- ✅ **Helmet** — headers HTTP seguros (CSP, HSTS, etc.)
- ✅ **CORS restringido** — solo orígenes de `ALLOWED_ORIGINS`
- ✅ **Rate limiting** por capa (60 req/min global, 20 DTEs/min, 120 req/min caja)
- ✅ **API key** para endpoint de caja (comparación en tiempo constante)
- ✅ **Validación Zod** server-side — no se confía en el cliente
- ✅ **Logs redactados** — client_secret y password nunca aparecen en logs
- ✅ **Docker non-root** — proceso corre como usuario `facturacl` (uid 1001)
- ✅ **Graceful shutdown** — Railway/Azure pueden parar el contenedor limpiamente
- ✅ **Retry con backoff** — tolerante a fallos temporales de Koywe

---

## Roadmap de integración QuickPOS

- [ ] **Fase 1** (actual): FacturaCL standalone + API para caja
- [ ] **Fase 2**: QuickPOS llama a `/api/pos/emit` al cerrar cada venta
- [ ] **Fase 3**: Dashboard unificado — métricas de ventas + DTEs emitidos
- [ ] **Fase 4**: Persistencia en BD (PostgreSQL) — historial real entre sesiones
- [ ] **Fase 5**: Multi-sucursal — `pos_terminal` para filtrar por caja

---

## Licencia

MIT
