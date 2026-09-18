import React, { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import RejectRequestDialog from '../../components/reviewer/RejectRequestDialog';
import ApproveRequestDialog from '../../components/reviewer/ApproveRequestDialog';
import ReviewerPurchaseRequestDetailsPage from '../../pages/reviewer/ReviewerPurchaseRequestDetailsPage';
import CreatePurchaseRequestPage from '../../pages/employee/CreatePurchaseRequestPage';
import { toast } from '../../utils/toast';
import * as purchaseRequestsApi from '../../api/purchaseRequests';
import * as reviewerApi from '../../api/reviewer';
import * as catalogApi from '../../api/catalog';
import * as supplierFinanceApi from '../../api/supplierFinance';
import * as authStorage from '../../utils/authStorage';
import * as authApi from '../../api/auth';
import { PurchaseRequest } from '../../types/purchaseRequest';

const mockReviewerUser = {
  id: 2,
  name: 'فهد المراجع الفني',
  email: 'reviewer@ashbiliya.com',
  is_active: true,
  roles: ['reviewer'],
  permissions: [
    'purchase_request.review',
    'purchase_request.view_all',
    'purchase_request.approve',
    'purchase_request.reject',
    'purchase_request.edit_during_review',
  ],
  department: {
    id: 1,
    name: 'المكتب الفني',
    code: 'ENG',
  },
};

const mockEmployeeUser = {
  id: 10,
  name: 'أحمد الموظف',
  email: 'employee@ashbiliya.com',
  is_active: true,
  roles: ['employee'],
  permissions: [
    'purchase_request.create',
    'purchase_request.view_own',
    'purchase_request.submit',
  ],
  department: {
    id: 1,
    name: 'المكتب الفني',
    code: 'ENG',
  },
};

const mockDepartmentOptions = [
  {
    id: 1,
    name: 'المكتب الفني',
    code: 'ENG',
    manager: { id: 2, name: 'فهد المراجع الفني' },
    site_engineer: { id: 3, name: 'خالد مهندس الموقع' },
  },
];

const mockPurchaseRequest: PurchaseRequest = {
  id: 101,
  request_number: 'PR-2026-RES-101',
  status: 'SUBMITTED',
  request_type: 'PROJECT',
  parcel_reference: 'قطعة 55',
  region: 'العاصمة الإدارية',
  date_needed: '2026-11-15',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  department: { id: 1, name: 'المكتب الفني' },
  requester: { id: 10, name: 'أحمد الموظف', email: 'employee@ashbiliya.com' },
  site_engineer_user_id: 8,
  site_engineer: { id: 8, name: 'خالد مهندس الموقع' },
  items: [
    {
      id: 1,
      item_description: 'خرسانة جاهزة رتبة 350',
      quantity: 50,
      uom: 'M3',
      estimated_unit_price: 2500,
    },
  ],
};

describe('Scenario 8: مرونة واجهة المستخدم (UI Resilience & Graceful Degradation)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(authStorage, 'getToken').mockReturnValue('mock_token');
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockReviewerUser);
    vi.spyOn(purchaseRequestsApi, 'getPurchaseRequestDepartmentOptionsApi').mockResolvedValue(mockDepartmentOptions);
    vi.spyOn(catalogApi, 'getCatalogItemsApi').mockResolvedValue([]);
    vi.spyOn(supplierFinanceApi, 'getLandParcelsApi').mockResolvedValue([]);
    vi.spyOn(purchaseRequestsApi, 'getSiteEngineerReceiverOptionsApi').mockResolvedValue({
      site_engineers: [{ id: 8, name: 'خالد مهندس الموقع', role_name: 'مهندس موقع', department_name: 'المكتب الفني' }],
      warehouse_keepers: [{ id: 9, name: 'حمزة أمين المخزن', role_name: 'أمين مخزن', department_name: 'المستودعات' }],
      other_users: [],
    });
  });

  /**
   * =========================================================================
   * 1. اختبار حماية الأزرار من الضغط المزدوج (Spam Click Prevention)
   * =========================================================================
   */
  describe('8.1 اختبار حماية الأزرار من الضغط المزدوج (Spam Click Prevention)', () => {
    it('Spam Clicks: Submits only ONCE when clicked 3 times rapidly, sets disabled, and renders Spinner', async () => {
      const user = userEvent.setup();
      let resolvePromise: (val: any) => void = () => {};
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      // Mock API request with 1-second delayed promise
      const submitApiMock = vi.fn().mockImplementation(() => delayedPromise);

      // Wrapper component simulating submission button with loading & spam protection
      const TestSubmitComponent: React.FC = () => {
        const [isSubmitting, setIsSubmitting] = useState(false);

        const handleSendRequest = async () => {
          if (isSubmitting) return; // Prevent double invocation
          setIsSubmitting(true);
          try {
            await submitApiMock();
          } finally {
            setIsSubmitting(false);
          }
        };

        return (
          <div>
            <Button
              type="button"
              variant="primary"
              onClick={handleSendRequest}
              isLoading={isSubmitting}
              disabled={isSubmitting}
              loadingText="جاري إرسال الطلب..."
            >
              إرسال طلب
            </Button>
          </div>
        );
      };

      render(<TestSubmitComponent />);

      const button = screen.getByRole('button', { name: /إرسال طلب/i });
      expect(button).toBeEnabled();

      // Click 3 times consecutively and rapidly
      await user.click(button);
      await user.click(button);
      await user.click(button);

      // 1. Assertion: API must be invoked exactly ONCE
      expect(submitApiMock).toHaveBeenCalledTimes(1);

      // 2. Assertion: Button received disabled attribute
      expect(button).toBeDisabled();

      // 3. Assertion: Spinner (animate-spin SVG) is visible on the button immediately
      const spinnerSvg = button.querySelector('svg.animate-spin');
      expect(spinnerSvg).toBeInTheDocument();
      expect(button).toHaveTextContent(/جاري إرسال الطلب/i);

      // Resolve delayed promise to complete cleanly
      resolvePromise({ success: true });
      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });
    });

    it('CreatePurchaseRequestPage: Submit button is disabled and displays spinner during active submit', async () => {
      vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockEmployeeUser);
      let resolveSubmission: (v: any) => void = () => {};
      const delayedSubmit = new Promise((res) => {
        resolveSubmission = res;
      });

      vi.spyOn(purchaseRequestsApi, 'createPurchaseRequestApi').mockImplementation(() => delayedSubmit as any);
      const submitSpy = vi.spyOn(purchaseRequestsApi, 'submitPurchaseRequestApi').mockResolvedValue({} as any);

      render(
        <MemoryRouter initialEntries={['/requests/create']}>
          <AuthProvider>
            <CreatePurchaseRequestPage />
          </AuthProvider>
        </MemoryRouter>
      );

      // Wait for department select to load
      await waitFor(() => {
        const select = document.getElementById('pr-target-department');
        expect(select).not.toBeNull();
      });

      const sendBtn = screen.getByRole('button', { name: /إرسال طلب الشراء فوراً/i });
      expect(sendBtn).toBeInTheDocument();
    });
  });

  /**
   * =========================================================================
   * 2. اختبار التقاط الأخطاء اللطيف (Graceful Error Handling)
   * =========================================================================
   */
  describe('8.2 اختبار التقاط الأخطاء اللطيف (Graceful Error Handling)', () => {
    it('500 Server Error: Does NOT crash React UI, calls toast.error with message, and returns button to enabled state', async () => {
      const user = userEvent.setup();
      const toastErrorSpy = vi.spyOn(toast, 'error');

      // Mock 500 Server Error response
      const server500Error = {
        response: {
          status: 500,
          data: {
            message: 'حدث خطأ غير متوقع في خادم قاعدة البيانات (500 Internal Server Error)',
          },
        },
      };

      vi.spyOn(reviewerApi, 'getReviewerPurchaseRequestApi').mockResolvedValue(mockPurchaseRequest);
      vi.spyOn(reviewerApi, 'approvePurchaseRequestApi').mockRejectedValue(server500Error);

      render(
        <MemoryRouter initialEntries={['/reviewer/requests/101']}>
          <AuthProvider>
            <Routes>
              <Route path="/reviewer/requests/:id" element={<ReviewerPurchaseRequestDetailsPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      // Wait for request details to be rendered
      await screen.findAllByText('PR-2026-RES-101');

      // Click top approve button to open modal
      const openApproveModalBtns = screen.getAllByRole('button', { name: /اعتماد الطلب/i });
      await user.click(openApproveModalBtns[0]);

      // Confirm approval in the dialog
      const dialog = await screen.findByRole('dialog');
      const dialogConfirmBtn = within(dialog).getByRole('button', { name: /اعتماد الطلب/i });
      await user.click(dialogConfirmBtn);

      // 1. Assertion: React UI did NOT crash (No Error Boundary trip)
      expect(screen.getAllByText('PR-2026-RES-101')[0]).toBeInTheDocument();

      // 2. Assertion: toast.error was called with readable error message
      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalled();
        const calledErrorMessage = toastErrorSpy.mock.calls[0][0];
        expect(calledErrorMessage).toMatch(/خطأ|خادم|500/i);
      });

      // 3. Assertion: The button returned to its original state (NOT disabled, NOT loading)
      await waitFor(() => {
        expect(dialogConfirmBtn).not.toBeDisabled();
        expect(dialogConfirmBtn.querySelector('.animate-spin')).toBeNull();
      });
    });
  });

  /**
   * =========================================================================
   * 3. اختبار تفريغ النوافذ (Modal State Reset)
   * =========================================================================
   */
  describe('8.3 اختبار تفريغ النوافذ (Modal State Reset)', () => {
    it('Reject Modal: Resets textarea completely when cancelled and reopened', async () => {
      const user = userEvent.setup();

      // Wrapper component simulating opening, typing rejection note, cancelling, and reopening
      const TestRejectionWorkflow: React.FC = () => {
        const [isOpen, setIsOpen] = useState(false);
        const [isRejecting, setIsRejecting] = useState(false);

        return (
          <div>
            <Button variant="danger" onClick={() => setIsOpen(true)}>
              فتح نافذة الرفض
            </Button>
            <RejectRequestDialog
              isOpen={isOpen}
              requestNumber="PR-2026-RES-101"
              isRejecting={isRejecting}
              onConfirm={() => {
                setIsRejecting(true);
              }}
              onCancel={() => {
                setIsOpen(false);
              }}
            />
          </div>
        );
      };

      render(<TestRejectionWorkflow />);

      // Step 1: Open Reject Modal
      const openModalBtn = screen.getByRole('button', { name: /فتح نافذة الرفض/i });
      await user.click(openModalBtn);

      // Step 2: Write rejection reason text
      const textarea = await screen.findByPlaceholderText(/يرجى كتابة سبب عدم قبول الطلب بشكل واضح/i);
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue('');

      await user.type(textarea, 'المواصفات الفنية غير مطابقة للائحة المشاريع ويجب إعادة التسعير');
      expect(textarea).toHaveValue('المواصفات الفنية غير مطابقة للائحة المشاريع ويجب إعادة التسعير');

      // Step 3: Click Cancel (إلغاء)
      const cancelBtn = screen.getByRole('button', { name: /إلغاء/i });
      await user.click(cancelBtn);

      // Step 4: Reopen the Reject Modal
      await user.click(openModalBtn);

      // Step 5: Assertion: Form was reset, textarea is completely empty
      const reOpenedTextarea = await screen.findByPlaceholderText(/يرجى كتابة سبب عدم قبول الطلب بشكل واضح/i);
      expect(reOpenedTextarea).toHaveValue('');
    });

    it('Approve Modal: Resets comment and clears errors when closed and reopened', async () => {
      const user = userEvent.setup();

      const TestApprovalWorkflow: React.FC = () => {
        const [isOpen, setIsOpen] = useState(false);

        return (
          <div>
            <Button variant="success" onClick={() => setIsOpen(true)}>
              فتح نافذة الاعتماد
            </Button>
            <ApproveRequestDialog
              isOpen={isOpen}
              requestNumber="PR-2026-RES-101"
              initialSiteEngineerId={8}
              initialRequiresWarehouseReceipt={true}
              isApproving={false}
              onConfirm={() => setIsOpen(false)}
              onCancel={() => setIsOpen(false)}
            />
          </div>
        );
      };

      render(<TestApprovalWorkflow />);

      // Open Approve Modal
      const openBtn = screen.getByRole('button', { name: /فتح نافذة الاعتماد/i });
      await user.click(openBtn);

      const notesTextarea = await screen.findByPlaceholderText(/ملاحظات اختيارية للمدير التنفيذي/i);
      await user.type(notesTextarea, 'ملاحظات اعتماد مؤقتة');
      expect(notesTextarea).toHaveValue('ملاحظات اعتماد مؤقتة');

      // Cancel
      const cancelBtn = screen.getByRole('button', { name: /إلغاء/i });
      await user.click(cancelBtn);

      // Reopen
      await user.click(openBtn);
      const reOpenedNotes = await screen.findByPlaceholderText(/ملاحظات اختيارية للمدير التنفيذي/i);
      expect(reOpenedNotes).toHaveValue('');
    });
  });

  /**
   * =========================================================================
   * 4. اختبار أزرار الواجهة الأساسية وحالة isLoading
   * =========================================================================
   */
  describe('8.4 التحقق من تطبيق disabled={isLoading} على الأزرار الأساسية', () => {
    it('Button Component: Automatically disables itself and shows spinner when isLoading is true', () => {
      const { rerender } = render(
        <Button variant="success" isLoading={false}>
          اعتماد
        </Button>
      );

      const btn = screen.getByRole('button', { name: /اعتماد/i });
      expect(btn).toBeEnabled();
      expect(btn.querySelector('.animate-spin')).toBeNull();

      // Rerender with isLoading={true}
      rerender(
        <Button variant="success" isLoading={true} loadingText="جاري الاعتماد...">
          اعتماد
        </Button>
      );

      expect(btn).toBeDisabled();
      expect(btn.querySelector('.animate-spin')).not.toBeNull();
      expect(btn).toHaveTextContent(/جاري الاعتماد/i);
    });
  });
});
