// src/main.js
import { fetchToken }      from './api/koywe.js';
import { Dashboard }       from './components/Dashboard.js';
import { DocumentForm }    from './components/DocumentForm.js';
import { DocsList }        from './components/DocsList.js';
import { ApiTester }       from './components/ApiTester.js';
import { initModal }       from './components/modal.js';
import { notify }          from './components/notify.js';
import { setState, getState } from './lib/state.js';

let _dashboard = null;
let _docForm   = null;
let _docsList  = null;
let _apiTester = null;

const VIEWS = ['dashboard', 'nueva', 'docs', 'api', 'config'];

export function gotoView(name) {
  VIEWS.forEach(v => {
    document.getElementById(`view-${v}`)?.classList.toggle('active', v === name);
    document.getElementById(`nb-${v}`)?.classList.toggle('active',   v === name);
  });
}

window.gotoView = gotoView;

document.addEventListener('DOMContentLoaded', async () => {
  initModal();

  _dashboard = new Dashboard(
    document.getElementById('view-dashboard'),
    { onNewDoc: (type) => { _docForm?.selectType(type); gotoView('nueva'); } }
  );

  _docForm = new DocumentForm(document.getElementById('view-nueva'));
  _docsList = new DocsList(document.getElementById('view-docs'));
  _apiTester = new ApiTester(document.getElementById('view-api'));

  await loadIssuerConfig();
  await authenticate();
  gotoView('dashboard');
   // Cargar historial desde BD
  await loadHistory();

  window.addEventListener('message', handlePosMessage);
});

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
  if (dot) dot.className   = `conn-dot ${status}`;
  if (lbl) lbl.textContent = label;
}

async function loadIssuerConfig() {
  try {
    const res    = await fetch('/health/issuer');
    const issuer = await res.json();
    setState({ issuer });
    const topRut = document.getElementById('top-rut');
    if (topRut) topRut.textContent = issuer.rut;
    const fields = {
      'cfg-rut':      issuer.rut,
      'cfg-razon':    issuer.legalName,
      'cfg-giro':     issuer.activity,
      'cfg-addr':     issuer.address,
      'cfg-city':     issuer.city,
      'cfg-district': issuer.district,
    };
    for (const [id, val] of Object.entries(fields)) {
      const el = document.getElementById(id);
      if (el) el.value = val ?? '';
    }
  } catch (e) {
    console.warn('No se pudo cargar config del emisor:', e.message);
  }
}

function handlePosMessage(event) {
  const allowed = window.__FCL_ALLOWED_ORIGINS__ ?? [];
  if (allowed.length && !allowed.includes(event.origin)) return;
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'FCL_GOTO':
      if (VIEWS.includes(msg.view)) gotoView(msg.view);
      break;
    case 'FCL_NEW_DOC':
      if (_docForm && msg.docType) {
        _docForm.selectType(msg.docType);
        gotoView('nueva');
        if (msg.items?.length) _docForm._table?.setItems(msg.items);
      }
      break;
  }
}

window.saveIssuerConfig = function () {
  const issuer = {
    rut:       document.getElementById('cfg-rut')?.value?.trim()      ?? '',
    legalName: document.getElementById('cfg-razon')?.value?.trim()    ?? '',
    activity:  document.getElementById('cfg-giro')?.value?.trim()     ?? '',
    address:   document.getElementById('cfg-addr')?.value?.trim()     ?? '',
    city:      document.getElementById('cfg-city')?.value?.trim()     ?? '',
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
async function loadHistory() {
  try {
    const { fetchHistory } = await import('./api/koywe.js');
    const res = await fetchHistory({ limit: 50 });
    if (!res?.documents?.length) return;

    // Convertir formato BD al formato del state
    const docs = res.documents.map(d => ({
      document_id: d.id,
      doc_number:  d.doc_number,
      type:        d.type,
      total:       d.total,
      date:        new Date(d.issued_at).toLocaleDateString('es-CL'),
      status:      d.status === 'ok' ? 'ok' : 'pending',
      raw: {
        document_id:        d.id,
        electronic_document: {
          document_xml: d.xml_base64 ?? null,
          document_pdf: d.pdf_base64 ?? null,
        },
        totals: {
          net_amount:   d.net_amount,
          taxes_amount: d.tax_amount,
          total_amount: d.total,
        },
        header: {
          document_number:    d.doc_number,
          receiver_tax_id_code: d.receiver_rut  ?? null,
          receiver_legal_name:  d.receiver_name ?? null,
        },
        result: { status: d.status === 'ok' ? 0 : 1 },
      },
    }));

    setState({ docs });
    // Actualizar estadísticas
    setState({
      stats: {
        total:    docs.length,
        boletas:  docs.filter(d => d.type === '37' || d.type === '41').length,
        facturas: docs.filter(d => d.type === '2'  || d.type === '32').length,
        nc:       docs.filter(d => d.type === '16').length,
      },
    });

    notify(`${docs.length} documentos cargados desde BD`, 'info', 3000);
  } catch (e) {
    console.warn('No se pudo cargar historial:', e.message);
  }
}
