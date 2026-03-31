# FacturaCL — Módulo de Facturación Electrónica

Módulo standalone de facturación electrónica vía Koywe Billing API.
Soporta Chile: boletas, facturas, notas de crédito.

## Deploy en Railway (5 minutos)

1. Crear cuenta en railway.app (gratis, sin tarjeta)
2. New Project → Deploy from GitHub repo
3. Subir este código a un repo de GitHub
4. Railway lo detecta automáticamente y lo despliega

## Variables de entorno (opcional — sandbox ya viene configurado)

```
PORT=3000  # Railway lo setea automáticamente
```

## Desarrollo local

```bash
node server.js
# Abre http://localhost:3000
```

## Estructura

```
facturacl/
├── server.js          # Servidor Node.js (proxy + static files)
├── package.json
├── public/
│   └── index.html     # Módulo de facturación completo
└── README.md
```
