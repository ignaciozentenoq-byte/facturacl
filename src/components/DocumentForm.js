// src/components/DocumentForm.js
// ═══════════════════════════════════════════════════════════════
// Formulario principal para crear y emitir un documento DTE.
// Orquesta ItemsTable, validaciones cliente y llamada a la API.
// ═══════════════════════════════════════════════════════════════

import { ItemsTable }       from './ItemsTable.js';
import { notify }           from './notify.js';
import { open as openModal } from './modal.js';
import { emitDocument }     from '../api/koywe.js';
import { calcTotals, fmtCLP, REQUIRES_RECEIVER, EXEMPT_TYPES, DOC_TYPE_LABELS } from '../lib/tax.js';
import { isValidRut, formatRut } from '../lib/rut.js';
import { setState, getState }    from '../lib/state.js';

export class DocumentForm {
  constructor(container) {
    this._root    = container;
    this._docType = '37';
    this._items   = [];
    this._table   = null;
    this._busy    = false;
    this._render();
  }

  // ── Render inicial ────────────────────────────────────────

  _render() {
    this._root.innerHTML = `
      <!-- Tipo de documento -->
      <div class="card">
        <div class="card-hdr"><div class="card-title">Tipo de documento</div></div>
        <div class="doc-types" id="doc-type-selector">
          ${this._docTypeButtons()}
        </div>
      </div>

      <!-- Receptor (condicional) -->
      <div class="card" id="receptor-card" style="display:none">
        <div class="card-hdr">
          <div>
            <div class="card-title">Datos del receptor</div>
            <div class="card-sub">Requerido para facturas y notas de crédito</div>
          </div>
        </div>
        <div class="fr fr2">
          <div class="fg">
            <label class="fl">RUT receptor <span class="req">*</span></label>
            <input class="fi mono" id="recv-rut" placeholder="76.399.932-7">
          </div>
          <div class="fg">
            <label class="fl">Razón social <span class="req">*</span></label>
            <input class="fi" id="recv-name" placeholder="Empresa Ejemplo SpA">
          </div>
        </div>
        <div class="fr fr3">
          <div class="fg">
            <label class="fl">Giro <span class="req">*</span></label>
            <input class="fi" id="recv-giro" placeholder="Comercio al por menor">
          </div>
          <div class="fg">
            <label class="fl">Comuna <span class="req">*</span></label>
            <input class="fi" id="recv-district" placeholder="Santiago">
          </div>
          <div class="fg">
            <label class="fl">Ciudad</label>
            <input class="fi" id="recv-city" placeholder="Santiago">
          </div>
        </div>
        <div class="fg">
          <label class="fl">Dirección</label>
          <input class="fi" id="recv-addr" placeholder="Av. Libertador 1234">
        </div>
      </div>

      <!-- Referencia NC -->
      <div class="card" id="reference-card" style="display:none">
        <div class="card-hdr">
          <div>
            <div class="card-title">Referencia al documento original</div>
            <div class="card-sub">Requerido para nota de crédito</div>
          </div>
        </div>
        <div class="fr fr3">
          <div class="fg">
            <label class="fl">N° documento</label>
            <input class="fi mono" id="ref-num" placeholder="1234">
          </div>
          <div class="fg">
            <label class="fl">Tipo documento</label>
            <select class="fs" id="ref-type">
              <option value="37">Boleta (37)</option>
              <option value="2">Factura (2)</option>
            </select>
          </div>
          <div class="fg">
            <label class="fl">Motivo</label>
            <input class="fi" id="ref-reason" value="Anulacion" placeholder="Anulacion, Devolucion…">
          </div>
        </div>
      </div>

      <!-- Ítems -->
      <div class="card">
        <div class="card-hdr"><div class="card-title">Detalle de ítems</div></div>
        <table class="items-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th style="width:70px">Cant.</th>
              <th style="width:120px">Precio c/IVA</th>
              <th style="width:100px">IVA 19%</th>
              <th style="width:110px">Total línea</th>
              <th style="width:32px"></th>
            </tr>
          </thead>
          <tbody id="items-tbody"></tbody>
        </table>
        <button class="add-item-btn" id="add-item-btn">+ Agregar ítem</button>

        <div class="fr fr2">
          <div class="fg">
            <label class="fl">Observación (opcional)</label>
            <textarea class="fta" id="obs" rows="2" placeholder="Referencia de pedido, mesa, etc."></textarea>
          </div>
          <div class="totals-box" id="totals-box">
            <div class="totals-row">
              <span class="lbl">Neto</span>
              <span class="val mono" id="tot-net">$0</span>
            </div>
            <div class="totals-row">
              <span class="lbl">IVA (19%)</span>
              <span class="val mono" id="tot-iva">$0</span>
            </div>
            <div class="totals-row total">
              <span class="lbl">TOTAL</span>
              <span class="val mono" id="tot-total">$0</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Acciones -->
      <div class="action-bar">
        <button class="btn-secondary" id="btn-clear">Limpiar</button>
        <button class="btn-preview"   id="btn-preview">👁 Vista previa</button>
        <button class="btn-primary"   id="btn-emit" disabled>
          🧾 Emitir al SII vía Koywe
        </button>
      </div>
    `;

    // ItemsTable
    this._table = new ItemsTable(
      this._root.querySelector('#items-tbody'),
      items => { this._items = items; this._updateTotals(); }
    );
    this._table.addItem();

    // Eventos
    this._root.querySelectorAll('.dt-btn').forEach(btn => {
      btn.addEventListener('click', () => this._selectDocType(btn.dataset.type, btn));
    });
    this._root.querySelector('#add-item-btn').addEventListener('click', () => this._table.addItem());
    this._root.querySelector('#btn-clear').addEventListener('click',   () => this.reset());
    this._root.querySelector('#btn-preview').addEventListener('click', () => this._preview());
    this._root.querySelector('#btn-emit').addEventListener('click',    () => this._emit());
  }

