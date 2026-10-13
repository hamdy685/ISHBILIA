import { describe, it, expect } from 'vitest';
import { buildSupplierRequestWhatsAppText } from '../utils/whatsapp';
import { PurchaseRequest } from '../types/purchaseRequest';

describe('Supplier Quote WhatsApp Text Generator', () => {
  it('formats request items according to handwritten template', () => {
    const mockPr: Partial<PurchaseRequest> = {
      request_number: 'PR-10',
      parcel_reference: '1064',
      region: '22',
      items: [
        {
          id: 1,
          item_description: 'سلك',
          quantity: 50,
          uom: 'لفة',
        } as any,
        {
          id: 2,
          item_description: 'مسمار',
          quantity: 20,
          uom: 'لفة',
        } as any,
        {
          id: 3,
          item_description: 'ابلكاش',
          quantity: 2,
          uom: 'لوح',
        } as any,
      ],
    };

    const text = buildSupplierRequestWhatsAppText(mockPr as PurchaseRequest);

    expect(text).toContain('السلام عليكم');
    expect(text).toContain('مطلوب');
    expect(text).toContain('الصنف | الوحدة | الكمية');
    expect(text).toContain('سلك | رول | 50');
    expect(text).toContain('مسمار | رول | 20');
    expect(text).toContain('ابلكاش | لوح | 2');
    expect(text).toContain('ق 1064  م 22');
  });

  it('handles items without parcel or region gracefully', () => {
    const mockPr: Partial<PurchaseRequest> = {
      request_number: 'PR-54',
      items: [
        {
          id: 1,
          item_description: 'دسبنسر مياه',
          quantity: 1,
          uom: 'PCS',
        } as any,
      ],
    };

    const text = buildSupplierRequestWhatsAppText(mockPr as PurchaseRequest);
    expect(text).toContain('السلام عليكم');
    expect(text).toContain('مطلوب');
    expect(text).toContain('دسبنسر مياه | قطعة | 1');
  });
});
