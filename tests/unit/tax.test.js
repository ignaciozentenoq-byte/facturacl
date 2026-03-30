// tests/unit/tax.test.js
import { describe, it, expect } from 'vitest';
import { buildLineAmounts, buildTotals } from '../../server/services/documentBuilder.js';

describe('buildLineAmounts', () => {
  it('calcula IVA correctamente para precio bruto', () => {
    const line = buildLineAmounts({ quantity: 1, unit_price: 1190 });
    expect(line.gross).toBe(1190);
    expect(line.tax).toBe(190);
    expect(line.net).toBe(1000);
  });

  it('maneja múltiples unidades', () => {
    const line = buildLineAmounts({ quantity: 3, unit_price: 1190 });
    expect(line.gross).toBe(3570);
    expect(line.tax).toBe(570);
    expect(line.net).toBe(3000);
  });

  it('exento: tax = 0', () => {
    const line = buildLineAmounts({ quantity: 1, unit_price: 1000 }, true);
    expect(line.tax).toBe(0);
    expect(line.net).toBe(1000);
    expect(line.gross).toBe(1000);
  });

  it('redondea correctamente centavos', () => {
    // $4500 / 1.19 = 3781.51... → net=3781, tax=719, gross=4500
    const line = buildLineAmounts({ quantity: 1, unit_price: 4500 });
    expect(line.gross).toBe(4500);
    expect(line.tax + line.net).toBe(4500);
  });
});

describe('buildTotals', () => {
  it('suma correctamente múltiples ítems', () => {
    const items = [
      { quantity: 1, unit_price: 1190 },
      { quantity: 2, unit_price: 2380 },
    ];
    const t = buildTotals(items);
    expect(t.total).toBe(1190 + 4760); // 5950
    expect(t.tax + t.net).toBe(t.total);
  });

  it('exento: total = net, tax = 0', () => {
    const items = [{ quantity: 1, unit_price: 5000 }];
    const t     = buildTotals(items, true);
    expect(t.tax).toBe(0);
    expect(t.net).toBe(5000);
    expect(t.total).toBe(5000);
  });
});
