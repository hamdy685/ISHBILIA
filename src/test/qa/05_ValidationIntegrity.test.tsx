import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import CreatePurchaseRequestPage from '../../pages/employee/CreatePurchaseRequestPage';
import { PurchaseRequestTable } from '../../components/purchase-requests/PurchaseRequestTable';
import { PurchaseRequest } from '../../types/purchaseRequest';
import * as purchaseRequestsApi from '../../api/purchaseRequests';
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

const mockDepartmentOptions = [
  {
    id: 1,
    name: 'المكتب الفني',
    code: 'ENG',
    manager: { id: 2, name: 'المهندس المراجع' },
    site_engineer: { id: 3, name: 'مهندس الموقع' },
  },
];

const createPrWithStatus = (id: number, requestNumber: string, status: string): PurchaseRequest => ({
  id,
  request_number: requestNumber,
  status: status as any,
  request_type: 'PROJECT',
  parcel_reference: 'قطعة 10',
  region: 'النرجس',
  date_needed: '2026-10-01',
  created_at: '2026-09-18T10:00:00Z',
  requester: {
    id: 10,
    name: 'أحمد الموظف',
    email: 'employee@ashbiliya.com',
  },
  department: {
    id: 1,
    name: 'المكتب الفني',
    code: 'ENG',
  },
  items: [
    {
      id: id * 10,
      purchase_request_id: id,
      item_description: 'حديد تسليح 12 مم',
      quantity: 50,
      uom: 'طن',
    },
  ],
  approval_history: [],
});

describe('Scenario 5: سلامة القيود والـ Validation (Integrity Tests)', () => {
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

  describe('5.1 Form Validation Prevents Submission on Zero or Empty Quantity', () => {
    it('Prevents form submission and displays validation error when quantity is 0 or empty', async () => {
      const submitSpy = vi.spyOn(purchaseRequestsApi, 'submitPurchaseRequestApi').mockResolvedValue({} as any);
      const createSpy = vi.spyOn(purchaseRequestsApi, 'createPurchaseRequestApi').mockResolvedValue({} as any);

      render(
        <MemoryRouter initialEntries={['/requests/create']}>
          <AuthProvider>
            <CreatePurchaseRequestPage />
          </AuthProvider>
        </MemoryRouter>
      );

      // Wait for the form and inputs to mount
      const quantityInput = await screen.findByPlaceholderText('الكمية...');
      expect(quantityInput).toBeInTheDocument();

      // Clear the quantity input (set it to 0)
      fireEvent.change(quantityInput, { target: { value: '0' } });

      // Fill in description
      const descInput = screen.getAllByPlaceholderText(/مثال: حديد تسليح/i)[0];
      fireEvent.change(descInput, { target: { value: 'أسمنت مقاوم' } });

      // Click the submit button
      const submitBtn = screen.getByRole('button', { name: /إرسال طلب الشراء فوراً/i });
      fireEvent.click(submitBtn);

      // Verify that validation warning appears
      await waitFor(() => {
        expect(screen.getByText(/الكمية مطلوبة/i)).toBeInTheDocument();
      });

      // The overall form error banner should appear
      expect(screen.getByRole('alert')).toHaveTextContent(/يرجى تصحيح الأخطاء/i);

      // Verify that API submit and request creation are strictly NOT invoked
      expect(submitSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();

      // Now test with empty string
      fireEvent.change(quantityInput, { target: { value: '' } });
      fireEvent.click(submitBtn);

      expect(screen.getByText(/الكمية مطلوبة/i)).toBeInTheDocument();
      expect(submitSpy).not.toHaveBeenCalled();
    });
  });

  describe('5.2 Action Buttons (Edit / Delete) Visibility Based on Request Status', () => {
    it('Shows Edit and Delete for DRAFT, Edit only for SUBMITTED, and strictly HIDES both for locked statuses', async () => {
      const draftPr = createPrWithStatus(1, 'PR-2026-0001', 'DRAFT');
      const submittedPr = createPrWithStatus(2, 'PR-2026-0002', 'SUBMITTED');
      const approvedPr = createPrWithStatus(3, 'PR-2026-0003', 'APPROVED_BY_REVIEWER');
      const pendingExecPr = createPrWithStatus(4, 'PR-2026-0004', 'PENDING_EXECUTIVE_APPROVAL');
      const orderedPr = createPrWithStatus(5, 'PR-2026-0005', 'ORDERED');

      const allRequests = [draftPr, submittedPr, approvedPr, pendingExecPr, orderedPr];

      render(
        <MemoryRouter>
          <AuthProvider>
            <PurchaseRequestTable
              requests={allRequests}
              onOpenSubmitModal={vi.fn()}
              onOpenDeleteModal={vi.fn()}
            />
          </AuthProvider>
        </MemoryRouter>
      );

      // Wait for auth permissions to load and apply to buttons
      await waitFor(() => {
        const draftRow = screen.getAllByText('PR-2026-0001')[0].closest('tr');
        expect(draftRow?.textContent).toContain('تعديل');
      });

      // In the desktop table (XL screens):
      // 1. DRAFT request (PR-2026-0001):
      // Should have: 'عرض', 'تعديل', 'تقديم', 'حذف'
      const draftRow = screen.getAllByText('PR-2026-0001')[0].closest('tr');
      expect(draftRow).toBeInTheDocument();
      expect(draftRow?.textContent).toContain('عرض');
      expect(draftRow?.textContent).toContain('تعديل');
      expect(draftRow?.textContent).toContain('حذف');
      expect(draftRow?.textContent).toContain('تقديم');

      // 2. SUBMITTED request (PR-2026-0002):
      // Should have: 'عرض', 'تعديل', but NO 'حذف' and NO 'تقديم'
      const submittedRow = screen.getAllByText('PR-2026-0002')[0].closest('tr');
      expect(submittedRow).toBeInTheDocument();
      expect(submittedRow?.textContent).toContain('عرض');
      expect(submittedRow?.textContent).toContain('تعديل');
      expect(submittedRow?.textContent).not.toContain('حذف');
      expect(submittedRow?.textContent).not.toContain('تقديم');

      // 3. APPROVED_BY_REVIEWER request (PR-2026-0003):
      // Should have: 'عرض', strictly NO 'تعديل' and NO 'حذف'
      const approvedRow = screen.getAllByText('PR-2026-0003')[0].closest('tr');
      expect(approvedRow).toBeInTheDocument();
      expect(approvedRow?.textContent).toContain('عرض');
      expect(approvedRow?.textContent).not.toContain('تعديل');
      expect(approvedRow?.textContent).not.toContain('حذف');

      // 4. PENDING_EXECUTIVE_APPROVAL request (PR-2026-0004):
      // Strictly NO 'تعديل' and NO 'حذف'
      const pendingExecRow = screen.getAllByText('PR-2026-0004')[0].closest('tr');
      expect(pendingExecRow).toBeInTheDocument();
      expect(pendingExecRow?.textContent).toContain('عرض');
      expect(pendingExecRow?.textContent).not.toContain('تعديل');
      expect(pendingExecRow?.textContent).not.toContain('حذف');

      // 5. ORDERED request (PR-2026-0005):
      // Strictly NO 'تعديل' and NO 'حذف'
      const orderedRow = screen.getAllByText('PR-2026-0005')[0].closest('tr');
      expect(orderedRow).toBeInTheDocument();
      expect(orderedRow?.textContent).toContain('عرض');
      expect(orderedRow?.textContent).not.toContain('تعديل');
      expect(orderedRow?.textContent).not.toContain('حذف');
    });
  });
});
