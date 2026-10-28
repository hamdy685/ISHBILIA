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

  it('renders strictly four columns in exact order without parcel/region column', () => {
    const { container } = render(
      <SiteReceiptItemsTable
        receipt={sampleReceipt}
        quantities={{
          'receipt-101-1': '4',
          'receipt-101-2': '2',
          'receipt-101-3': '5',
        }}
      />
    );

    // Exact 4 table headers exist in order
    const ths = container.querySelectorAll('thead th');
    expect(ths.length).toBe(4);
    expect(ths[0].textContent?.trim()).toBe('البند والمواصفات');
    expect(ths[1].textContent?.trim()).toBe('كمية المخزن');
    expect(ths[2].textContent?.trim()).toBe('الكمية المعتمدة مدنيًا');
    expect(ths[3].textContent?.trim()).toBe('الوحدة');

    // Parcel / Region column must NOT exist in the table
    expect(screen.queryByText('القطعة / المنطقة')).not.toBeInTheDocument();

    // Verify all 3 item names are rendered
    expect(screen.getByText('حديد تسليح قطر 16 مم عز الدخيلة عالي المقاومة')).toBeInTheDocument();
    expect(screen.getByText('خرسانة مسلحة للقواعد العادية رتبة 250')).toBeInTheDocument();
    expect(screen.getByText('أسمنت مقاوم للأملاح بورتلاندي سي ووتر معتمد')).toBeInTheDocument();

    // Verify units of measure are displayed in column 4
    const tonUnits = screen.getAllByText('طن');
    expect(tonUnits.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('م³')).toBeInTheDocument();

    // Verify recorded warehouse quantities in column 2
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('5')).toBeInTheDocument();

    // Verify table layout is fixed and width is 100%
    const table = container.querySelector('table');
    expect(table).toHaveStyle({ tableLayout: 'fixed', width: '100%' });
  });

  it('allows editing confirmed quantity for each item row with proper id and bounds', () => {
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
    expect(input1).toHaveAttribute('id', 'site-qty-receipt-101-1');

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
  });

  it('renders read-only view in Archive tab without quantity input fields', () => {
    const { container } = render(
      <SiteReceiptItemsTable
        receipt={sampleReceipt}
        readOnly={true}
      />
    );

    // In read-only mode, inputs are replaced by plain text / badge
    expect(screen.queryByPlaceholderText('0')).not.toBeInTheDocument();

    // Headers remain exact 4 columns
    const ths = container.querySelectorAll('thead th');
    expect(ths.length).toBe(4);
    expect(screen.getByText('كمية المخزن')).toBeInTheDocument();
    expect(screen.getByText('الكمية المعتمدة مدنيًا')).toBeInTheDocument();
    expect(screen.getByText('الوحدة')).toBeInTheDocument();
  });

  it('has zero overflow and fits within 100% on small mobile viewports (320px, 360px, 390px, 430px)', () => {
    const viewports = [320, 360, 390, 430];

    for (const width of viewports) {
      const { container, unmount } = render(
        <div style={{ width: `${width}px`, maxWidth: '100%' }}>
          <SiteReceiptItemsTable
            receipt={sampleReceipt}
            quantities={{}}
          />
        </div>
      );

      const table = container.querySelector('table');
      expect(table).not.toBeNull();
      // Ensure no min-w or fixed pixel width forces it beyond the viewport
      expect(table?.className).not.toContain('min-w-[');
      expect(table?.style.width).toBe('100%');
      expect(table?.style.tableLayout).toBe('fixed');

      unmount();
    }
  });
});
