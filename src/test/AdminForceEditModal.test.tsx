import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminForceEditModal } from '../components/admin/AdminForceEditModal';
import * as masterOrdersApi from '../api/admin/masterOrders';

vi.mock('../api/admin/masterOrders', () => ({
  getOrderMasterDetailsApi: vi.fn(),
  forceUpdateOrderApi: vi.fn(),
}));

describe('AdminForceEditModal', () => {
  const mockOrderMasterDetails = {
    success: true,
    data: {
      order: {
        id: 77,
        po_number: 'PO-2026-00077',
        status: 'ISSUED',
        supplier_id: 10,
        subtotal: 36137.5,
        grand_total: 36137.5,
        delivery_date: '2026-10-25',
        actual_delivery_date: '2026-10-26',
        items: [
          {
            id: 201,
            item_description: 'طوب أحمر مفرغ',
            item_reference: '142',
            region: 'A1',
            quantity: 12,
            uom: 'BRICKS',
            unit_price: 2450,
            supplier_id: 10,
          },
          {
            id: 202,
            item_description: 'اسمنت المعلم',
            item_reference: '142',
            region: 'A1',
            quantity: 1.75,
            uom: 'TON',
            unit_price: 3850,
            supplier_id: 10,
          },
        ],
      },
      available_suppliers: [
        { id: 10, company_name: 'شركة التوريدات الأولى (أ)', name: 'المورد أ' },
        { id: 20, company_name: 'شركة الطوب الأحمر الحديث (ب)', name: 'المورد ب' },
        { id: 30, company_name: 'مؤسسة أسمنت المعلم (ج)', name: 'المورد ج' },
      ],
      allowed_statuses: [
        { value: 'ISSUED', label: 'صادر ومعتمد للتوريد' },
        { value: 'PENDING_ACTUAL_PO', label: 'تم الاستلام - بانتظار الأمر الفعلي' },
      ],
      audit_logs: [],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(masterOrdersApi.getOrderMasterDetailsApi).mockResolvedValue(mockOrderMasterDetails as any);
    vi.mocked(masterOrdersApi.forceUpdateOrderApi).mockResolvedValue({
      success: true,
      message: 'تم التعديل بنجاح',
      data: {},
    });
  });

  it('renders table with supplier column and allows changing line item supplier', async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(
      <AdminForceEditModal
        orderId={77}
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('طوب أحمر مفرغ')).toBeInTheDocument();
    });

    // Check that table has "المورد" header
    expect(screen.getByText('المورد')).toBeInTheDocument();

    // Check item supplier selects
    const selects = screen.getAllByRole('combobox');
    // There are status select, header supplier select, and 2 item supplier selects
    expect(selects.length).toBeGreaterThanOrEqual(4);

    // Enter admin reason
    const reasonInput = screen.getByPlaceholderText(/اكتب سبب قيامك/i);
    fireEvent.change(reasonInput, { target: { value: 'تعديل موردي البنود استثنائياً' } });

    // Click submit
    const submitBtn = screen.getByRole('button', { name: /حفظ وتثبيت التعديل السيادي/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(masterOrdersApi.forceUpdateOrderApi).toHaveBeenCalledWith(
        77,
        expect.objectContaining({
          admin_reason: 'تعديل موردي البنود استثنائياً',
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 201,
              supplier_id: 10,
            }),
            expect.objectContaining({
              id: 202,
              supplier_id: 10,
            }),
          ]),
        })
      );
    });
  });

  it('applies header supplier to all items when quick action button is clicked', async () => {
    render(
      <AdminForceEditModal
        orderId={77}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('طوب أحمر مفرغ')).toBeInTheDocument();
    });

    // Change header supplier to 30
    const headerSupplierLabel = screen.getByText('المورد المعتمد للطلب:');
    const headerSelect = headerSupplierLabel.parentElement?.nextElementSibling as HTMLSelectElement;
    fireEvent.change(headerSelect, { target: { value: '30' } });

    // Quick apply button should appear
    const quickApplyBtn = screen.getByText(/⚡ تطبيق على كل البنود/i);
    fireEvent.click(quickApplyBtn);

    // Enter reason and submit
    const reasonInput = screen.getByPlaceholderText(/اكتب سبب قيامك/i);
    fireEvent.change(reasonInput, { target: { value: 'تطبيق مورد الأسمنت على الجميع' } });

    const submitBtn = screen.getByRole('button', { name: /حفظ وتثبيت التعديل السيادي/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(masterOrdersApi.forceUpdateOrderApi).toHaveBeenCalledWith(
        77,
        expect.objectContaining({
          supplier_id: 30,
          items: expect.arrayContaining([
            expect.objectContaining({ id: 201, supplier_id: 30 }),
            expect.objectContaining({ id: 202, supplier_id: 30 }),
          ]),
        })
      );
    });
  });
});
