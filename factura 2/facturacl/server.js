// ═══════════════════════════════════════════════════════════════
// FacturaCL — Servidor de producción
// Node.js puro (sin Express) — cero dependencias pesadas
// 
// Hace 3 cosas:
//   1. Sirve el HTML del módulo de facturación
//   2. Actúa como proxy hacia api-billing.koywe.com (resuelve CORS)
//   3. Expone /health para que Railway sepa que el servidor está vivo
// ═══════════════════════════════════════════════════════════════

const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');

const PORT        = process.env.PORT || 3000;
const KOYWE_HOST  = 'api-billing.koywe.com';
const KOYWE_BASE  = `https://${KOYWE_HOST}`;

// ── MIME types ──────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

// ── CORS headers ────────────────────────────────────────────────
function addCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
}

// ── Proxy a Koywe ───────────────────────────────────────────────
function proxyToKoywe(req, res, koywePathAndQuery) {
  const targetUrl  = `${KOYWE_BASE}${koywePathAndQuery}`;
  const parsedUrl  = url.parse(targetUrl);

  const forwardHeaders = {
    'Host':         KOYWE_HOST,
    'Content-Type': req.headers['content-type']  || 'application/json',
    'Accept':       req.headers['accept']        || '*/*',
  };
  if (req.headers['authorization']) {
    forwardHeaders['Authorization'] = req.headers['authorization'];
  }

  // Leer body del request entrante
  let body = [];
  req.on('data', chunk => body.push(chunk));
  req.on('end', () => {
    const bodyBuffer = body.length ? Buffer.concat(body) : null;
    if (bodyBuffer) {
      forwardHeaders['Content-Length'] = bodyBuffer.length;
    }

    const options = {
      hostname: parsedUrl.hostname,
      path:     parsedUrl.path,
      method:   req.method,
      headers:  forwardHeaders,
    };

    console.log(`  [PROXY] ${req.method} ${koywePathAndQuery}`);

    const proxyReq = https.request(options, proxyRes => {
      addCorsHeaders(res);
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', err => {
      console.error(`  [PROXY ERROR] ${err.message}`);
      addCorsHeaders(res);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error', detail: err.message }));
    });

    if (bodyBuffer) proxyReq.write(bodyBuffer);
    proxyReq.end();
  });
}

// ── Servir archivo estático ─────────────────────────────────────
function serveStatic(req, res, filePath) {
  const ext      = path.extname(filePath).toLowerCase();
  const mimeType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    addCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

// ── Router principal ────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  const pathname  = parsedUrl.pathname;

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    addCorsHeaders(res);
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check (Railway lo usa para saber que el servidor está vivo)
  if (pathname === '/health') {
    addCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'FacturaCL', ts: new Date().toISOString() }));
    return;
  }

  // Proxy hacia Koywe — cualquier ruta que empiece con /koywe-proxy/
  if (pathname.startsWith('/koywe-proxy/')) {
    const koywePathAndQuery = req.url.replace('/koywe-proxy', '');
    proxyToKoywe(req, res, koywePathAndQuery);
    return;
  }

  // Raíz → servir el HTML principal
  if (pathname === '/' || pathname === '/index.html') {
    serveStatic(req, res, path.join(__dirname, 'public', 'index.html'));
    return;
  }

  // Cualquier otro archivo estático en /public
  const staticFile = path.join(__dirname, 'public', pathname);
  if (fs.existsSync(staticFile) && fs.statSync(staticFile).isFile()) {
    serveStatic(req, res, staticFile);
    return;
  }

  // 404
  addCorsHeaders(res);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path: pathname }));
});

// ── Start ───────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║     FacturaCL × Koywe — Servidor en línea        ║
╚══════════════════════════════════════════════════╝

  ✓ Puerto: ${PORT}
  ✓ Proxy: /koywe-proxy → ${KOYWE_BASE}
  ✓ Health: /health

`);
});

server.on('error', err => {
  console.error('Server error:', err.message);
  process.exit(1);
});
