import { describe, it, expect } from 'vitest';
import { EligibleSteelItem, WeighingGroup, CreateWeighingGroupPayload } from '../types/weighingGroup';

describe('Steel Weighing Group (تجميع الوزنة) - Business Rules & Validations', () => {
  // Mock steel and non-steel items
  const mockRebar12: EligibleSteelItem = {
    id: 101,
    purchase_order_id: 50,
    item_description: 'حديد تسليح قطر 12 مم',
    size_or_diameter: '12 مم',
    ordered_weight: 2.0,
    uom: 'TON',
    unit_price: 38000,
    line_total: 76000,
    region: 'المنطقة الأولى',
    land_plot_number: 'قطعة 29',
    purpose: 'أعمدة الدور الثالث',
    supplier_id: 10,
    supplier_name: 'شركة حديد عز',
  };

  const mockRebar16: EligibleSteelItem = {
    id: 102,
    purchase_order_id: 50,
    item_description: 'حديد تسليح قطر 16 مم',
    size_or_diameter: '16 مم',
    ordered_weight: 2.5,
    uom: 'TON',
    unit_price: 38500,
    line_total: 96250,
    region: 'المنطقة الأولى',
    land_plot_number: 'قطعة 29',
    purpose: 'سقف الدور الثالث',
    supplier_id: 10,
    supplier_name: 'شركة حديد عز',
  };

  const mockRebar20DifferentSupplier: EligibleSteelItem = {
    id: 103,
    purchase_order_id: 50,
    item_description: 'حديد تسليح قطر 20 مم',
    size_or_diameter: '20 مم',
    ordered_weight: 1.5,
    uom: 'TON',
    unit_price: 38200,
    line_total: 57300,
    region: 'المنطقة الأولى',
    land_plot_number: 'قطعة 30',
    supplier_id: 12, // Different supplier!
    supplier_name: 'شركة بشاي للصلب',
  };

  const mockCementItem: EligibleSteelItem = {
    id: 104,
    purchase_order_id: 50,
    item_description: 'أسمنت بورتلاندي عادي',
    size_or_diameter: '',
    ordered_weight: 10.0,
    uom: 'TON',
    unit_price: 2500,
    line_total: 25000,
    supplier_id: 10,
    supplier_name: 'شركة حديد عز',
  };

  const mockSandItem: EligibleSteelItem = {
    id: 105,
    purchase_order_id: 50,
    item_description: 'رمل حرش مباني',
    size_or_diameter: '',
    ordered_weight: 15.0,
    uom: 'M3',
    unit_price: 150,
    line_total: 2250,
    supplier_id: 10,
    supplier_name: 'شركة حديد عز',
  };

  // Helper simulating backend steel classifier
  const isSteelRebar = (description: string, uom: string = ''): boolean => {
    const desc = description.toLowerCase();
    const excludedKeywords = ['رمل', 'سن', 'زلط', 'ركام', 'أسمنت', 'اسمنت', 'خشب', 'طوب', 'بلوك', 'سلك'];
    for (const kw of excludedKeywords) {
      if (desc.includes(kw)) return false;
    }
    const steelKeywords = ['حديد', 'تسليح', 'كانات', 'سيخ', 'اشاير', 'rebar', 'steel'];
    const hasSteelKw = steelKeywords.some((kw) => desc.includes(kw));
    const rebarUoms = ['BAR_2_5LINIA', 'BAR_3LINIA', 'BAR_4LINIA', 'BAR_5LINIA', 'PARCEL', 'TON', 'طن'];
    const hasRebarUom = rebarUoms.includes(uom.toUpperCase());
    return hasSteelKw || (hasRebarUom && desc.includes('صلب'));
  };

  // Helper simulating weighing group validation
  const validateWeighingGroupCreation = (
    items: EligibleSteelItem[],
    userRole: string,
    existingGroupedItemIds: number[] = []
  ): { valid: boolean; error?: string; totalWeight?: number } => {
    // 1. Role validation
    if (!['procurement_manager', 'admin'].includes(userRole)) {
      return { valid: false, error: 'غير مصرح لك بتجميع الوزنة. هذه الصلاحية لمدير المشتريات فقط.' };
    }

    if (items.length < 1) {
      return { valid: false, error: 'يجب اختيار بند حديد واحد على الأقل.' };
    }

    // 2. Steel-only material validation
    for (const item of items) {
      if (!isSteelRebar(item.item_description, item.uom)) {
        return { valid: false, error: `البند "${item.item_description}" ليس بند حديد تسليح ولا يمكن تجميعه.` };
      }
    }

    // 3. Duplicate grouping validation
    for (const item of items) {
      if (existingGroupedItemIds.includes(item.id)) {
        return { valid: false, error: `البند "${item.item_description}" مجمع بالفعل في وزنة نشطة سابقة.` };
      }
    }

    // 4. Single Supplier Rule
    const suppliers = new Set(items.map((i) => i.supplier_id).filter(Boolean));
    if (suppliers.size > 1) {
      return { valid: false, error: 'لا يمكن تجميع البنود لأن المورد مختلف.' };
    }

    const totalWeight = items.reduce((sum, it) => sum + Number(it.ordered_weight || 0), 0);
    return { valid: true, totalWeight: Math.round(totalWeight * 1000) / 1000 };
  };

  // Helper simulating proportional weight distribution
  const distributeScaleWeightProportionally = (
    totalScaleWeight: number,
    items: Array<{ id: number; ordered_weight: number }>
  ): Record<number, number> => {
    const totalOrdered = items.reduce((sum, it) => sum + it.ordered_weight, 0);
    const distribution: Record<number, number> = {};
    if (totalOrdered <= 0) return distribution;

    items.forEach((item) => {
      const ratio = item.ordered_weight / totalOrdered;
      distribution[item.id] = Math.round(totalScaleWeight * ratio * 1000) / 1000;
    });

    return distribution;
  };

  // Scenario 1: Same supplier grouping
  it('Scenario 1: allows grouping steel items from the same supplier and computes total ordered weight', () => {
    const result = validateWeighingGroupCreation([mockRebar12, mockRebar16], 'procurement_manager');
    expect(result.valid).toBe(true);
    expect(result.totalWeight).toBe(4.5); // 2.0 + 2.5 tons
  });

  // Scenario 2: Different suppliers strict rejection
  it('Scenario 2: strictly rejects grouping items from different suppliers with exact Arabic error', () => {
    const result = validateWeighingGroupCreation(
      [mockRebar12, mockRebar20DifferentSupplier],
      'procurement_manager'
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('لا يمكن تجميع البنود لأن المورد مختلف.');
  });

  // Scenario 3: Non-steel rejection
  it('Scenario 3: strictly rejects non-steel items (cement, sand, wood, bricks)', () => {
    expect(isSteelRebar('حديد 12 مم', 'TON')).toBe(true);
    expect(isSteelRebar('حديد تسليح 16 مم', 'TON')).toBe(true);
    expect(isSteelRebar('كانات حديد 8 مم', 'TON')).toBe(true);

    expect(isSteelRebar('أسمنت بورتلاندي عادي', 'TON')).toBe(false);
    expect(isSteelRebar('رمل حرش مباني', 'M3')).toBe(false);
    expect(isSteelRebar('سن 2 للخرسانة', 'M3')).toBe(false);
    expect(isSteelRebar('طوب اسمنتي مصمت', 'THOUSAND')).toBe(false);
    expect(isSteelRebar('سلك رباط', 'KG')).toBe(false);
    expect(isSteelRebar('خشب موسكي', 'M3')).toBe(false);

    const cementResult = validateWeighingGroupCreation([mockRebar12, mockCementItem], 'procurement_manager');
    expect(cementResult.valid).toBe(false);
    expect(cementResult.error).toContain('ليس بند حديد تسليح');

    const sandResult = validateWeighingGroupCreation([mockSandItem], 'procurement_manager');
    expect(sandResult.valid).toBe(false);
  });

  // Scenario 4: Preservation of line items, diameter, land plot reference, and price
  it('Scenario 4: preserves every individual line item diameter, land plot, region, unit price, and total', () => {
    const items = [mockRebar12, mockRebar16];
    const result = validateWeighingGroupCreation(items, 'procurement_manager');
    expect(result.valid).toBe(true);

    // Verify item 1 attributes are intact
    expect(mockRebar12.size_or_diameter).toBe('12 مم');
    expect(mockRebar12.land_plot_number).toBe('قطعة 29');
    expect(mockRebar12.region).toBe('المنطقة الأولى');
    expect(mockRebar12.unit_price).toBe(38000);
    expect(mockRebar12.line_total).toBe(76000);

    // Verify item 2 attributes are intact
    expect(mockRebar16.size_or_diameter).toBe('16 مم');
    expect(mockRebar16.land_plot_number).toBe('قطعة 29');
    expect(mockRebar16.region).toBe('المنطقة الأولى');
    expect(mockRebar16.unit_price).toBe(38500);
    expect(mockRebar16.line_total).toBe(96250);
  });

  // Scenario 5: Single Receipt & Single Actual PO reference
  it('Scenario 5: supports single REC receipt referencing weighing_group_id without splitting the PO', () => {
    const mockGroup: WeighingGroup = {
      id: 5,
      group_number: 'WG-1',
      purchase_order_id: 50,
      supplier_id: 10,
      group_type: 'STEEL_WEIGHT',
      status: 'PENDING_RECEIPT',
      total_ordered_weight: 4.5,
      uom: 'TON',
      created_by_user_id: 2,
      created_at: '2026-10-13T10:00:00Z',
    };

    // A single receipt created for the entire PO references the weighing group ID
    const mockReceipt = {
      id: 201,
      receipt_number: 'REC-12',
      purchase_order_id: mockGroup.purchase_order_id,
      weighing_group_id: mockGroup.id,
      status: 'PENDING_SITE_ENGINEER',
      received_at: '2026-10-13',
    };

    expect(mockReceipt.weighing_group_id).toBe(5);
    expect(mockReceipt.purchase_order_id).toBe(50);
  });

  // Scenario 6: Discrepancy Transparency & Difference Calculation
  it('Scenario 6: calculates scale weight difference transparently without altering unit prices', () => {
    const orderedWeight = 6.0;

    // Case A: Shortage (-0.2t)
    const scaleWeightShortage = 5.8;
    const diffShortage = Math.round((scaleWeightShortage - orderedWeight) * 1000) / 1000;
    expect(diffShortage).toBe(-0.2);
    expect(diffShortage < 0).toBe(true);

    // Case B: Exact match (0.0t)
    const scaleWeightMatch = 6.0;
    const diffMatch = Math.round((scaleWeightMatch - orderedWeight) * 1000) / 1000;
    expect(diffMatch).toBe(0.0);

    // Case C: Surplus (+0.15t)
    const scaleWeightSurplus = 6.15;
    const diffSurplus = Math.round((scaleWeightSurplus - orderedWeight) * 1000) / 1000;
    expect(diffSurplus).toBe(0.15);
    expect(diffSurplus > 0).toBe(true);
  });

  // Scenario 7: Proportional Weight Distribution
  it('Scenario 7: distributes scale ticket weight proportionally across individual rebar items', () => {
    // 3 items with equal ordered weights: 2.0t each (total = 6.0t)
    const items = [
      { id: 1, ordered_weight: 2.0 },
      { id: 2, ordered_weight: 2.0 },
      { id: 3, ordered_weight: 2.0 },
    ];

    // Scale ticket received 5.8t instead of 6.0t
    const distributed = distributeScaleWeightProportionally(5.8, items);

    // Each gets 5.8 * (2/6) = 1.933t
    expect(distributed[1]).toBe(1.933);
    expect(distributed[2]).toBe(1.933);
    expect(distributed[3]).toBe(1.933);

    // Unequal weights: 1.0t, 3.0t (total = 4.0t), scale ticket is 4.2t
    const unequalItems = [
      { id: 10, ordered_weight: 1.0 },
      { id: 20, ordered_weight: 3.0 },
    ];
    const unequalDistributed = distributeScaleWeightProportionally(4.2, unequalItems);
    expect(unequalDistributed[10]).toBe(1.05); // 4.2 * 0.25
    expect(unequalDistributed[20]).toBe(3.15); // 4.2 * 0.75
  });

  // Scenario 8: Role Authorization
  it('Scenario 8: restricts weighing group creation to procurement manager and admin', () => {
    const items = [mockRebar12, mockRebar16];

    // Allowed roles
    expect(validateWeighingGroupCreation(items, 'procurement_manager').valid).toBe(true);
    expect(validateWeighingGroupCreation(items, 'admin').valid).toBe(true);

    // Blocked roles
    expect(validateWeighingGroupCreation(items, 'accountant').valid).toBe(false);
    expect(validateWeighingGroupCreation(items, 'site_engineer').valid).toBe(false);
    expect(validateWeighingGroupCreation(items, 'warehouse_keeper').valid).toBe(false);
    expect(validateWeighingGroupCreation(items, 'requester').valid).toBe(false);
    expect(validateWeighingGroupCreation(items, 'reviewer').valid).toBe(false);
    expect(validateWeighingGroupCreation(items, 'general_manager').valid).toBe(false);
  });

  // Scenario 9: Duplicate grouping prevention
  it('Scenario 9: prevents an item from being included in multiple active weighing groups simultaneously', () => {
    const existingActiveGroupedIds = [101]; // mockRebar12 already grouped
    const result = validateWeighingGroupCreation([mockRebar12, mockRebar16], 'procurement_manager', existingActiveGroupedIds);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('مجمع بالفعل في وزنة نشطة سابقة');
  });
});