  _docTypeButtons() {
    const types = [
      { id: '37', icon: '🧾', label: 'Boleta electrónica' },
      { id: '41', icon: '🔖', label: 'Boleta exenta'      },
      { id: '2',  icon: '📋', label: 'Factura electrónica' },
      { id: '16', icon: '↩',  label: 'Nota de crédito'    },
    ];
    return types.map(t => `
      <div class="dt-btn${t.id === '37' ? ' selected' : ''}" data-type="${t.id}">
        <div class="dt-icon">${t.icon}</div>
        <div class="dt-name">${t.label}</div>
        <div class="dt-id">type: ${t.id}</div>
      </div>
    `).join('');
  }

  // ── Tipo de documento ─────────────────────────────────────

  _selectDocType(type, el) {
    this._docType = type;
    this._root.querySelectorAll('.dt-btn').forEach(b => b.classList.remove('selected'));
    el?.classList.add('selected');
    this._root.querySelector('#receptor-card').style.display  =
      REQUIRES_RECEIVER.includes(type) ? 'block' : 'none';
    this._root.querySelector('#reference-card').style.display =
      type === '16' ? 'block' : 'none';
    this._table.setDocType(type);
    this._updateTotals();
  }

  /** Permite seleccionar tipo externamente (ej. desde Dashboard quick-access) */
  selectType(type) {
    const btn = this._root.querySelector(`.dt-btn[data-type="${type}"]`);
    this._selectDocType(type, btn);
  }

  // ── Totales ───────────────────────────────────────────────

  _updateTotals() {
    const t    = calcTotals(this._items, this._docType);
    const emit = this._root.querySelector('#btn-emit');

    this._root.querySelector('#tot-net').textContent   = fmtCLP(t.net);
    this._root.querySelector('#tot-iva').textContent   = fmtCLP(t.tax);
    this._root.querySelector('#tot-total').textContent = fmtCLP(t.total);

    if (emit) emit.disabled = t.total === 0 || this._busy;
  }

  // ── Reset ─────────────────────────────────────────────────

  reset() {
    this._items   = [];
    this._docType = '37';
    const firstBtn = this._root.querySelector('.dt-btn[data-type="37"]');
    this._selectDocType('37', firstBtn);
    this._table.clear();
    ['recv-rut','recv-name','recv-giro','recv-district','recv-city','recv-addr',
     'ref-num','obs'].forEach(id => {
      const el = this._root.querySelector(`#${id}`);
      if (el) el.value = '';
    });
    this._updateTotals();
  }

  // ── Vista previa ──────────────────────────────────────────

  _preview() {
    const t      = calcTotals(this._items, this._docType);
    const exempt = EXEMPT_TYPES.includes(this._docType);
    const label  = DOC_TYPE_LABELS[this._docType] ?? this._docType;
    const issuer = getState('issuer');

    const rows = this._items
      .filter(i => i.unit_price > 0 && i.description)
      .map(i => `<div class="prev-row"><span>${esc(i.description)} ×${i.quantity}</span><span>${fmtCLP(i.unit_price * i.quantity)}</span></div>`)
      .join('');

    openModal('Vista previa del documento', `
      <div class="receipt">
        <div class="receipt-brand">${esc(issuer?.legalName ?? 'FacturaCL')}</div>
        <div class="receipt-sub">${esc(issuer?.rut ?? '')}</div>
        <div class="receipt-sep"></div>
        <div class="receipt-type">${label}</div>
        <div class="receipt-note">[Sandbox · N° pendiente]</div>
        <div class="receipt-sep"></div>
        ${rows}
        <div class="receipt-sep"></div>
        <div class="receipt-row"><span>Neto</span><span>${fmtCLP(t.net)}</span></div>
        ${!exempt ? `<div class="receipt-row"><span>IVA 19%</span><span>${fmtCLP(t.tax)}</span></div>` : ''}
        <div class="receipt-row fw6"><span>TOTAL</span><span>${fmtCLP(t.total)}</span></div>
        <div class="receipt-sep"></div>
        <div class="receipt-note">Vista previa · Sandbox Koywe</div>
      </div>
    `);
  }

