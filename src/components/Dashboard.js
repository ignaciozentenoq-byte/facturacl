// src/components/Dashboard.js

import { subscribe, getState } from '../lib/state.js';
import { fmtCLP, DOC_TYPE_LABELS } from '../lib/tax.js';

const TYPE_CHIPS = { '37':'chip-boleta','41':'chip-nc','2':'chip-factura','16':'chip-nc' };
const TYPE_SHORT = { '37':'Boleta','41':'B.Exenta','2':'Factura','16':'NC' };

export class Dashboard {
  constructor(container, { onNewDoc } = {}) {
    this._root     = container;
    this._onNewDoc = onNewDoc;
    this._render();
    this._bindState();
  }

  _render() {
    this._root.innerHTML = `
      <div class="page-title">Dashboard</div>
      <div class="page-sub">Resumen de facturación electrónica · Koywe Sandbox</div>

      <div class="hl hl-green" id="conn-banner">
        ✅ Conectado con Koywe Sandbox
      </div>

      <div class="cg cg4" style="margin-bottom:20px">
        <div class="metric">
          <div class="metric-lbl">Documentos emitidos</div>
          <div class="metric-val accent" id="m-total">0</div>
          <div class="metric-sub">en esta sesión</div>
        </div>
        <div class="metric">
          <div class="metric-lbl">Boletas emitidas</div>
          <div class="metric-val green" id="m-boletas">0</div>
          <div class="metric-sub">type 37 / 41</div>
        </div>
        <div class="metric">
          <div class="metric-lbl">Facturas emitidas</div>
          <div class="metric-val purple" id="m-facturas">0</div>
          <div class="metric-sub">type 2</div>
        </div>
        <div class="metric">
          <div class="metric-lbl">Notas de crédito</div>
          <div class="metric-val amber" id="m-nc">0</div>
          <div class="metric-sub">type 16</div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-hdr">
            <div class="card-title">Documentos recientes</div>
            <div class="card-spacer"></div>
            <button class="tb-btn" id="btn-ver-todos">Ver todos →</button>
          </div>
          <div id="recent-docs">
            <div class="empty-msg">Sin documentos aún. Emite tu primero →</div>
          </div>
        </div>

        <div class="card">
          <div class="card-hdr"><div class="card-title">Acceso rápido</div></div>
          <div id="quick-access"></div>
        </div>
      </div>
    `;

    this._renderQuickAccess();
  }

  _renderQuickAccess() {
    const items = [
      { type: '37', icon: '🧾', label: 'Boleta electrónica',  sub: 'Consumidor final · Sin datos receptor' },
      { type: '2',  icon: '📋', label: 'Factura electrónica', sub: 'Empresa · Con datos del receptor' },
      { type: '16', icon: '↩',  label: 'Nota de crédito',     sub: 'Anulación o descuento post-venta' },
    ];
    const container = this._root.querySelector('#quick-access');
    container.innerHTML = items.map(i => `
      <button class="quick-btn" data-type="${i.type}">
        <span style="font-size:22px">${i.icon}</span>
        <div>
          <div class="quick-label">${i.label}</div>
          <div class="quick-sub">${i.sub}</div>
        </div>
        <span class="quick-arrow">›</span>
      </button>
    `).join('');

    container.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => this._onNewDoc?.(btn.dataset.type));
    });
  }

  _bindState() {
    subscribe('stats', stats => {
      this._root.querySelector('#m-total').textContent    = stats.total;
      this._root.querySelector('#m-boletas').textContent  = stats.boletas;
      this._root.querySelector('#m-facturas').textContent = stats.facturas;
      this._root.querySelector('#m-nc').textContent       = stats.nc;
    });

    subscribe('docs', docs => this._renderRecent(docs));

    subscribe('connStatus', status => {
      const banner = this._root.querySelector('#conn-banner');
      if (!banner) return;
      const map = {
        connected:    { cls: 'hl-green', text: '✅ Conectado con Koywe Sandbox' },
        connecting:   { cls: 'hl-amber', text: '⏳ Conectando con Koywe…' },
        error:        { cls: 'hl-red',   text: '❌ Error de conexión con Koywe' },
        disconnected: { cls: 'hl-amber', text: '⚠ No conectado' },
      };
      const { cls, text } = map[status] ?? map.disconnected;
      banner.className    = `hl ${cls}`;
      banner.textContent  = text;
    });
  }

  _renderRecent(docs) {
    const el = this._root.querySelector('#recent-docs');
    if (!el) return;
    if (!docs.length) {
      el.innerHTML = '<div class="empty-msg">Sin documentos aún. Emite tu primero →</div>';
      return;
    }
    el.innerHTML = docs.slice(0, 5).map(d => `
      <div class="recent-row">
        <span class="doc-type-chip ${TYPE_CHIPS[d.type] ?? 'chip-boleta'}">${TYPE_SHORT[d.type] ?? d.type}</span>
        <span class="mono accent">${d.doc_number ?? d.document_id ?? '—'}</span>
        <span class="recent-date">${d.date}</span>
        <span class="mono fw6 ml-auto">${fmtCLP(d.total)}</span>
      </div>
    `).join('');
  }

  updateConnStatus(status, label) {
    setState({ connStatus: status });
  }
}
