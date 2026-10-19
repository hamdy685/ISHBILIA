import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FinalizeActualPoModal } from '../components/procurement/FinalizeActualPoModal';
import * as purchaseOrdersApi from '../api/purchaseOrders';
import { PurchaseOrder } from '../types/purchaseOrder';

vi.mock('../api/purchaseOrders', () => ({
  getPurchaseOrderApi: vi.fn(),
  updatePurchaseOrderApi: vi.fn(),
  finalizeActualPurchaseOrderApi: vi.fn(),
}));

vi.mock('../api/suppliers', () => ({
  getSuppliersApi: vi.fn().mockResolvedValue([
    {
      id: 12,
      company_name: 'شركة الأمل لمواد البناء',
      is_active: true,
    },
    {
      id: 99,
      company_name: 'شركة النور للتوريدات',
      is_active: true,
    },
  ]),
}));

vi.mock('../utils/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('FinalizeActualPoModal', () => {
  const mockPo: PurchaseOrder = {
    id: 101,
    po_number: 'PO-2026-00101',
    purchase_request_id: 55,
    supplier_id: 12,
    status: 'PENDING_ACTUAL_PO',
    grand_total: 2900,
    subtotal: 2900,
    created_at: '2026-10-08T10:00:00Z',
    updated_at: '2026-10-08T10:00:00Z',
    supplier: {
      id: 12,
      company_name: 'شركة الأمل لمواد البناء',
      is_active: true,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    items: [
      {
        id: 501,
        purchase_order_id: 101,
        item_description: 'حديد تسليح 12 مم',
        item_reference: '1518',
        region: 'أكتوبر',
        quantity: 1,
        uom: 'TON',
        unit_price: 2900,
        line_total: 2900,
      },
    ],
    receipts: [
      {
        id: 701,
        receipt_number: 'GRN-2026-00701',
        purchase_order_id: 101,
        status: 'APPROVED',
        created_at: '2026-10-08T11:00:00Z',
        updated_at: '2026-10-08T11:00:00Z',
        items: [
          {
            id: 801,
            purchase_receipt_id: 701,
            purchase_order_item_id: 501,
            received_quantity: 1,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state and then shows PO items and buttons', async () => {
    vi.mocked(purchaseOrdersApi.getPurchaseOrderApi).mockResolvedValueOnce(mockPo);

    render(
      <FinalizeActualPoModal
        isOpen={true}
        poId={101}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/PO-2026-00101/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/شركة الأمل لمواد البناء/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('حديد تسليح 12 مم').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('💰 اعتماد وإرسال للإدارة المالية')).toBeInTheDocument();
      expect(screen.getByText('💾 حفظ كافة التعديلات')).toBeInTheDocument();
    });
  });

  it('calls finalizeActualPurchaseOrderApi and invokes onSuccess & onClose when clicking send to finance', async () => {
    vi.mocked(purchaseOrdersApi.getPurchaseOrderApi).mockResolvedValueOnce(mockPo);
    vi.mocked(purchaseOrdersApi.finalizeActualPurchaseOrderApi).mockResolvedValueOnce({
      ...mockPo,
      status: 'ISSUED',
    });

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <FinalizeActualPoModal
        isOpen={true}
        poId={101}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('💰 اعتماد وإرسال للإدارة المالية')).toBeInTheDocument();
    });

    const finalizeBtn = screen.getByText('💰 اعتماد وإرسال للإدارة المالية');
    fireEvent.click(finalizeBtn);

    await waitFor(() => {
      expect(purchaseOrdersApi.finalizeActualPurchaseOrderApi).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 501,
              item_description: 'حديد تسليح 12 مم',
              quantity: 1,
              unit_price: 2900,
            }),
          ]),
        })
      );
      expect(onClose).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith('PO-2026-00101');
    });
  });

  it('calls updatePurchaseOrderApi when clicking save changes button', async () => {
    vi.mocked(purchaseOrdersApi.getPurchaseOrderApi).mockResolvedValueOnce(mockPo);
    vi.mocked(purchaseOrdersApi.updatePurchaseOrderApi).mockResolvedValueOnce({
      ...mockPo,
    });

    render(
      <FinalizeActualPoModal
        isOpen={true}
        poId={101}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('💾 حفظ كافة التعديلات')).toBeInTheDocument();
    });

    const saveBtn = screen.getByText('💾 حفظ كافة التعديلات');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(purchaseOrdersApi.updatePurchaseOrderApi).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 501,
              quantity: 1,
              unit_price: 2900,
            }),
          ]),
        })
      );
    });
  });

  it('preserves items with received quantity 0 and allows finalization with quantity 0', async () => {
    const mockPoWithZero: PurchaseOrder = {
      ...mockPo,
      items: [
        {
          id: 501,
          purchase_order_id: 101,
          item_description: 'حديد تسليح 12 مم',
          item_reference: '1518',
          region: 'أكتوبر',
          quantity: 100,
          uom: 'TON',
          unit_price: 1000,
          line_total: 100000,
        },
        {
          id: 502,
          purchase_order_id: 101,
          item_description: 'طوب أسمنتي مصمت',
          item_reference: '1518',
          region: 'أكتوبر',
          quantity: 30,
          uom: 'THOUSAND',
          unit_price: 1500,
          line_total: 45000,
        },
      ],
      receipts: [
        {
          id: 701,
          receipt_number: 'GRN-2026-00701',
          purchase_order_id: 101,
          status: 'APPROVED',
          created_at: '2026-10-08T11:00:00Z',
          updated_at: '2026-10-08T11:00:00Z',
          items: [
            {
              id: 801,
              purchase_receipt_id: 701,
              purchase_order_item_id: 501,
              received_quantity: 100,
            },
            {
              id: 802,
              purchase_receipt_id: 701,
              purchase_order_item_id: 502,
              received_quantity: 0,
            },
          ],
        },
      ],
    };

    vi.mocked(purchaseOrdersApi.getPurchaseOrderApi).mockResolvedValueOnce(mockPoWithZero);
    vi.mocked(purchaseOrdersApi.finalizeActualPurchaseOrderApi).mockResolvedValueOnce({
      ...mockPoWithZero,
      status: 'ISSUED',
    });

    render(
      <FinalizeActualPoModal
        isOpen={true}
        poId={101}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('طوب أسمنتي مصمت').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('حديد تسليح 12 مم').length).toBeGreaterThanOrEqual(1);
    });

    const finalizeBtn = screen.getByText('💰 اعتماد وإرسال للإدارة المالية');
    fireEvent.click(finalizeBtn);

    await waitFor(() => {
      expect(purchaseOrdersApi.finalizeActualPurchaseOrderApi).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 501,
              quantity: 100,
            }),
            expect.objectContaining({
              id: 502,
              quantity: 0,
            }),
          ]),
        })
      );
    });
  });

  it('allows changing supplier per item and sends the updated supplier_id in the payload', async () => {
    vi.mocked(purchaseOrdersApi.getPurchaseOrderApi).mockResolvedValueOnce(mockPo);
    vi.mocked(purchaseOrdersApi.finalizeActualPurchaseOrderApi).mockResolvedValueOnce({
      ...mockPo,
      status: 'ISSUED',
    });

    render(
      <FinalizeActualPoModal
        isOpen={true}
        poId={101}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText('حديد تسليح 12 مم').length).toBeGreaterThanOrEqual(1);
    });

    // Find the supplier select for the item
    const selects = screen.getAllByTitle('تحديد المورد الفعلي لهذا البند');
    expect(selects.length).toBeGreaterThanOrEqual(1);

    // Change supplier to 99
    fireEvent.change(selects[0], { target: { value: '99' } });

    const finalizeBtn = screen.getByText('💰 اعتماد وإرسال للإدارة المالية');
    fireEvent.click(finalizeBtn);

    await waitFor(() => {
      expect(purchaseOrdersApi.finalizeActualPurchaseOrderApi).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 501,
              supplier_id: 99,
            }),
          ]),
        })
      );
    });
  });

  it('allows editing parcel, region, item description and sends them in finalizeActualPurchaseOrderApi payload', async () => {
    vi.mocked(purchaseOrdersApi.getPurchaseOrderApi).mockResolvedValueOnce(mockPo);
    vi.mocked(purchaseOrdersApi.finalizeActualPurchaseOrderApi).mockResolvedValueOnce({
      ...mockPo,
      status: 'ISSUED',
    });

    render(
      <FinalizeActualPoModal
        isOpen={true}
        poId={101}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('💰 اعتماد وإرسال للإدارة المالية')).toBeInTheDocument();
    });

    // Edit header parcel and region
    const parcelInput = screen.getByTitle('رقم قطعة الأرض العام');
    const regionInput = screen.getByTitle('المنطقة / المشروع العام');
    fireEvent.change(parcelInput, { target: { value: '888' } });
    fireEvent.change(regionInput, { target: { value: 'منطقة النرجس' } });

    // Click apply to all
    const applyToAllBtn = screen.getByTitle('تطبيق رقم القطعة والمنطقة على كافة البنود');
    fireEvent.click(applyToAllBtn);

    // Edit item description
    const itemDescInputs = screen.getAllByTitle('تعديل اسم الصنف الفعلي');
    fireEvent.change(itemDescInputs[0], { target: { value: 'حديد تسليح عز 12 مم معدل' } });

    const finalizeBtn = screen.getByText('💰 اعتماد وإرسال للإدارة المالية');
    fireEvent.click(finalizeBtn);

    await waitFor(() => {
      expect(purchaseOrdersApi.finalizeActualPurchaseOrderApi).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          parcel_reference: '888',
          region: 'منطقة النرجس',
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 501,
              item_description: 'حديد تسليح عز 12 مم معدل',
              item_reference: '888',
              region: 'منطقة النرجس',
            }),
          ]),
        })
      );
    });
  });
});