  // ── Emisión ───────────────────────────────────────────────

  async _emit() {
    if (this._busy) return;

    const validItems = this._items.filter(i => i.unit_price > 0 && i.description?.trim());
    if (!validItems.length) {
      notify('Completa al menos un ítem con descripción y precio', 'error');
      return;
    }

    // Validar receptor si aplica
    if (REQUIRES_RECEIVER.includes(this._docType)) {
      const rut      = formatRut(this._root.querySelector('#recv-rut')?.value ?? '');
      const name     = this._root.querySelector('#recv-name')?.value?.trim();
      const giro     = this._root.querySelector('#recv-giro')?.value?.trim();
      const district = this._root.querySelector('#recv-district')?.value?.trim();

      if (!rut      || !isValidRut(rut))  { notify('RUT del receptor inválido', 'error'); return; }
      if (!name)     { notify('Razón social del receptor requerida', 'error'); return; }
      if (!giro)     { notify('Giro del receptor requerido', 'error'); return; }
      if (!district) { notify('Comuna del receptor requerida', 'error'); return; }

      // Normalizar RUT en el input
      this._root.querySelector('#recv-rut').value = rut;
    }

    this._setBusy(true);
    const t0 = Date.now();

    try {
      const payload = this._buildPayload(validItems);
      const data    = await emitDocument(payload);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(2) + 's';
      const docNum  = data.header?.document_number ?? data.document_id;

      // Guardar en historial del state
      const doc = {
        document_id: data.document_id,
        doc_number:  docNum,
        type:        this._docType,
        total:       calcTotals(validItems, this._docType).total,
        date:        new Date().toLocaleDateString('es-CL'),
        status:      data.result?.status === 0 ? 'ok' : 'pending',
        raw:         data,
      };
      const docs = [doc, ...getState('docs')];
      setState({ docs });
      this._updateStats(docs);

      notify(`✓ DTE emitido · N° ${docNum} · ${elapsed}`, 'success');
      this._showResult(doc, data, elapsed);
      this.reset();

    } catch (err) {
      // Mostrar errores de validación del servidor en detalle
      if (err.issues?.length) {
        const msgs = err.issues.map(i => `• ${i.message}`).join('\n');
        notify(`Error de validación:\n${msgs}`, 'error', 8000);
      } else {
        notify(`Error: ${err.message}`, 'error');
      }
    } finally {
      this._setBusy(false);
    }
  }

  _buildPayload(items) {
    const exempt = EXEMPT_TYPES.includes(this._docType);
    const today  = new Date().toISOString().slice(0, 10);
    const issuer = getState('issuer');

    // Header base
    const header = {
      document_type_id:     this._docType,
      received_issued_flag: 1,
      issue_date:           today,
      issuer_tax_id_code:   issuer?.rut ?? '',
      issuer_tax_id_type:   'CL-RUT',
      issuer_legal_name:    issuer?.legalName ?? '',
      issuer_address:       issuer?.address ?? '',
      issuer_district:      issuer?.district ?? '',
      issuer_city:          issuer?.city ?? '',
      issuer_country_id:    '253',
      issuer_activity:      issuer?.activity ?? '',
      payment_conditions:   '0',
      currency_id:          39,
    };

    // Receptor
    if (REQUIRES_RECEIVER.includes(this._docType)) {
      Object.assign(header, {
        receiver_tax_id_code: this._root.querySelector('#recv-rut')?.value ?? '',
        receiver_tax_id_type: 'CL-RUT',
        receiver_legal_name:  this._root.querySelector('#recv-name')?.value?.trim() ?? '',
        receiver_address:     this._root.querySelector('#recv-addr')?.value?.trim() ?? '',
        receiver_district:    this._root.querySelector('#recv-district')?.value?.trim() ?? '',
        receiver_city:        this._root.querySelector('#recv-city')?.value?.trim() ?? '',
        receiver_country_id:  '253',
        receiver_activity:    this._root.querySelector('#recv-giro')?.value?.trim() ?? '',
      });
    }

    // Ítems
    const { buildLineAmounts } = { buildLineAmounts: (item) => {
      const qty   = Math.max(1, Math.round(item.quantity));
      const price = Math.max(0, Math.round(item.unit_price));
      const gross = qty * price;
      if (exempt) return { qty, price, gross, netExact: gross, taxExact: 0 };
      const netExact = Number((gross / 1.19).toFixed(6));
      const taxExact = Number((gross - netExact).toFixed(6));
      return { qty, price, gross, netExact, taxExact };
    }};

    const details = items.map(i => {
      const line    = buildLineAmounts(i);
      const unitNet = line.qty > 0 ? line.netExact / line.qty : 0;
      const d = {
        quantity:          line.qty,
        line_description:  i.description.trim(),
        unit_measure:      'UN',
        unit_price:        exempt ? line.price : Number(unitNet.toFixed(6)),
        total_amount_line: exempt ? line.gross : Number(line.netExact.toFixed(6)),
        total_taxes:       exempt ? 0 : Number(line.taxExact.toFixed(6)),
      };
      if (!exempt) {
        d.taxes = [{ tax_type_id: '387', tax_percentage: 19, tax_amount: Number(line.taxExact.toFixed(6)) }];
      }
      return d;
    });

    // Totales
    const t = calcTotals(items, this._docType);
    const payload = { header, details, totals: { net_amount: t.net, taxes_amount: t.tax, total_amount: t.total } };

    // Referencia NC
    if (this._docType === '16') {
      const refNum    = this._root.querySelector('#ref-num')?.value?.trim();
      const refType   = this._root.querySelector('#ref-type')?.value ?? '37';
      const refReason = this._root.querySelector('#ref-reason')?.value || 'Anulacion';
      if (refNum) {
        payload.references = [{
          document_type_id: parseInt(refType, 10),
          reference_number: refNum,
          reference_code:   1,
          description:      refReason,
          reference_date:   today,
        }];
      }
    }

    return payload;
  }

