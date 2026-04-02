// src/components/DocsList.js
import { subscribe, getState } from '../lib/state.js';
import { fmtCLP, DOC_TYPE_LABELS } from '../lib/tax.js';
import { open as openModal } from './modal.js';

const TYPE_CHIPS = { '37':'chip-boleta','41':'chip-nc','2':'chip-factura','16':'chip-nc' };
const TYPE_SHORT = { '37':'Boleta','41':'B.Exenta','2':'Factura','16':'NC' };

export class DocsList {
  constructor(container) {
    this._root = container;
    this._render();
    subscribe('docs', docs => this._renderTable(docs));
  }

  _render() {
    this._root.innerHTML = `
      <div class="page-title">Documentos emitidos</div>
      <div class="page-sub">Historial de documentos emitidos en esta sesión</div>
      <div class="card" id="docs-table-container">
        <div class="empty-msg">No hay documentos emitidos aún.</div>
      </div>
    `;
    this._renderTable(getState('docs') ?? []);
  }

  _renderTable(docs) {
    const container = this._root.querySelector('#docs-table-container');
    if (!container) return;

    if (!docs.length) {
      container.innerHTML = '<div class="empty-msg">No hay documentos emitidos aún.</div>';
      return;
    }

    container.innerHTML = `
      <table class="doc-tbl">
        <thead>
          <tr>
            <th>N° Doc</th><th>Tipo</th><th>Total</th>
            <th>Fecha</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${docs.map(d => `
            <tr data-id="${esc(String(d.document_id))}">
              <td class="mono accent">${esc(String(d.doc_number ?? d.document_id ?? '—'))}</td>
              <td><span class="doc-type-chip ${TYPE_CHIPS[d.type] ?? 'chip-boleta'}">${TYPE_SHORT[d.type] ?? d.type}</span></td>
              <td class="mono fw6">${fmtCLP(d.total)}</td>
              <td class="text3">${esc(d.date)}</td>
              <td>
                <span class="doc-status-dot ${d.status === 'ok' ? 'dsd-ok' : 'dsd-pend'}"></span>
                ${d.status === 'ok' ? 'Emitido' : 'Pendiente'}
              </td>
              <td><button class="tb-btn btn-ver">Ver →</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    container.querySelectorAll('tr[data-id]').forEach(row => {
      const id  = row.dataset.id;
      const doc = docs.find(d => String(d.document_id) === id);
      if (!doc) return;
      const fn = () => this._viewDoc(doc);
      row.style.cursor = 'pointer';
      row.addEventListener('click', fn);
      row.querySelector('.btn-ver')?.addEventListener('click', e => {
        e.stopPropagation();
        fn();
      });
    });
  }

  _viewDoc(doc) {
    const raw    = doc.raw ?? {};
    const docNum = doc.doc_number ?? doc.document_id;
    const label  = DOC_TYPE_LABELS[doc.type] ?? doc.type;
    const pdfB64 = raw.electronic_document?.document_pdf ?? null;
    const xmlB64 = raw.electronic_document?.document_xml ?? null;

    // Guardar en window para descarga (evita el problema de atributos HTML muy largos)
    window._currentDocB64  = pdfB64 ?? xmlB64;
    window._currentDocNum  = docNum;
    window._currentDocMime = pdfB64 ? 'application/pdf' : 'application/xml';
    window._currentDocExt  = pdfB64 ? 'pdf' : 'xml';

    const downloadBtn = (pdfB64 || xmlB64) ? `
      <button onclick="window._downloadCurrentDoc()"
        class="btn-primary" style="margin-bottom:12px;width:100%">
        ⬇ Descargar ${pdfB64 ? 'PDF' : 'XML'} del DTE
      </button>` : '';

    openModal(`DTE · N° ${docNum}`, `
      <div style="text-align:center;padding:8px 0 16px">
        <div style="font-size:40px">${doc.status === 'ok' ? '✅' : '⏳'}</div>
        <div class="result-title">${label}</div>
      </div>
      <div class="result-rows">
        ${dRow('N° documento', docNum ?? '—')}
        ${dRow('Document ID',  raw.document_id ?? doc.document_id)}
        ${dRow('Estado',       doc.status === 'ok' ? 'Enviado al SII' : 'Pendiente')}
        ${dRow('Total',        fmtCLP(doc.total))}
        ${dRow('Fecha',        doc.date)}
      </div>
      ${downloadBtn}
      <details style="margin-top:12px">
        <summary style="font-size:11px;color:var(--text3);cursor:pointer">Ver respuesta completa</summary>
        <pre class="code-preview">${esc(JSON.stringify(raw, null, 2).slice(0, 3000))}</pre>
      </details>
    `);

    // Función de descarga
    window._downloadCurrentDoc = () => {
      const b64 = window._currentDocB64;
      if (!b64) return;
      try {
        const bin  = atob(b64);
        const arr  = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const blob = new Blob([arr], { type: window._currentDocMime });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `DTE-${window._currentDocNum}.${window._currentDocExt}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Error al descargar DTE:', e);
      }
    };
  }
}

function dRow(l, v) {
  return `<div class="result-row"><span class="result-lbl">${l}</span><span class="result-val">${esc(String(v ?? ''))}</span></div>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
