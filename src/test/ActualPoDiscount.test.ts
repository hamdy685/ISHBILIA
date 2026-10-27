import { describe, it, expect } from 'vitest';
import { calculateActualPoFinancials } from '../utils/actualPo';

describe('Actual PO Discount Financials Calculations', () => {
  const sampleItems = [
    { id: 1, item_name: 'حديد تسليح 12 مم', quantity: 10, unit_price: 5000, line_total: 50000, is_discount_applied: true },
    { id: 2, item_name: 'أسمنت مقاوم', quantity: 20, unit_price: 1500, line_total: 30000, is_discount_applied: false },
    { id: 3, item_name: 'طوب أسمنتي مصمت', quantity: 1000, unit_price: 20, line_total: 20000, is_discount_applied: true },
  ];

  it('calculates financials correctly when discount_type is NONE', () => {
    const result = calculateActualPoFinancials(sampleItems, 'NONE', 0, 0);

    expect(result.subtotal).toBe(100000);
    expect(result.discountType).toBe('NONE');
    expect(result.discountPercentage).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.grandTotal).toBe(100000);
  });

  it('calculates total order discount correctly (10% on 100,000 = 10,000 discount)', () => {
    const result = calculateActualPoFinancials(sampleItems, 'TOTAL', 10, 0);

    expect(result.subtotal).toBe(100000);
    expect(result.discountType).toBe('TOTAL');
    expect(result.discountPercentage).toBe(10);
    expect(result.discountAmount).toBe(10000);
    expect(result.grandTotal).toBe(90000);
  });

  it('calculates selected items discount correctly (10% on only selected items: 50,000 + 20,000 = 70,000 -> 7,000 discount)', () => {
    const result = calculateActualPoFinancials(sampleItems, 'SELECTED_ITEMS', 10, 0);

    expect(result.subtotal).toBe(100000);
    expect(result.discountType).toBe('SELECTED_ITEMS');
    expect(result.targetedSubtotal).toBe(70000);
    expect(result.targetedCount).toBe(2);
    expect(result.discountPercentage).toBe(10);
    expect(result.discountAmount).toBe(7000);
    expect(result.grandTotal).toBe(93000);
  });

  it('does not apply discount to unselected items when SELECTED_ITEMS mode is active', () => {
    // Only item 2 is targeted
    const items = [
      { id: 1, quantity: 10, unit_price: 5000, is_discount_applied: false },
      { id: 2, quantity: 20, unit_price: 1500, is_discount_applied: true },
      { id: 3, quantity: 1000, unit_price: 20, is_discount_applied: false },
    ];

    const result = calculateActualPoFinancials(items, 'SELECTED_ITEMS', 5, 0);

    expect(result.subtotal).toBe(100000);
    expect(result.targetedSubtotal).toBe(30000);
    expect(result.targetedCount).toBe(1);
    expect(result.discountAmount).toBe(1500); // 5% of 30,000
    expect(result.grandTotal).toBe(98500);
  });

  it('correctly includes tax_amount in grand_total with discount', () => {
    const result = calculateActualPoFinancials(sampleItems, 'TOTAL', 10, 5000);

    expect(result.subtotal).toBe(100000);
    expect(result.discountAmount).toBe(10000);
    expect(result.taxAmount).toBe(5000);
    expect(result.grandTotal).toBe(95000); // 100000 - 10000 + 5000
  });

  it('clamps discount percentage between 0 and 100%', () => {
    const resultNegative = calculateActualPoFinancials(sampleItems, 'TOTAL', -15, 0);
    expect(resultNegative.discountPercentage).toBe(0);
    expect(resultNegative.discountAmount).toBe(0);
    expect(resultNegative.grandTotal).toBe(100000);

    const resultOver100 = calculateActualPoFinancials(sampleItems, 'TOTAL', 150, 0);
    expect(resultOver100.discountPercentage).toBe(100);
    expect(resultOver100.discountAmount).toBe(100000);
    expect(resultOver100.grandTotal).toBe(0);
  });

  it('accepts options object syntax safely', () => {
    const result = calculateActualPoFinancials({
      items: sampleItems,
      discountType: 'SELECTED_ITEMS',
      discountPercentage: 15,
      taxAmount: 2500,
    });

    expect(result.subtotal).toBe(100000);
    expect(result.targetedSubtotal).toBe(70000);
    expect(result.discountAmount).toBe(10500); // 15% of 70,000
    expect(result.taxAmount).toBe(2500);
    expect(result.grandTotal).toBe(92000); // 100000 - 10500 + 2500
  });
});
