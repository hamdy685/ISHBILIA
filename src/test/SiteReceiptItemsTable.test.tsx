import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SiteReceiptItemsTable } from '../components/receipts/SiteReceiptItemsTable';
import { ReceiptRecord } from '../api/purchaseReceipts';

describe('SiteReceiptItemsTable Component', () => {
  const sampleReceipt: ReceiptRecord = {
    id: 101,
    receipt_number: 'REC-2026-001',
    status: 'WAREHOUSE_RECEIPT_SUBMITTED',
    items: [
      {
        id: 1,
        received_quantity: 4,
        ordered_quantity: 4,
        notes: null,
        purchase_order_item: {
          id: 501,
          item_description: 'حديد تسليح قطر 16 مم عز الدخيلة عالي المقاومة',
          item_reference: 'قطعة 404',
          region: 'بيت الوطن - الحي الرابع',
          quantity: 4,
          uom: 'طن',
        },
      },
      {
        id: 2,
        received_quantity: 2,
        ordered_quantity: 2,
        notes: 'ملاحظة استلام خرسانة',
        purchase_order_item: {
          id: 502,
          item_description: 'خرسانة مسلحة للقواعد العادية رتبة 250',
          item_reference: 'قطعة 404',
          region: 'بيت الوطن - الحي الرابع',
          quantity: 2,
          uom: 'م³',
        },
      },
      {
        id: 3,
        received_quantity: 5,
        ordered_quantity: 5,
        notes: null,
        purchase_order_item: {
          id: 503,
          item_description: 'أسمنت مقاوم للأملاح بورتلاندي سي ووتر معتمد',
          item_reference: 'قطعة 102',
          region: 'النرجس الجديدة',
          quantity: 5,
          uom: 'طن',
        },
      },
    ],
  };

  it('renders all items as single rows in a compact structured table', () => {
    render(
      <SiteReceiptItemsTable
        receipt={sampleReceipt}
        quantities={{
          'receipt-101-1': '4',
          'receipt-101-2': '2',
          'receipt-101-3': '5',
        }}
      />
    );

    // Table headers exist
    expect(screen.getByText('البند والمواصفات')).toBeInTheDocument();
    expect(screen.getByText('القطعة / المنطقة')).toBeInTheDocument();
    expect(screen.getByText('الوحدة')).toBeInTheDocument();
    expect(screen.getByText('كمية المخزن')).toBeInTheDocument();
    expect(screen.getByText('الكمية المعتمدة ميدانياً')).toBeInTheDocument();
    expect(screen.getByText('ملاحظات')).toBeInTheDocument();

    // Verify all 3 item names are rendered
    expect(screen.getByText('حديد تسليح قطر 16 مم عز الدخيلة عالي المقاومة')).toBeInTheDocument();
    expect(screen.getByText('خرسانة مسلحة للقواعد العادية رتبة 250')).toBeInTheDocument();
    expect(screen.getByText('أسمنت مقاوم للأملاح بورتلاندي سي ووتر معتمد')).toBeInTheDocument();

    // Verify units of measure are displayed
    const tonUnits = screen.getAllByText('طن');
    expect(tonUnits.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('م³')).toBeInTheDocument();

    // Verify recorded warehouse quantities
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('allows editing confirmed quantity for each item row', () => {
    const onQuantityChange = vi.fn();

    render(
      <SiteReceiptItemsTable
        receipt={sampleReceipt}
        quantities={{
          'receipt-101-1': '4',
          'receipt-101-2': '2',
          'receipt-101-3': '5',
        }}
        onQuantityChange={onQuantityChange}
      />
    );

    const input1 = screen.getByDisplayValue('4');
    expect(input1).toBeInTheDocument();
    expect(input1).toHaveAttribute('type', 'number');

    fireEvent.change(input1, { target: { value: '3.5' } });
    expect(onQuantityChange).toHaveBeenCalledWith('receipt-101-1', '3.5');
  });

  it('toggles item note input without disrupting the single row layout', () => {
    const onItemNoteChange = vi.fn();

    render(
      <SiteReceiptItemsTable
        receipt={sampleReceipt}
        quantities={{}}
        itemNotes={{}}
        onItemNoteChange={onItemNoteChange}
      />
    );

    // Click note button for first item
    const noteButtons = screen.getAllByTitle('إضافة ملاحظة على هذا البند');
    fireEvent.click(noteButtons[0]);

    // Note input appears
    const noteInput = screen.getByPlaceholderText('اكتب ملاحظتك على استلام هذا الصنف...');
    expect(noteInput).toBeInTheDocument();

    fireEvent.change(noteInput, { target: { value: 'تم استلام حديد مشون جيداً' } });
    expect(onItemNoteChange).toHaveBeenCalledWith('receipt-101-1', 'تم استلام حديد مشون جيداً');
  });

  it('displays full item details drawer when clicking on truncated item name', () => {
    render(
      <SiteReceiptItemsTable
        receipt={sampleReceipt}
        quantities={{}}
      />
    );

    const itemName = screen.getByText('حديد تسليح قطر 16 مم عز الدخيلة عالي المقاومة');
    fireEvent.click(itemName);

    // Full detail drawer should appear
    expect(screen.getByText('📋 تفاصيل البند كاملة:')).toBeInTheDocument();
    expect(screen.getAllByText(/بيت الوطن - الحي الرابع/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders read-only view in Archive tab without quantity input fields', () => {
    render(
      <SiteReceiptItemsTable
        receipt={sampleReceipt}
        readOnly={true}
      />
    );

    // In read-only mode, inputs are replaced by plain text / badge
    expect(screen.queryByPlaceholderText('0')).not.toBeInTheDocument();
    expect(screen.getByText('الكمية المطلوبة')).toBeInTheDocument();
    expect(screen.getByText('الكمية المستلمة')).toBeInTheDocument();
  });
});
