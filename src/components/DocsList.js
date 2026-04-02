// src/components/DocsList.js
import { subscribe, getState } from '../lib/state.js';
import { fmtCLP, DOC_TYPE_LABELS } from '../lib/tax.js';
import { open as openModal } from './modal.js';

const TYPE_CHIPS = { '37':'chip-boleta','41':'chip-nc','2':'chip-factura','16':'chip-nc' };
const TYPE_SHORT = { '37':'Boleta','41':'B.Exenta','2':'Factura','16':'NC' };
const PAGE_SIZE  = 20;

export class DocsList {
  constructor(container) {
    this._root    = container;
    this._page    = 0;       // página actual (0-based)
    this._total   = 0;       // total de documentos en BD
    this._loading = false;
    this._render();
    subscribe('docs', docs => {
      this._total = docs.length;
      this._renderTable(this._currentPage(docs));
      this._renderPagination();
    });
  }

  // Documentos de la página actual
  _currentPage(docs) {
    const start = this._page * PAGE_SIZE;
    return docs.slice(start, start + PAGE_SIZE);
  }

  _render() {
    this._root.innerHTML = `
      <div class="page-title">Documentos emitidos</div>
      <div class="page-sub" id="docs-sub">Cargando historial desde base de datos…</div>

      <div class="card" id="docs-table-container">
        <div class="empty-msg">No hay documentos emitidos aún.</div>
      </div>

      <div id="docs-pagination" style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:0 4px"></div>
    `;
    const docs = getState('docs') ?? [];
    this._total = docs.length;
    this._renderTable(this._currentPage(docs));
    this._renderPagination();
  }

  _renderTable(docs) {
    const container = this._root.querySelector('#docs-table-container');
    const sub       = this._root.querySelector('#docs-sub');
    if (!container) return;

    const totalDocs = getState('docs')?.length ?? 0;
    if (sub) {
      sub.textContent = totalDocs
        ? `${totalDocs} documento${totalDocs !== 1 ? 's' : ''} en total · página ${this._page + 1} de ${Math.ceil(totalDocs / PAGE_SIZE)}`
        : 'Historial de documentos emitidos';
    }

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
      const doc = (getState('docs') ?? []).find(d => String(d.document_id) === id);
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

  _renderPagination() {
    const el    = this._root.querySelector('#docs-pagination');
    if (!el) return;
    const total = getState('docs')?.length ?? 0;
    const pages = Math.ceil(total / PAGE_SIZE);
    if (pages <= 1) { el.innerHTML = ''; return; }

    const start = this._page * PAGE_SIZE + 1;
    const end   = Math.min(start + PAGE_SIZE - 1, total);

    el.innerHTML = `
      <button class="tb-btn" id="btn-prev" ${this._page === 0 ? 'disabled' : ''}>
        ← Anterior
      </button>
      <span style="font-size:12px;color:var(--text3)">
        ${start}–${end} de ${total}
      </span>
      <button class="tb-btn" id="btn-next" ${this._page >= pages - 1 ? 'disabled' : ''}>
        Siguiente →
      </button>
    `;

    el.querySelector('#btn-prev')?.addEventListener('click', () => {
      if (this._page > 0) { this._page--; this._refresh(); }
    });
    el.querySelector('#btn-next')?.addEventListener('click', async () => {
      const docs  = getState('docs') ?? [];
      const pages = Math.ceil(docs.length / PAGE_SIZE);
      if (this._page < pages - 1) {
        this._page++;
        // Si estamos en la última página cargada, pedir más a la BD
        if (this._page * PAGE_SIZE >= docs.length) {
          await this._loadMore(docs.length);
        }
        this._refresh();
      }
    });
  }

  _refresh() {
    const docs = getState('docs') ?? [];
    this._renderTable(this._currentPage(docs));
    this._renderPagination();
    // Scroll al inicio de la tabla
    this._root.querySelector('#docs-table-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Carga más documentos desde la BD cuando se agota la página actual
  async _loadMore(offset) {
    if (this._loading) return;
    this._loading = true;
    try {
      const { fetchHistory } = await import('../api/koywe.js');
      const res = await fetchHistory({ limit: PAGE_SIZE, offset });
      if (!res?.documents?.length) return;

      const newDocs = res.documents.map(d => ({
        document_id: d.id,
        doc_number:  d.doc_number,
        type:        d.type,
        total:       d.total,
        date:        new Date(d.issued_at).toLocaleDateString('es-CL'),
        status:      d.status === 'ok' ? 'ok' : 'pending',
        raw: {
          document_id: d.koywe_document_id ?? d.id,
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
            document_number:      d.doc_number,
            receiver_tax_id_code: d.receiver_rut  ?? null,
            receiver_legal_name:  d.receiver_name ?? null,
          },
          result: { status: d.status === 'ok' ? 0 : 1 },
        },
      }));

      const { setState } = await import('../lib/state.js');
      const existing = getState('docs') ?? [];
      setState({ docs: [...existing, ...newDocs] });
    } catch (e) {
      console.warn('Error cargando más documentos:', e.message);
    } finally {
      this._loading = false;
    }
  }

  _viewDoc(doc) {
    const raw    = doc.raw ?? {};
    const docNum = doc.doc_number ?? doc.document_id;
    const label  = DOC_TYPE_LABELS[doc.type] ?? doc.type;
    const pdfB64 = raw.electronic_document?.document_pdf ?? null;
    const xmlB64 = raw.electronic_document?.document_xml ?? null;

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
