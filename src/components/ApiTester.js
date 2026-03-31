// src/components/ApiTester.js
// Panel para probar endpoints de Koywe directamente desde la UI

import { getState } from '../lib/state.js';
import { notify }   from './notify.js';

const TODAY = new Date().toISOString().slice(0, 10);

const QUICK_CALLS = {
  auth: {
    method: 'POST',
    endpoint: '/api/koywe/token',
    body: '',
    note: 'Obtiene el access_token actual del servidor',
  },
  boleta: {
    method: 'POST',
    endpoint: '/api/koywe/documents',
    body: JSON.stringify({
      header: {
        document_type_id:     '37',
        received_issued_flag: 1,
        issue_date:           TODAY,
        issuer_tax_id_code:   '76399932-7',
        issuer_tax_id_type:   'CL-RUT',
        issuer_legal_name:    'Empresa Demo Chile SpA',
        issuer_address:       'Av. Libertador 1234',
        issuer_district:      'Santiago',
        issuer_city:          'Santiago',
        issuer_country_id:    '253',
        issuer_activity:      'Comidas rápidas y bebidas',
        currency_id:          39,
      },
      details: [{
        quantity:          1,
        line_description:  'Producto de prueba',
        unit_measure:      'UN',
        unit_price:        3781.512605,
        total_amount_line: 3781.512605,
        total_taxes:       718.487395,
        taxes: [{ tax_type_id: '387', tax_percentage: 19, tax_amount: 718.487395 }],
      }],
      totals: { net_amount: 3781, taxes_amount: 719, total_amount: 4500 },
    }, null, 2),
  },
  factura: {
    method: 'POST',
    endpoint: '/api/koywe/documents',
    body: JSON.stringify({
      header: {
        document_type_id:     '2',
        received_issued_flag: 1,
        issue_date:           TODAY,
        issuer_tax_id_code:   '76399932-7',
        issuer_tax_id_type:   'CL-RUT',
        issuer_legal_name:    'Empresa Demo Chile SpA',
        issuer_city:          'Santiago',
        issuer_country_id:    '253',
        issuer_activity:      'Comidas rápidas',
        receiver_tax_id_code: '76399932-7',
        receiver_tax_id_type: 'CL-RUT',
        receiver_legal_name:  'Cliente Empresa SpA',
        receiver_city:        'Santiago',
        receiver_country_id:  '253',
        receiver_activity:    'Servicios',
        receiver_district:    'Santiago',
        currency_id:          39,
      },
      details: [{
        quantity:          2,
        line_description:  'Servicio de catering',
        unit_measure:      'UN',
        unit_price:        42016.806723,
        total_amount_line: 84033.613445,
        total_taxes:       15966.386555,
        taxes: [{ tax_type_id: '387', tax_percentage: 19, tax_amount: 15966.386555 }],
      }],
      totals: { net_amount: 84034, taxes_amount: 15966, total_amount: 100000 },
    }, null, 2),
  },
  nc: {
    method: 'POST',
    endpoint: '/api/koywe/documents',
    body: JSON.stringify({
      header: {
        document_type_id:     '16',
        received_issued_flag: 1,
        issue_date:           TODAY,
        issuer_tax_id_code:   '76399932-7',
        issuer_tax_id_type:   'CL-RUT',
        issuer_legal_name:    'Empresa Demo Chile SpA',
        issuer_city:          'Santiago',
        issuer_country_id:    '253',
        receiver_tax_id_code: '66666666-6',
        receiver_tax_id_type: 'CL-RUT',
        receiver_legal_name:  'SIN NOMBRE',
        receiver_country_id:  '253',
        receiver_district:    'Santiago',
        currency_id:          39,
      },
      details: [{
        quantity:          1,
        line_description:  'Anulacion de venta',
        unit_measure:      'UN',
        unit_price:        3781.512605,
        total_amount_line: 3781.512605,
        total_taxes:       718.487395,
        taxes: [{ tax_type_id: '387', tax_percentage: 19, tax_amount: 718.487395 }],
      }],
      references: [{
        document_type_id: 37,
        reference_number: '999',
        reference_code:   1,
        description:      'Anulacion',
        reference_date:   TODAY,
      }],
      totals: { net_amount: 3781, taxes_amount: 719, total_amount: 4500 },
    }, null, 2),
  },
  getDocs: {
    method: 'GET',
    endpoint: '/api/koywe/documents',
    body: '',
  },
  posEmit: {
    method: 'POST',
    endpoint: '/api/pos/emit',
    body: JSON.stringify({
      document_type: '37',
      items: [{ description: 'Café americano', quantity: 1, unit_price: 2500 }],
      pos_sale_id:  'TEST-001',
      pos_terminal: 'CAJA-1',
    }, null, 2),
    needsApiKey: true,
  },
};

export class ApiTester {
  constructor(container) {
    this._root = container;
    this._render();
  }

