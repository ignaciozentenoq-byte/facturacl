// tests/unit/documentSchema.test.js
import { describe, it, expect } from 'vitest';
import { DocumentSchema, PosDocumentSchema } from '../../server/validators/documentSchema.js';

const baseHeader = {
  document_type_id:     '37',
  received_issued_flag: 1,
  issue_date:           '2024-01-15',
  issuer_tax_id_code:   '76399932-7',
  issuer_legal_name:    'Demo SpA',
  currency_id:          39,
};

const baseDetail = {
  quantity:          1,
  line_description:  'Hamburguesa',
  unit_price:        3781,
  total_amount_line: 3781,
  total_taxes:       719,
};

const baseTotals = {
  net_amount:   3781,
  taxes_amount: 719,
  total_amount: 4500,
};

describe('DocumentSchema', () => {
  it('valida una boleta mínima correcta', () => {
    const result = DocumentSchema.safeParse({
      header:  baseHeader,
      details: [baseDetail],
      totals:  baseTotals,
    });
    expect(result.success).toBe(true);
  });

  it('rechaza tipo de documento inválido', () => {
    const result = DocumentSchema.safeParse({
      header:  { ...baseHeader, document_type_id: '99' },
      details: [baseDetail],
      totals:  baseTotals,
    });
    expect(result.success).toBe(false);
  });

  it('rechaza factura sin receptor', () => {
    const result = DocumentSchema.safeParse({
      header:  { ...baseHeader, document_type_id: '2' },
      details: [baseDetail],
      totals:  baseTotals,
    });
    expect(result.success).toBe(false);
    expect(result.error.issues.some(i => i.path.includes('receiver_tax_id_code'))).toBe(true);
  });

  it('rechaza totales que no cuadran', () => {
    const result = DocumentSchema.safeParse({
      header:  baseHeader,
      details: [baseDetail],
      totals:  { net_amount: 3781, taxes_amount: 719, total_amount: 9999 },
    });
    expect(result.success).toBe(false);
  });

  it('rechaza RUT emisor inválido', () => {
    const result = DocumentSchema.safeParse({
      header:  { ...baseHeader, issuer_tax_id_code: '12345678-9' },
      details: [baseDetail],
      totals:  baseTotals,
    });
    expect(result.success).toBe(false);
  });

  it('acepta totales con tolerancia de $5 (redondeo)', () => {
    const result = DocumentSchema.safeParse({
      header:  baseHeader,
      details: [baseDetail],
      totals:  { net_amount: 3781, taxes_amount: 719, total_amount: 4502 }, // diff=2 ≤ 5
    });
    expect(result.success).toBe(true);
  });

  it('rechaza totales con diferencia mayor a $5', () => {
    const result = DocumentSchema.safeParse({
      header:  baseHeader,
      details: [baseDetail],
      totals:  { net_amount: 3781, taxes_amount: 719, total_amount: 4510 }, // diff=10 > 5
    });
    expect(result.success).toBe(false);
  });
});

describe('PosDocumentSchema', () => {
  it('valida boleta mínima para caja', () => {
    const result = PosDocumentSchema.safeParse({
      document_type: '37',
      items: [{ description: 'Café', quantity: 1, unit_price: 2000 }],
    });
    expect(result.success).toBe(true);
  });

  it('rechaza factura sin receptor', () => {
    const result = PosDocumentSchema.safeParse({
      document_type: '2',
      items: [{ description: 'Servicio', quantity: 1, unit_price: 10000 }],
    });
    expect(result.success).toBe(false);
  });

  it('acepta factura con receptor completo', () => {
    const result = PosDocumentSchema.safeParse({
      document_type: '2',
      items: [{ description: 'Servicio', quantity: 1, unit_price: 10000 }],
      receiver: {
        rut:      '76399932-7',
        name:     'Cliente SpA',
        giro:     'Servicios',
        district: 'Santiago',
      },
    });
    expect(result.success).toBe(true);
  });
});
