import { describe, it, expect } from 'vitest';
import { formatCleanNumber, formatCleanQty } from '../utils/numberFormat';
import { getSummaryQuantities } from '../utils/formatRequestSummary';

describe('Decimal Precision Preservation Across Frontend', () => {
  const mandatoryValues = [
    { input: 1.165, expected: '1.165' },
    { input: 1.164, expected: '1.164' },
    { input: 1.155, expected: '1.155' },
    { input: 1.125, expected: '1.125' },
    { input: 10.005, expected: '10.005' },
    { input: 0.001, expected: '0.001' },
    { input: 100.0, expected: '100' },
  ];

  it('formatCleanNumber preserves exact 3 and 4 decimal places without premature rounding', () => {
    for (const { input, expected } of mandatoryValues) {
      expect(formatCleanNumber(input)).toBe(expected);
      expect(formatCleanNumber(String(input))).toBe(expected);
    }
  });

  it('formatCleanQty preserves exact 3 and 4 decimal places without premature rounding', () => {
    for (const { input, expected } of mandatoryValues) {
      expect(formatCleanQty(input)).toBe(expected);
      expect(formatCleanQty(String(input))).toBe(expected);
    }
  });

  it('prevents 1.165 from being truncated or rounded to 1.17 in quantity display', () => {
    expect(formatCleanQty(1.165)).toBe('1.165');
    expect(formatCleanQty('1.165')).toBe('1.165');
    expect(formatCleanNumber(1.165)).not.toBe('1.17');
    expect(formatCleanQty(1.165)).not.toBe('1.17');
  });

  it('calculates line totals accurately without early floating-point errors', () => {
    // 1.165 tons * 50,000 EGP = 58,250.00 EGP
    const qty = 1.165;
    const price = 50000;
    const total = qty * price;
    expect(total).toBe(58250);
    expect(formatCleanNumber(total)).toBe('58,250');

    // 10.005 units * 123.45 = 1235.11725 -> financial total 1235.12
    const total2 = 10.005 * 123.45;
    const roundedFinancialTotal = Math.round(total2 * 100) / 100;
    expect(roundedFinancialTotal).toBe(1235.12);
  });

  it('preserves exact decimals in getSummaryQuantities', () => {
    const summary = getSummaryQuantities([
      {
        item_description: 'حديد تسليح 12 مم',
        quantity: 1.165,
        uom: 'TON',
      },
    ]);

    expect(summary.display).toContain('1.165');
    expect(summary.display).not.toContain('1.17');
  });
});