  _setBusy(busy) {
    this._busy = busy;
    const btn  = this._root.querySelector('#btn-emit');
    if (!btn) return;
    btn.disabled = busy;
    btn.innerHTML = busy
      ? '<span class="spin"></span> Emitiendo…'
      : '🧾 Emitir al SII vía Koywe';
  }

  _updateStats(docs) {
    setState({
      stats: {
        total:    docs.length,
        boletas:  docs.filter(d => d.type === '37' || d.type === '41').length,
        facturas: docs.filter(d => d.type === '2'  || d.type === '32').length,
        nc:       docs.filter(d => d.type === '16').length,
      },
    });
  }

  _showResult(doc, raw, elapsed) {
    const docNum = doc.doc_number ?? doc.document_id;
    const label  = DOC_TYPE_LABELS[doc.type] ?? doc.type;
    const pdfB64 = raw.electronic_document?.document_pdf;

    const pdfBtn = pdfB64 ? `
      <button onclick="window._downloadPDF('${pdfB64}')" class="btn-primary" style="margin-bottom:8px;width:100%">
        ⬇ Descargar PDF del DTE
      </button>` : '';

    const siiMsg = raw.result?.error_message
      ? `<div class="hl hl-amber">Mensaje SII: ${esc(raw.result.error_message)}</div>` : '';

    openModal(`DTE Emitido · N° ${docNum}`, `
      <div style="text-align:center;padding:12px 0 20px">
        <div style="font-size:48px;margin-bottom:8px">${doc.status === 'ok' ? '✅' : '⏳'}</div>
        <div class="result-title">Documento emitido</div>
        <div class="result-sub">${label}</div>
      </div>
      <div class="result-rows">
        ${dRow('N° documento', docNum ?? '—')}
        ${dRow('Document ID',  raw.document_id)}
        ${dRow('Estado',       raw.result?.status === 0 ? '✅ Enviado al SII' : '⏳ Pendiente')}
        ${dRow('Total',        fmtCLP(doc.total))}
        ${dRow('Fecha',        doc.date)}
        ${dRow('Tiempo',       elapsed)}
      </div>
      ${pdfBtn}
      ${siiMsg}
      <details style="margin-top:12px">
        <summary style="font-size:11px;color:var(--text3);cursor:pointer">Ver respuesta completa de Koywe</summary>
        <pre class="code-preview">${esc(JSON.stringify(raw, null, 2).slice(0, 3000))}</pre>
      </details>
    `);

    // Helper de descarga en window para el botón del modal
    window._downloadPDF = (b64) => {
      try {
        const bin  = atob(b64);
        const arr  = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const blob = new Blob([arr], { type: 'application/pdf' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `DTE-${docNum}.pdf`; a.click();
        URL.revokeObjectURL(url);
        notify('PDF descargado', 'success');
      } catch (e) {
        notify(`Error al descargar PDF: ${e.message}`, 'error');
      }
    };
  }
}

function dRow(label, val) {
  return `<div class="result-row"><span class="result-lbl">${label}</span><span class="result-val">${esc(String(val ?? ''))}</span></div>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
