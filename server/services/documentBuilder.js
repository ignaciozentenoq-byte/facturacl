// server/services/documentBuilder.js
// ═══════════════════════════════════════════════════════════════
// Construye el payload completo para Koywe a partir de datos
// simplificados. Centraliza la lógica tributaria (IVA, neto,
// totales) para que no se repita en las rutas.
//
// Usado tanto por la ruta manual (/api/koywe/documents)
// como por la ruta de caja (/api/pos/emit).
// ═══════════════════════════════════════════════════════════════

import { config }  from '../config/index.js';
import { DOC_TYPES } from '../validators/documentSchema.js';

const EXEMPT_TYPES = [DOC_TYPES.BOLETA_EXENTA];
const IVA_RATE     = 0.19;
const CURRENCY_CLP = 39;

// ── Cálculos tributarios ──────────────────────────────────────

/**
 * Calcula montos de una línea.
 * El precio que viene del cliente ya incluye IVA (precio final al público).
 * Koywe necesita el neto.
 *
 * @param {{ quantity: number, unit_price: number }} item
 * @param {boolean} exempt
 * @returns {{ qty, price, gross, net, tax, netExact, taxExact }}
 */
export function buildLineAmounts(item, exempt = false) {
  const qty   = Math.max(1, Math.round(item.quantity));
  const price = Math.max(0, Math.round(item.unit_price));
  const gross = qty * price;

  if (exempt) {
    return { qty, price, gross, net: gross, tax: 0, netExact: gross, taxExact: 0 };
  }

  const netExact = Number((gross / (1 + IVA_RATE)).toFixed(6));
  const taxExact = Number((gross - netExact).toFixed(6));
  const tax      = Math.round(taxExact);
  const net      = gross - tax;

  return { qty, price, gross, net, tax, netExact, taxExact };
}

/**
 * Suma los totales de todos los ítems.
 * @param {Array} items
 * @param {boolean} exempt
 * @returns {{ net, tax, total }}
 */
export function buildTotals(items, exempt = false) {
  return items.reduce((acc, item) => {
    const line = buildLineAmounts(item, exempt);
    acc.net   += line.net;
    acc.tax   += line.tax;
    acc.total += line.gross;
    return acc;
  }, { net: 0, tax: 0, total: 0 });
}

// ── Builder principal ─────────────────────────────────────────

/**
 * Construye el payload completo para POST /V1/documents de Koywe.
 *
 * @param {object} params
 * @param {string} params.documentType - '37' | '41' | '2' | '16'
 * @param {Array}  params.items        - [{ description, quantity, unit_price }]
 * @param {object} [params.receiver]   - Datos del receptor (facturas/NC)
 * @param {Array}  [params.references] - Referencias (NC)
 * @param {string} [params.issuerRut]  - Override del RUT emisor
 * @returns {object} Payload validado para Koywe
 */
export function buildKoywePayload({
  documentType,
  items,
  receiver = null,
  references = null,
  issuerRut = null,
}) {
  const exempt  = EXEMPT_TYPES.includes(documentType);
  const totals  = buildTotals(items, exempt);
  const today   = new Date().toISOString().slice(0, 10);

  // ── Header ────────────────────────────────────────────────
  const header = {
    account_id:          config.koywe.accountId,
    document_type_id:    documentType,
    received_issued_flag: 1,
    issue_date:          today,

    // Emisor (siempre del servidor, nunca del cliente)
    issuer_tax_id_code:  issuerRut ?? config.issuer.rut,
    issuer_tax_id_type:  'CL-RUT',
    issuer_legal_name:   config.issuer.legalName,
    issuer_address:      config.issuer.address,
    issuer_district:     config.issuer.district,
    issuer_city:         config.issuer.city,
    issuer_country_id:   config.issuer.countryId,
    issuer_activity:     config.issuer.activity,

    payment_conditions:  '0',
    currency_id:         CURRENCY_CLP,
  };

  // ── Receptor ──────────────────────────────────────────────
  if (receiver) {
    Object.assign(header, {
      receiver_tax_id_code: receiver.rut,
      receiver_tax_id_type: 'CL-RUT',
      receiver_legal_name:  receiver.name,
      receiver_address:     receiver.address   ?? '',
      receiver_district:    receiver.district  ?? receiver.city ?? '',
      receiver_city:        receiver.city      ?? '',
      receiver_country_id:  '253',
      receiver_activity:    receiver.giro      ?? '',
    });
  }

  // ── Detalle de ítems ──────────────────────────────────────
  const details = items.map(item => {
    const line    = buildLineAmounts(item, exempt);
    const unitNet = line.qty > 0 ? (line.netExact / line.qty) : 0;

    const detail = {
      quantity:          line.qty,
      line_description:  String(item.description || 'Producto').trim(),
      unit_measure:      item.unit_measure ?? 'UN',
      unit_price:        exempt ? line.price : Number(unitNet.toFixed(6)),
      total_amount_line: exempt ? line.gross : Number(line.netExact.toFixed(6)),
      total_taxes:       exempt ? 0 : Number(line.taxExact.toFixed(6)),
    };

    if (!exempt) {
      detail.taxes = [{
        tax_type_id:    '387',
        tax_percentage: 19,
        tax_amount:     Number(line.taxExact.toFixed(6)),
      }];
    }

    return detail;
  });

  // ── Totales ───────────────────────────────────────────────
  const payload = {
    header,
    details,
    totals: {
      net_amount:   totals.net,
      taxes_amount: totals.tax,
      total_amount: totals.total,
    },
  };

  // ── Referencias (NC) ─────────────────────────────────────
  if (references && references.length > 0) {
    payload.references = references;
  }

  return payload;
}
