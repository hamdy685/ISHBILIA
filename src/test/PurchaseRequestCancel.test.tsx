import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CancelRequestDialog from '../components/purchase-requests/CancelRequestDialog';
import PurchaseRequestTable from '../components/purchase-requests/PurchaseRequestTable';
import { PurchaseRequest } from '../types/purchaseRequest';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockAuthUser = {
  user: {
    id: 10,
    name: 'أحمد الموظف',
    email: 'employee@company.test',
  },
  token: 'mock-token',
  hasPermission: () => true,
  hasRole: () => false,
  hasAnyRole: () => false,
  isLoading: false,
};

const makeMockPR = (overrides: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
  id: 101,
  request_number: 'PR-2026-0101',
  user_id: 10,
  department_id: 1,
  status: 'REJECTED',
  priority: 'NORMAL',
  notes: 'طلب شراء خراطيم مياه',
  rejection_reason: 'الميزانية غير كافية للشهر الحالي',
  items_count: 2,
  items: [],
  created_at: '2026-10-23T10:00:00Z',
  updated_at: '2026-10-23T10:00:00Z',
  ...overrides,
});

describe('PurchaseRequest Cancel Dialog & Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue(mockAuthUser);
  });

  describe('CancelRequestDialog Component', () => {
    it('renders dialog when isOpen is true with request number', () => {
      render(
        <CancelRequestDialog
          isOpen={true}
          requestNumber="PR-2026-0101"
          isCancelling={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('إلغاء طلب الشراء')).toBeInTheDocument();
      expect(screen.getAllByText(/PR-2026-0101/).length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText(/تم الاستغناء عن الشراء/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /تأكيد إلغاء الطلب/i })).toBeInTheDocument();
    });

    it('calls onConfirm with the entered reason', () => {
      const handleConfirm = vi.fn();
      render(
        <CancelRequestDialog
          isOpen={true}
          requestNumber="PR-2026-0101"
          isCancelling={false}
          onConfirm={handleConfirm}
          onCancel={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText(/تم الاستغناء عن الشراء/i);
      fireEvent.change(textarea, { target: { value: 'تم توفير المواد من موقع مجاور' } });

      const confirmBtn = screen.getByRole('button', { name: /تأكيد إلغاء الطلب/i });
      fireEvent.click(confirmBtn);

      expect(handleConfirm).toHaveBeenCalledWith('تم توفير المواد من موقع مجاور');
    });

    it('calls onConfirm even with empty reason since it is optional', () => {
      const handleConfirm = vi.fn();
      render(
        <CancelRequestDialog
          isOpen={true}
          requestNumber="PR-2026-0101"
          isCancelling={false}
          onConfirm={handleConfirm}
          onCancel={vi.fn()}
        />
      );

      const confirmBtn = screen.getByRole('button', { name: /تأكيد إلغاء الطلب/i });
      fireEvent.click(confirmBtn);

      expect(handleConfirm).toHaveBeenCalledWith('');
    });

    it('calls onCancel when close button is clicked', () => {
      const handleCancel = vi.fn();
      render(
        <CancelRequestDialog
          isOpen={true}
          requestNumber="PR-2026-0101"
          isCancelling={false}
          onConfirm={vi.fn()}
          onCancel={handleCancel}
        />
      );

      const closeBtn = screen.getByRole('button', { name: /إغلاق النافذة/i });
      fireEvent.click(closeBtn);

      expect(handleCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('PurchaseRequestTable Cancel Button', () => {
    it('shows cancel button for REJECTED requests and triggers onOpenCancelModal', () => {
      const handleOpenCancel = vi.fn();
      const prRejected = makeMockPR({ status: 'REJECTED' });

      render(
        <MemoryRouter>
          <PurchaseRequestTable
            requests={[prRejected]}
            onOpenCancelModal={handleOpenCancel}
          />
        </MemoryRouter>
      );

      const cancelBtns = screen.getAllByRole('button', { name: /إلغاء/i });
      expect(cancelBtns.length).toBeGreaterThan(0);

      fireEvent.click(cancelBtns[0]);
      expect(handleOpenCancel).toHaveBeenCalledWith(prRejected);
    });

    it('shows cancel button for RETURNED requests and triggers onOpenCancelModal', () => {
      const handleOpenCancel = vi.fn();
      const prReturned = makeMockPR({ status: 'RETURNED' });

      render(
        <MemoryRouter>
          <PurchaseRequestTable
            requests={[prReturned]}
            onOpenCancelModal={handleOpenCancel}
          />
        </MemoryRouter>
      );

      const cancelBtns = screen.getAllByRole('button', { name: /إلغاء/i });
      expect(cancelBtns.length).toBeGreaterThan(0);

      fireEvent.click(cancelBtns[0]);
      expect(handleOpenCancel).toHaveBeenCalledWith(prReturned);
    });

    it('does NOT show cancel button for APPROVED_BY_REVIEWER or PO_ISSUED requests', () => {
      const handleOpenCancel = vi.fn();
      const prApproved = makeMockPR({ status: 'APPROVED_BY_REVIEWER' });

      render(
        <MemoryRouter>
          <PurchaseRequestTable
            requests={[prApproved]}
            onOpenCancelModal={handleOpenCancel}
          />
        </MemoryRouter>
      );

      expect(screen.queryByRole('button', { name: /إلغاء/i })).not.toBeInTheDocument();
    });
  });
});
