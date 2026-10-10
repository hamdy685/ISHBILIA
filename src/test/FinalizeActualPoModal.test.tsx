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
      expect(screen.getByText(/شركة الأمل لمواد البناء/)).toBeInTheDocument();
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
});
