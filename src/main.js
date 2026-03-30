// src/main.js
// ═══════════════════════════════════════════════════════════════
// Entry point del frontend FacturaCL.
// Orquesta la navegación entre vistas e inicializa componentes.
// ═══════════════════════════════════════════════════════════════

import { fetchToken }     from './api/koywe.js';
import { Dashboard }      from './components/Dashboard.js';
import { DocumentForm }   from './components/DocumentForm.js';
import { DocsList }       from './components/DocsList.js';
import { initModal }      from './components/modal.js';
import { notify }         from './components/notify.js';
import { setState, getState } from './lib/state.js';

// ── Instancias de componentes ──────────────────────────────────
let _dashboard = null;
let _docForm   = null;
let _docsList  = null;

// ── Navegación ────────────────────────────────────────────────

const VIEWS = ['dashboard', 'nueva', 'docs', 'config'];

export function gotoView(name) {
  VIEWS.forEach(v => {
    document.getElementById(`view-${v}`)?.classList.toggle('active', v === name);
    document.getElementById(`nb-${v}`)?.classList.toggle('active',   v === name);
  });
}

// Exponer globalmente para los onclick del HTML
window.gotoView = gotoView;

// ── Init ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initModal();

  // Instanciar componentes
  _dashboard = new Dashboard(
    document.getElementById('view-dashboard'),
    { onNewDoc: (type) => { _docForm?.selectType(type); gotoView('nueva'); } }
  );

  _docForm = new DocumentForm(document.getElementById('view-nueva'));

  _docsList = new DocsList(document.getElementById('view-docs'));

  // Config view — solo lectura de datos del emisor del servidor
  await loadIssuerConfig();

  // Conectar con Koywe
  await authenticate();

  // Mostrar dashboard por defecto
  gotoView('dashboard');

  // Escuchar mensajes de QuickPOS (iframe mode)
  window.addEventListener('message', handlePosMessage);
});

// ── Autenticación ─────────────────────────────────────────────

async function authenticate() {
  setConnStatus('connecting', 'Conectando con Koywe…');
  try {
    const token = await fetchToken();
    setState({ token, tokenExpires: Date.now() + 55 * 60 * 1000 });
    setConnStatus('connected', 'Conectado · Koywe Sandbox');
    notify('Conectado con Koywe Sandbox', 'success', 3000);
  } catch (e) {
    setConnStatus('error', 'Error de conexión');
    notify(`Error al conectar: ${e.message}`, 'error');
  }
}

function setConnStatus(status, label) {
  setState({ connStatus: status });
  const dot = document.getElementById('conn-dot');
  const lbl = document.getElementById('conn-label');
  if (dot) dot.className  = `conn-dot ${status}`;
  if (lbl) lbl.textContent = label;
}

// ── Configuración del emisor ──────────────────────────────────
// Carga los datos del emisor desde el servidor (no del frontend)

async function loadIssuerConfig() {
  try {
    const res    = await fetch('/health');
    const health = await res.json();
    // En el futuro podría haber un endpoint /api/config/issuer
    // Por ahora usamos los datos que ya vienen en el HTML
    const issuer = {
      rut:       document.getElementById('cfg-rut')?.value ?? '',
      legalName: document.getElementById('cfg-razon')?.value ?? '',
      activity:  document.getElementById('cfg-giro')?.value ?? '',
      address:   document.getElementById('cfg-addr')?.value ?? '',
      city:      document.getElementById('cfg-city')?.value ?? '',
      district:  document.getElementById('cfg-district')?.value ?? 'Santiago',
    };
    setState({ issuer });
    const topRut = document.getElementById('top-rut');
    if (topRut) topRut.textContent = issuer.rut;
  } catch (_) {
    // no-op — continuamos sin los datos del emisor en el estado
  }
}

// ── Integración QuickPOS via postMessage ──────────────────────

/**
 * QuickPOS puede enviar mensajes al iframe de FacturaCL.
 * Protocolo:
 *   { type: 'FCL_EMIT', payload: { document_type, items, receiver? } }
 *   { type: 'FCL_GOTO', view: 'nueva' | 'docs' | 'dashboard' }
 */
function handlePosMessage(event) {
  // Validar origen del mensaje (solo aceptar de orígenes conocidos)
  const allowed = window.__FCL_ALLOWED_ORIGINS__ ?? [];
  if (allowed.length && !allowed.includes(event.origin)) return;

  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'FCL_GOTO':
      if (VIEWS.includes(msg.view)) gotoView(msg.view);
      break;

    case 'FCL_NEW_DOC':
      // QuickPOS pre-carga ítems en el formulario
      if (_docForm && msg.docType) {
        _docForm.selectType(msg.docType);
        gotoView('nueva');
        if (msg.items?.length) {
          _docForm._table?.setItems(msg.items);
        }
      }
      break;

    default:
      break;
  }
}

// ── Config view — guardar cambios del emisor ──────────────────

window.saveIssuerConfig = function () {
  const issuer = {
    rut:       document.getElementById('cfg-rut')?.value?.trim() ?? '',
    legalName: document.getElementById('cfg-razon')?.value?.trim() ?? '',
    activity:  document.getElementById('cfg-giro')?.value?.trim() ?? '',
    address:   document.getElementById('cfg-addr')?.value?.trim() ?? '',
    city:      document.getElementById('cfg-city')?.value?.trim() ?? '',
    district:  document.getElementById('cfg-district')?.value?.trim() ?? '',
  };
  setState({ issuer });
  const topRut = document.getElementById('top-rut');
  if (topRut) topRut.textContent = issuer.rut;
  notify('Configuración guardada', 'success');
};

window.testConnection = async function () {
  notify('Probando conexión…', 'info', 2000);
  await authenticate();
};