  _render() {
    this._root.innerHTML = `
      <div class="page-title">API Tester</div>
      <div class="page-sub">Prueba los endpoints de FacturaCL y Koywe directamente desde aquí</div>

      <div class="hl hl-blue">
        ℹ Las llamadas van al servidor de FacturaCL (<strong>/api/koywe/*</strong>),
        que actúa como proxy seguro hacia Koywe. Las credenciales nunca salen del servidor.
      </div>

      <!-- Quick calls -->
      <div class="card">
        <div class="card-hdr"><div class="card-title">Llamadas rápidas</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="tb-btn" id="qc-auth">🔑 Token</button>
          <button class="tb-btn" id="qc-boleta">🧾 Crear boleta</button>
          <button class="tb-btn" id="qc-factura">📋 Crear factura</button>
          <button class="tb-btn" id="qc-nc">↩ Nota crédito</button>
          <button class="tb-btn" id="qc-getDocs">📄 Listar documentos</button>
          <button class="tb-btn" id="qc-posEmit" style="border-color:#c7d3ff;color:var(--accent)">⚡ POS Emit</button>
        </div>
      </div>

      <!-- Request / Response -->
      <div class="api-panel">
        <div class="api-col">
          <div class="api-col-title">Request</div>
          <div class="api-method-bar">
            <select class="fs" id="api-method" style="width:90px;font-family:var(--mono);font-size:12px">
              <option>POST</option>
              <option>GET</option>
              <option>PATCH</option>
              <option>DELETE</option>
            </select>
            <input class="fi mono" id="api-endpoint" value="/api/koywe/token" style="flex:1;font-size:12px">
            <button class="run-btn" id="api-run">▶ Ejecutar</button>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:6px">
            Para <strong>/api/pos/emit</strong> se agrega X-API-Key automáticamente
          </div>
          <textarea class="fta mono" id="api-body" rows="14" placeholder="Body JSON (vacío para GET)"
            style="font-size:11px;line-height:1.6;resize:vertical"></textarea>
        </div>

        <div class="api-col">
          <div class="api-col-title" style="display:flex;align-items:center;gap:8px">
            Response
            <span id="api-status-badge"></span>
            <span id="api-time" style="font-size:10px;color:var(--text3);font-family:var(--mono)"></span>
          </div>
          <div class="code-area" id="api-response">// La respuesta aparecerá aquí</div>
        </div>
      </div>
    `;

    // Quick call buttons
    Object.keys(QUICK_CALLS).forEach(key => {
      this._root.querySelector(`#qc-${key}`)?.addEventListener('click', () => this._loadQuickCall(key));
    });

    this._root.querySelector('#api-run').addEventListener('click', () => this._run());
  }

  _loadQuickCall(key) {
    const qc = QUICK_CALLS[key];
    if (!qc) return;
    this._root.querySelector('#api-method').value    = qc.method;
    this._root.querySelector('#api-endpoint').value  = qc.endpoint;
    this._root.querySelector('#api-body').value      = qc.body ?? '';
  }

  async _run() {
    const method   = this._root.querySelector('#api-method').value;
    const endpoint = this._root.querySelector('#api-endpoint').value.trim();
    const bodyText = this._root.querySelector('#api-body').value.trim();
    const resEl    = this._root.querySelector('#api-response');
    const statusEl = this._root.querySelector('#api-status-badge');
    const timeEl   = this._root.querySelector('#api-time');

    resEl.textContent   = '// Ejecutando…';
    resEl.style.color   = 'var(--text3)';
    statusEl.innerHTML  = '';
    timeEl.textContent  = '';

    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

    // Agregar API key si es un endpoint POS
    if (endpoint.includes('/api/pos/')) {
      headers['X-API-Key'] = 'facturacl_pos_2024_clave_secreta';
    }

    const t0 = Date.now();
    try {
      const opts = { method, headers };
      if (method !== 'GET' && bodyText) opts.body = bodyText;

      const resp    = await fetch(endpoint, opts);
      const elapsed = Date.now() - t0;
      const text    = await resp.text();

      let display = text;
      try {
        display = JSON.stringify(JSON.parse(text), null, 2);
      } catch (_) {}

      resEl.textContent = display;
      resEl.style.color = resp.ok ? '#22c97a' : '#f04f4f';
      timeEl.textContent = `${elapsed}ms`;

      const cls = resp.ok ? 'badge-ok' : 'badge-err';
      statusEl.innerHTML = `<span class="badge ${cls}">${resp.status} ${resp.ok ? 'OK' : 'Error'}</span>`;

      if (!resp.ok) notify(`Error ${resp.status}`, 'error', 3000);

    } catch (e) {
      const elapsed = Date.now() - t0;
      resEl.textContent = `// Error de red: ${e.message}\n// Tiempo: ${elapsed}ms`;
      resEl.style.color = '#f04f4f';
      timeEl.textContent = `${elapsed}ms`;
      statusEl.innerHTML = `<span class="badge badge-err">Network Error</span>`;
    }
  }
}
