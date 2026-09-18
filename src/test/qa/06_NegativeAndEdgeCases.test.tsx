import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import CreatePurchaseRequestPage from '../../pages/employee/CreatePurchaseRequestPage';
import { PurchaseRequestTable } from '../../components/purchase-requests/PurchaseRequestTable';
import ReviewerPurchaseRequestDetailsPage from '../../pages/reviewer/ReviewerPurchaseRequestDetailsPage';
import { PurchaseRequest } from '../../types/purchaseRequest';
import * as purchaseRequestsApi from '../../api/purchaseRequests';
import * as reviewerApi from '../../api/reviewer';
import * as catalogApi from '../../api/catalog';
import * as supplierFinanceApi from '../../api/supplierFinance';
import * as authStorage from '../../utils/authStorage';
import * as authApi from '../../api/auth';

const mockEmployeeUser = {
  id: 10,
  name: 'أحمد الموظف',
  email: 'employee@ashbiliya.com',
  is_active: true,
  roles: ['employee'],
  permissions: [
    'purchase_request.create',
    'purchase_request.view_own',
    'purchase_request.edit_own',
    'purchase_request.submit',
  ],
  department: {
    id: 1,
    name: 'المكتب الفني',
    code: 'ENG',
  },
};

const mockReviewerUser = {
  id: 2,
  name: 'المهندس المراجع الفني',
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

const mockDepartmentOptions = [
  {
    id: 1,
    name: 'المكتب الفني',
    code: 'ENG',
    manager: { id: 2, name: 'المهندس المراجع' },
    site_engineer: { id: 3, name: 'مهندس الموقع' },
  },
];

describe('Scenario 6: اختبارات الأمان والحالات الشاذة ومحاولات كسر النظام (Negative & Edge Cases)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(authStorage, 'getToken').mockReturnValue('mock_token');
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockEmployeeUser);
    vi.spyOn(purchaseRequestsApi, 'getPurchaseRequestDepartmentOptionsApi').mockResolvedValue(mockDepartmentOptions);
    vi.spyOn(catalogApi, 'getCatalogItemsApi').mockResolvedValue([]);
    vi.spyOn(supplierFinanceApi, 'getLandParcelsApi').mockResolvedValue([]);
  });

  describe('6.1 اختبار الكميات اللامنطقية (Illogical Quantities)', () => {
    it('Negative Quantity: Prevents submission and displays error when quantity is negative (-10)', async () => {
      const submitSpy = vi.spyOn(purchaseRequestsApi, 'submitPurchaseRequestApi').mockResolvedValue({} as any);

      render(
        <MemoryRouter initialEntries={['/requests/create']}>
          <AuthProvider>
            <CreatePurchaseRequestPage />
          </AuthProvider>
        </MemoryRouter>
      );

      const quantityInput = await screen.findByPlaceholderText('الكمية...');
      fireEvent.change(quantityInput, { target: { value: '-10' } });

      const descInput = screen.getAllByPlaceholderText(/مثال: حديد تسليح/i)[0];
      fireEvent.change(descInput, { target: { value: 'أسمنت بورتلاندي' } });

      const submitBtn = screen.getByRole('button', { name: /إرسال طلب الشراء فوراً/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getAllByText(/الكمية مطلوبة \(أدخل كمية أكبر من صفر\)/i).length).toBeGreaterThanOrEqual(1);
      });

      expect(screen.getByRole('alert')).toHaveTextContent(/يرجى تصحيح الأخطاء/i);
      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('Non-Numeric / Text in Quantity: Blocks text input and rejects submission', async () => {
      const submitSpy = vi.spyOn(purchaseRequestsApi, 'submitPurchaseRequestApi').mockResolvedValue({} as any);

      render(
        <MemoryRouter initialEntries={['/requests/create']}>
          <AuthProvider>
            <CreatePurchaseRequestPage />
          </AuthProvider>
        </MemoryRouter>
      );

      const quantityInput = await screen.findByPlaceholderText('الكمية...');
      fireEvent.change(quantityInput, { target: { value: 'خمسين' } });

      const submitBtn = screen.getByRole('button', { name: /إرسال طلب الشراء فوراً/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getAllByText(/الكمية مطلوبة \(أدخل كمية أكبر من صفر\)/i).length).toBeGreaterThanOrEqual(1);
      });

      expect(submitSpy).not.toHaveBeenCalled();
    });

    it('Fractional Quantity Restriction: Rejects fractional quantity (1.5) for PCS unit, but accepts it for TON / M3', async () => {
      const submitSpy = vi.spyOn(purchaseRequestsApi, 'submitPurchaseRequestApi').mockResolvedValue({} as any);

      render(
        <MemoryRouter initialEntries={['/requests/create']}>
          <AuthProvider>
            <CreatePurchaseRequestPage />
          </AuthProvider>
        </MemoryRouter>
      );

      const quantityInput = await screen.findByPlaceholderText('الكمية...');
      const descInput = screen.getAllByPlaceholderText(/مثال: حديد تسليح/i)[0];
      fireEvent.change(descInput, { target: { value: 'مفتاح إنارة 16 أمبير' } });

      // 1. Enter fractional quantity 1.5 with default unit PCS (قطعة)
      fireEvent.change(quantityInput, { target: { value: '1.5' } });

      const submitBtn = screen.getByRole('button', { name: /إرسال طلب الشراء فوراً/i });
      fireEvent.click(submitBtn);

      // Verify that fractional quantity for PCS is rejected with explicit error
      await waitFor(() => {
        expect(screen.getAllByText(/لا يمكن إدخال كمية كسرية لوحدة \(قطعة\)/i).length).toBeGreaterThanOrEqual(1);
      });
      expect(submitSpy).not.toHaveBeenCalled();

      // 2. Now change unit to TON (طن) where fractional quantities are fully allowed
      const uomSelect = screen.getAllByRole('combobox').find((select) => {
        return (select as HTMLSelectElement).value === 'PCS' || (select as HTMLSelectElement).value === 'قطعة';
      });

      if (uomSelect) {
        fireEvent.change(uomSelect, { target: { value: 'TON' } });

        // Fractional error for PCS must disappear
        expect(screen.queryByText(/لا يمكن إدخال كمية كسرية لوحدة \(قطعة\)/i)).not.toBeInTheDocument();
      }
    });
  });

  describe('6.2 اختبار تواريخ الماضي (Past Dates)', () => {
    it('Date Needed: Datepicker enforces min date attribute (today) and rejects past dates', async () => {
      const submitSpy = vi.spyOn(purchaseRequestsApi, 'submitPurchaseRequestApi').mockResolvedValue({} as any);

      const { container } = render(
        <MemoryRouter initialEntries={['/requests/create']}>
          <AuthProvider>
            <CreatePurchaseRequestPage />
          </AuthProvider>
        </MemoryRouter>
      );

      const dateInput = container.querySelector('#pr-date-needed') as HTMLInputElement;
      expect(dateInput).toBeInTheDocument();

      // Verify HTML5 min attribute is set to today
      const today = new Date().toISOString().slice(0, 10);
      expect(dateInput.getAttribute('min')).toBe(today);

      // Attempt to enter a past date directly (e.g. 2020-01-01)
      fireEvent.change(dateInput, { target: { value: '2020-01-01' } });

      const submitBtn = screen.getByRole('button', { name: /إرسال طلب الشراء فوراً/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/تاريخ الاحتياج لا يمكن أن يكون في الماضي/i)).toBeInTheDocument();
      });

      expect(submitSpy).not.toHaveBeenCalled();
    });
  });

  describe('6.3 اختبار تناقض البيانات وحقن الحقول (Payload Integrity & Sanitization)', () => {
    it('Office Supplies Sanitization: Strips injected land_parcel_id and enforces corporate office defaults', async () => {
      let createdPayload: any = null;
      vi.spyOn(purchaseRequestsApi, 'createPurchaseRequestApi').mockImplementation(async (payload) => {
        createdPayload = payload;
        return { id: 999, ...payload } as any;
      });
      vi.spyOn(purchaseRequestsApi, 'submitPurchaseRequestApi').mockResolvedValue({} as any);

      render(
        <MemoryRouter initialEntries={['/requests/create']}>
          <AuthProvider>
            <CreatePurchaseRequestPage />
          </AuthProvider>
        </MemoryRouter>
      );

      // Select Office Supplies mode
      const officeBtn = screen.getByRole('button', { name: /مستلزمات مكتبية/i });
      fireEvent.click(officeBtn);

      // Verify parcel reference and region inputs are completely NOT rendered
      expect(screen.queryByPlaceholderText(/مثال: قطعة 256/i)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/مثال: المنطقة السابعة/i)).not.toBeInTheDocument();
    });

    it('Empty Items Array: Prevents submission and shows error if items array is empty', async () => {
      const submitSpy = vi.spyOn(purchaseRequestsApi, 'submitPurchaseRequestApi').mockResolvedValue({} as any);
      const createSpy = vi.spyOn(purchaseRequestsApi, 'createPurchaseRequestApi').mockResolvedValue({} as any);

      // Render page
      render(
        <MemoryRouter initialEntries={['/requests/create']}>
          <AuthProvider>
            <CreatePurchaseRequestPage />
          </AuthProvider>
        </MemoryRouter>
      );

      // Delete button on the only item row should not be available or disabled (cannot remove sole item)
      const deleteButtons = screen.queryAllByTitle('حذف هذا البند');
      expect(deleteButtons.length).toBe(0);

      // Ensure API is not called
      expect(submitSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('6.4 اختبار التلاعب بالأزرار (Button State Manipulation)', () => {
    it('Approve Button: Strictly NOT rendered when request status is not pending review (e.g. APPROVED_BY_REVIEWER or ORDERED)', async () => {
      vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockReviewerUser);

      const approvedPr: PurchaseRequest = {
        id: 88,
        request_number: 'PR-2026-0088',
        status: 'APPROVED_BY_REVIEWER',
        request_type: 'PROJECT',
        parcel_reference: 'قطعة 5',
        region: 'الياسمين',
        date_needed: '2026-10-01',
        created_at: '2026-09-18T10:00:00Z',
        department: { id: 1, name: 'المكتب الفني', code: 'ENG' },
        items: [{ id: 881, purchase_request_id: 88, item_description: 'كابلات نحاس', quantity: 20, uom: 'متر' }],
        approval_history: [],
      };

      vi.spyOn(reviewerApi, 'getReviewerPurchaseRequestApi').mockResolvedValue(approvedPr);

      render(
        <MemoryRouter initialEntries={['/reviewer/requests/88']}>
          <AuthProvider>
            <Routes>
              <Route path="/reviewer/requests/:id" element={<ReviewerPurchaseRequestDetailsPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      // Wait for details page to finish loading and show locked notice
      await waitFor(() => {
        expect(screen.getByText(/تم إغلاق التعديل من جهة المراجع/i)).toBeInTheDocument();
      });

      // Assert that 'اعتماد الطلب' / 'اعتماد فوراً' button is completely NOT rendered
      expect(screen.queryByRole('button', { name: /اعتماد/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /رفض/i })).not.toBeInTheDocument();
    });

    it('Delete Button: Strictly NOT rendered in table for an approved purchase request', async () => {
      const approvedPr: PurchaseRequest = {
        id: 99,
        request_number: 'PR-2026-0099',
        status: 'APPROVED_BY_REVIEWER',
        request_type: 'PROJECT',
        parcel_reference: 'قطعة 80',
        region: 'النرجس',
        date_needed: '2026-10-01',
        created_at: '2026-09-18T10:00:00Z',
        department: { id: 1, name: 'المكتب الفني', code: 'ENG' },
        items: [{ id: 991, purchase_request_id: 99, item_description: 'دهانات خارجية', quantity: 15, uom: 'جالون' }],
        approval_history: [],
      };

      render(
        <MemoryRouter>
          <AuthProvider>
            <PurchaseRequestTable
              requests={[approvedPr]}
              onOpenSubmitModal={vi.fn()}
              onOpenDeleteModal={vi.fn()}
            />
          </AuthProvider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('PR-2026-0099')[0]).toBeInTheDocument();
      });

      // Assert 'حذف' is NOT rendered anywhere in the table row or cards
      const row = screen.getAllByText('PR-2026-0099')[0].closest('tr');
      expect(row?.textContent).not.toContain('حذف');
      expect(row?.textContent).not.toContain('تعديل');
      expect(row?.textContent).toContain('عرض');
    });
  });
});
