// src/lib/tax.js
// ═══════════════════════════════════════════════════════════════
// Lógica tributaria pura — sin efectos secundarios, sin DOM.
// Comparte los mismos algoritmos que server/services/documentBuilder.js
// pero corre en el cliente para mostrar totales en tiempo real.
// ═══════════════════════════════════════════════════════════════

const IVA_RATE = 0.19;

/** Tipos exentos de IVA */
export const EXEMPT_TYPES = ['41', '32'];

/** Tipos que requieren datos del receptor */
export const REQUIRES_RECEIVER = ['2', '16'];

/** Etiquetas legibles de cada tipo de documento */
export const DOC_TYPE_LABELS = {
  '37': 'Boleta electrónica',
  '41': 'Boleta exenta',
  '2':  'Factura electrónica',
  '16': 'Nota de crédito',
};

/**
 * Calcula los montos de una línea de detalle.
 * El precio de entrada ya incluye IVA (precio final al público).
 *
 * @param {{ quantity: number, unit_price: number }} item
 * @param {boolean} exempt
 * @returns {{ qty, price, gross, net, tax, netExact, taxExact }}
 */
export function buildLineAmounts(item, exempt = false) {
  const qty   = Math.max(1, Math.round(Number(item.quantity)  || 1));
  const price = Math.max(0, Math.round(Number(item.unit_price) || 0));
  const gross = qty * price;

  if (exempt || gross === 0) {
    return { qty, price, gross, net: gross, tax: 0, netExact: gross, taxExact: 0 };
  }

  const netExact = Number((gross / (1 + IVA_RATE)).toFixed(6));
  const taxExact = Number((gross - netExact).toFixed(6));
  const tax      = Math.round(taxExact);
  const net      = gross - tax;

  return { qty, price, gross, net, tax, netExact, taxExact };
}

/**
 * Calcula los totales de todos los ítems.
 * @param {Array} items - Array de { quantity, unit_price }
 * @param {string} docType
 * @returns {{ net: number, tax: number, total: number }}
 */
export function calcTotals(items, docType) {
  const exempt = EXEMPT_TYPES.includes(docType);
  return items.reduce((acc, item) => {
    const line = buildLineAmounts(item, exempt);
    acc.net   += line.net;
    acc.tax   += line.tax;
    acc.total += line.gross;
    return acc;
  }, { net: 0, tax: 0, total: 0 });
}

/**
 * Formatea un número como moneda CLP.
 * @param {number} n
 * @returns {string} "$1.234.567"
 */
export function fmtCLP(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CL');
}
