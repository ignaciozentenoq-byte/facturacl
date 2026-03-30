// src/components/ItemsTable.js
// ═══════════════════════════════════════════════════════════════
// Tabla de ítems del documento.
// Gestiona su propio array de ítems e invoca onUpdate(items)
// cuando cambia cualquier valor.
// ═══════════════════════════════════════════════════════════════

import { buildLineAmounts, EXEMPT_TYPES, fmtCLP } from '../lib/tax.js';

export class ItemsTable {
  /**
   * @param {HTMLElement} container - <tbody> donde se renderiza
   * @param {Function}    onUpdate  - callback(items) llamado en cada cambio
   */
  constructor(container, onUpdate) {
    this._tbody   = container;
    this._onUpdate = onUpdate;
    this._items   = [];
    this._idSeq   = 0;
    this._docType = '37';
  }

  /** Cambia el tipo de documento (afecta si se muestra IVA) */
  setDocType(type) {
    this._docType = type;
    this._items.forEach(item => this._refreshCalc(item.id));
  }

  /** Agrega un ítem vacío */
  addItem(defaults = {}) {
    const id = ++this._idSeq;
    this._items.push({
      id,
      description: defaults.description ?? '',
      quantity:    defaults.quantity    ?? 1,
      unit_price:  defaults.unit_price  ?? 0,
    });
    this._renderRow(id);
    this._refreshDelButtons();
    this._notify();
  }

  /** Reemplaza todos los ítems (útil al cargar una venta del POS) */
  setItems(items) {
    this._items = [];
    this._tbody.innerHTML = '';
    this._idSeq = 0;
    items.forEach(i => this.addItem(i));
  }

  /** Limpia la tabla */
  clear() {
    this._items = [];
    this._tbody.innerHTML = '';
    this._idSeq = 0;
    this.addItem();
  }

  /** Retorna los ítems actuales con valores normalizados */
  getItems() {
    return this._items.map(i => ({
      description: i.description,
      quantity:    Math.max(1, Math.round(Number(i.quantity) || 1)),
      unit_price:  Math.max(0, Math.round(Number(i.unit_price) || 0)),
    }));
  }

  // ── Private ────────────────────────────────────────────────

  _renderRow(id) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;

    const tr = document.createElement('tr');
    tr.id    = `row-${id}`;
    tr.innerHTML = `
      <td>
        <input class="fi" id="desc-${id}" placeholder="Descripción del producto o servicio"
               value="${escHtml(item.description)}" style="min-width:180px">
      </td>
      <td>
        <input class="fi mono" id="qty-${id}" type="number" min="1" value="${item.quantity}"
               style="width:64px;text-align:center">
      </td>
      <td>
        <input class="fi mono" id="price-${id}" type="number" min="0" value="${item.unit_price || ''}"
               placeholder="0" style="width:110px;text-align:right">
      </td>
      <td id="iva-${id}"   class="mono td-calc"></td>
      <td id="total-${id}" class="mono td-calc fw6"></td>
      <td id="del-${id}"></td>
    `;
    this._tbody.appendChild(tr);

    // Eventos
    tr.querySelector(`#desc-${id}`).addEventListener('input', e => {
      this._update(id, 'description', e.target.value);
    });
    tr.querySelector(`#qty-${id}`).addEventListener('input', e => {
      this._update(id, 'quantity', Number(e.target.value) || 1);
    });
    tr.querySelector(`#price-${id}`).addEventListener('input', e => {
      this._update(id, 'unit_price', Number(e.target.value) || 0);
    });

    this._refreshCalc(id);
  }

  _update(id, field, value) {
    const item = this._items.find(i => i.id === id);
    if (item) item[field] = value;
    this._refreshCalc(id);
    this._notify();
  }

  _refreshCalc(id) {
    const item   = this._items.find(i => i.id === id);
    if (!item)   return;
    const exempt = EXEMPT_TYPES.includes(this._docType);
    const line   = buildLineAmounts(item, exempt);

    const ivaEl   = document.getElementById(`iva-${id}`);
    const totalEl = document.getElementById(`total-${id}`);
    if (ivaEl)   ivaEl.textContent   = fmtCLP(line.tax);
    if (totalEl) totalEl.textContent = fmtCLP(line.gross);
  }

  _removeItem(id) {
    this._items  = this._items.filter(i => i.id !== id);
    const row    = document.getElementById(`row-${id}`);
    if (row) row.remove();
    this._refreshDelButtons();
    this._notify();
  }

  _refreshDelButtons() {
    this._items.forEach(item => {
      const cell = document.getElementById(`del-${item.id}`);
      if (!cell) return;
      if (this._items.length > 1) {
        cell.innerHTML = `<button class="del-btn" aria-label="Eliminar ítem">✕</button>`;
        cell.querySelector('.del-btn').addEventListener('click', () => this._removeItem(item.id));
      } else {
        cell.innerHTML = '';
      }
    });
  }

  _notify() {
    this._onUpdate?.(this.getItems());
  }
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
