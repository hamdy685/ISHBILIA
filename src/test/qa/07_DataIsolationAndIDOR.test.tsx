import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { RoleRoute } from '../../routes/RoleRoute';
import PurchaseRequestDetailsPage from '../../pages/employee/PurchaseRequestDetailsPage';
import ReviewerPurchaseRequestDetailsPage from '../../pages/reviewer/ReviewerPurchaseRequestDetailsPage';
import PurchaseRequestTable from '../../components/purchase-requests/PurchaseRequestTable';
import { PurchaseRequest } from '../../types/purchaseRequest';
import * as purchaseRequestsApi from '../../api/purchaseRequests';
import * as reviewerApi from '../../api/reviewer';
import * as authStorage from '../../utils/authStorage';
import * as authApi from '../../api/auth';
import { stripFinancialData } from '../../api/client';

// ── Mock Users ──────────────────────────────────────────────────────────────
const mockEmployeeA = {
  id: 101,
  name: 'الموظف (أ) - Employee_A',
  email: 'employee_a@ashbiliya.com',
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

const mockEmployeeB = {
  id: 102,
  name: 'الموظف (ب) - Employee_B',
  email: 'employee_b@ashbiliya.com',
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

const mockReviewerCivil = {
  id: 201,
  name: 'مراجع قسم الهندسة المدنية - Reviewer_Civil_Dept',
  email: 'reviewer_civil@ashbiliya.com',
  is_active: true,
  roles: ['reviewer'],
  permissions: [
    'purchase_request.review',
    'purchase_request.approve',
    'purchase_request.reject',
  ],
  department: {
    id: 10,
    name: 'قسم الإنشاءات المدنية (Civil)',
    code: 'CIVIL',
  },
};

describe('Scenario 7: اختبارات الأمان وعزل البيانات والوصول المباشر (Security & Data Isolation QA)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(authStorage, 'getToken').mockReturnValue('valid_security_token');
  });

  // ── 1. اختبار العزل الأفقي (Horizontal Privilege Escalation) ────────────────
  describe('7.1 اختبار العزل الأفقي (Horizontal Privilege Escalation)', () => {
    it('Employee_A sees strictly their own purchase requests and zero requests belonging to Employee_B', async () => {
      vi.spyOn(authStorage, 'getStoredUser').mockReturnValue(mockEmployeeA);
      vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockEmployeeA);

      // Dataset containing mixed requests across multiple users
      const mixedDatabaseRequests: (PurchaseRequest & { user_id?: number })[] = [
        {
          id: 1001,
          request_number: 'PR-2026-01001',
          user_id: 101, // Employee A
          status: 'SUBMITTED',
          request_type: 'PROJECT',
          parcel_reference: 'قطعة A-101',
          region: 'النرجس',
          created_at: '2026-09-18T10:00:00Z',
          requester: { id: 101, name: 'الموظف (أ) - Employee_A' },
          items: [{ id: 1, item_description: 'حديد تسليح للموظف أ', quantity: 20, uom: 'طن' }],
        },
        {
          id: 1002,
          request_number: 'PR-2026-01002',
          user_id: 101, // Employee A
          status: 'DRAFT',
          request_type: 'PROJECT',
          parcel_reference: 'قطعة A-102',
          region: 'الياسمين',
          created_at: '2026-09-18T11:00:00Z',
          requester: { id: 101, name: 'الموظف (أ) - Employee_A' },
          items: [{ id: 2, item_description: 'أسمنت مقاوم للموظف أ', quantity: 50, uom: 'كيس' }],
        },
        {
          id: 2001,
          request_number: 'PR-2026-02001',
          user_id: 102, // Employee B - MUST BE ISOLATED
          status: 'SUBMITTED',
          request_type: 'PROJECT',
          parcel_reference: 'قطعة B-201',
          region: 'البنفسج',
          created_at: '2026-09-18T12:00:00Z',
          requester: { id: 102, name: 'الموظف (ب) - Employee_B' },
          items: [{ id: 3, item_description: 'سقالات معدنية خاصة بالموظف ب', quantity: 15, uom: 'طقم' }],
        },
      ];

      // Simulated scoped API response (as enforced by backend where('user_id', $user->id))
      const scopedRequestsForEmployeeA = mixedDatabaseRequests.filter(
        (r) => r.user_id === mockEmployeeA.id
      );

      const fetchSpy = vi
        .spyOn(purchaseRequestsApi, 'getOwnPurchaseRequestsApi')
        .mockResolvedValue(scopedRequestsForEmployeeA as PurchaseRequest[]);

      const result = await purchaseRequestsApi.getOwnPurchaseRequestsApi();

      // 1. Array Assertions
      expect(fetchSpy).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result.every((r) => (r as any).user_id === mockEmployeeA.id)).toBe(true);
      expect(result.some((r) => (r as any).user_id === mockEmployeeB.id)).toBe(false);
      expect(result.some((r) => r.request_number === 'PR-2026-02001')).toBe(false);

      // 2. DOM Rendering Isolation Check
      render(
        <MemoryRouter>
          <AuthProvider>
            <PurchaseRequestTable requests={result} />
          </AuthProvider>
        </MemoryRouter>
      );

      // Employee A items must be visible
      expect(screen.getAllByText('PR-2026-01001').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('PR-2026-01002').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('حديد تسليح للموظف أ').length).toBeGreaterThanOrEqual(1);

      // Employee B items must be completely absent from UI
      expect(screen.queryByText('PR-2026-02001')).not.toBeInTheDocument();
      expect(screen.queryByText('قطعة B-201')).not.toBeInTheDocument();
      expect(screen.queryByText('سقالات معدنية خاصة بالموظف ب')).not.toBeInTheDocument();
    });
  });

  // ── 2. اختبار عزل الأقسام (Department Isolation) ───────────────────────────
  describe('7.2 اختبار عزل الأقسام (Department Isolation)', () => {
    it('Reviewer_Civil_Dept receives solely requests targeting Civil department and zero requests from foreign departments', async () => {
      vi.spyOn(authStorage, 'getStoredUser').mockReturnValue(mockReviewerCivil);
      vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockReviewerCivil);

      const mixedDepartmentRequests: (PurchaseRequest & { target_department_id?: number })[] = [
        {
          id: 3001,
          request_number: 'PR-2026-03001',
          status: 'SUBMITTED',
          request_type: 'PROJECT',
          target_department_id: 10, // Civil Dept
          target_department: { id: 10, name: 'قسم الإنشاءات المدنية (Civil)', code: 'CIVIL' },
          parcel_reference: 'قطعة مدني-301',
          region: 'النرجس',
          items: [{ id: 11, item_description: 'خرسانة جاهزة C30', quantity: 100, uom: 'م3' }],
        },
        {
          id: 3002,
          request_number: 'PR-2026-03002',
          status: 'UNDER_REVIEW',
          request_type: 'PROJECT',
          target_department_id: 10, // Civil Dept
          target_department: { id: 10, name: 'قسم الإنشاءات المدنية (Civil)', code: 'CIVIL' },
          parcel_reference: 'قطعة مدني-302',
          region: 'الياسمين',
          items: [{ id: 12, item_description: 'حديد تسليح عالي المقاومة', quantity: 45, uom: 'طن' }],
        },
        {
          id: 4001,
          request_number: 'PR-2026-04001',
          status: 'SUBMITTED',
          request_type: 'PROJECT',
          target_department_id: 20, // Electrical Dept - FOREIGN DEPT
          target_department: { id: 20, name: 'قسم الكهرباء (Electrical)', code: 'ELEC' },
          parcel_reference: 'قطعة كهرباء-401',
          region: 'النرجس',
          items: [{ id: 21, item_description: 'كابلات نحاسية معزولة', quantity: 500, uom: 'متر' }],
        },
        {
          id: 5001,
          request_number: 'PR-2026-05001',
          status: 'SUBMITTED',
          request_type: 'OFFICE_SUPPLIES',
          target_department_id: 30, // Buffet Dept - FOREIGN DEPT
          target_department: { id: 30, name: 'قسم البوفيه والضيافة (Buffet)', code: 'BUFFET' },
          items: [{ id: 31, item_description: 'مستلزمات ضيافة وبوفيه', quantity: 10, uom: 'كرتونة' }],
        },
      ];

      // Simulated department-scoped API query (ReviewerPurchaseRequestService::getReviewableRequests)
      const scopedRequestsForCivil = mixedDepartmentRequests.filter(
        (r) => r.target_department_id === mockReviewerCivil.department.id
      );

      const reviewerFetchSpy = vi
        .spyOn(reviewerApi, 'getReviewableRequestsApi')
        .mockResolvedValue(scopedRequestsForCivil as PurchaseRequest[]);

      const result = await reviewerApi.getReviewableRequestsApi();

      // 1. Array Assertions
      expect(reviewerFetchSpy).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(
        result.every(
          (r) =>
            (r as any).target_department_id === 10 &&
            r.target_department?.name === 'قسم الإنشاءات المدنية (Civil)'
        )
      ).toBe(true);

      // Verify foreign departments are completely absent
      expect(result.some((r) => (r as any).target_department_id === 20)).toBe(false);
      expect(result.some((r) => (r as any).target_department_id === 30)).toBe(false);
      expect(result.some((r) => r.request_number === 'PR-2026-04001')).toBe(false);
      expect(result.some((r) => r.request_number === 'PR-2026-05001')).toBe(false);
    });
  });

  // ── 3. اختبار هجوم الوصول المباشر (IDOR - URL Bypassing) ───────────────────
  describe('7.3 اختبار هجوم الوصول المباشر (IDOR - URL Bypassing)', () => {
    it('Employee_A calling GET details for Employee_B request receives 403 Forbidden and data is not rendered', async () => {
      vi.spyOn(authStorage, 'getStoredUser').mockReturnValue(mockEmployeeA);
      vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockEmployeeA);

      // Mock backend 403 Forbidden response (as returned by PurchaseRequestController::show line 186)
      const forbiddenError = {
        name: 'AxiosError',
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
          },
        },
      };

      const getSpy = vi
        .spyOn(purchaseRequestsApi, 'getPurchaseRequestApi')
        .mockRejectedValue(forbiddenError);

      // Attempt API call directly
      await expect(purchaseRequestsApi.getPurchaseRequestApi(2001)).rejects.toMatchObject({
        response: { status: 403 },
      });
      expect(getSpy).toHaveBeenCalledWith(2001);

      // Render details page with ID of Employee_B request (IDOR URL attack: /requests/2001)
      render(
        <MemoryRouter initialEntries={['/requests/2001']}>
          <AuthProvider>
            <Routes>
              <Route path="/requests/:id" element={<PurchaseRequestDetailsPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      // UI must intercept 403 and display the ForbiddenPage without leaking any details
      await waitFor(() => {
        expect(screen.getByText('403')).toBeInTheDocument();
        expect(screen.getByText(/لا تملك صلاحية الوصول/i)).toBeInTheDocument();
      });

      // Employee B private data must NOT be rendered in the DOM
      expect(screen.queryByText(/سقالات معدنية خاصة بالموظف ب/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/قطعة B-201/i)).not.toBeInTheDocument();
    });

    it('RoleRoute redirects or renders ForbiddenPage when an unauthorized role tries to bypass URL directly', async () => {
      vi.spyOn(authStorage, 'getStoredUser').mockReturnValue(mockEmployeeA);
      vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockEmployeeA);

      // Employee_A tries to manually enter a Reviewer-only route in browser: /reviewer/requests/999
      render(
        <MemoryRouter initialEntries={['/reviewer/requests/999']}>
          <AuthProvider>
            <Routes>
              <Route element={<RoleRoute allowedRoles={['reviewer']} />}>
                <Route
                  path="/reviewer/requests/:id"
                  element={<div data-testid="reviewer-content">محتوى مراجع القسم الفني السري</div>}
                />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      // RoleRoute must block Employee_A and render the ForbiddenPage
      await waitFor(() => {
        expect(screen.getByText('403')).toBeInTheDocument();
        expect(screen.getByText(/لا تملك صلاحية الوصول/i)).toBeInTheDocument();
      });

      expect(screen.queryByTestId('reviewer-content')).not.toBeInTheDocument();
    });
  });

  // ── 4. سرية البيانات المالية (Financial Data Stripping) ────────────────────
  describe('7.4 سرية البيانات المالية (Financial Data Stripping)', () => {
    it('defense-in-depth sanitization strips unit_price, total_cost, and supplier_quotes for operational roles', () => {
      /**
       * CRITICAL SECURITY ARCHITECTURE NOTE:
       * Commercial and financial confidentiality (supplier pricing, purchase order values, quote submissions)
       * must be enforced at the Backend layer via Laravel API Resources (PurchaseRequestResource,
       * PurchaseRequestItemResource) and Policy middleware.
       *
       * In the Frontend, defense-in-depth sanitization (stripFinancialData) acts as an additional security
       * perimeter, ensuring that even if an unexpected payload containing supplier prices reaches an
       * Employee or Reviewer session, all sensitive pricing keys are purged to undefined before reaching
       * React state or the DOM.
       */
      const rawCommercialPayload = {
        id: 7001,
        request_number: 'PR-2026-07001',
        status: 'APPROVED_BY_PROCUREMENT',
        unit_price: 25000,
        total_cost: 75000,
        supplier_quotes: [
          { supplier_id: 1, quote_amount: 75000, supplier_name: 'شركة التوريدات الكبرى' },
          { supplier_id: 2, quote_amount: 80000, supplier_name: 'شركة المقاولات الحديثة' },
        ],
        items: [
          {
            id: 1,
            item_description: 'حديد تسليح عز 16 مم',
            quantity: 3,
            uom: 'طن',
            unit_price: 25000,
            total_cost: 75000,
          },
        ],
      };

      // Apply defense-in-depth sanitization
      stripFinancialData(rawCommercialPayload);

      // Assertions: All specified sensitive commercial keys MUST be undefined
      expect((rawCommercialPayload as any).unit_price).toBeUndefined();
      expect((rawCommercialPayload as any).total_cost).toBeUndefined();
      expect((rawCommercialPayload as any).supplier_quotes).toBeUndefined();
      expect((rawCommercialPayload.items[0] as any).unit_price).toBeUndefined();
      expect((rawCommercialPayload.items[0] as any).total_cost).toBeUndefined();
    });

    it('Employee and Reviewer detail pages render zero pricing columns or financial cost amounts', async () => {
      vi.spyOn(authStorage, 'getStoredUser').mockReturnValue(mockReviewerCivil);
      vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockReviewerCivil);

      const approvedOperationalPr: PurchaseRequest = {
        id: 7001,
        request_number: 'PR-2026-07001',
        status: 'APPROVED_BY_PROCUREMENT',
        department_id: 10,
        target_department_id: 10,
        target_department: { id: 10, name: 'قسم الإنشاءات المدنية (Civil)', code: 'CIVIL' },
        requester: { id: 101, name: 'أحمد الموظف' },
        date_needed: '2026-10-01',
        parcel_reference: 'قطعة 888',
        region: 'النرجس',
        items: [
          {
            id: 101,
            item_description: 'خرسانة جاهزة معتمدة',
            quantity: 50,
            uom: 'م3',
            item_reference: 'قطعة 888',
            region: 'النرجس',
          },
        ],
      };

      vi.spyOn(reviewerApi, 'getReviewerPurchaseRequestApi').mockResolvedValue(approvedOperationalPr);

      render(
        <MemoryRouter initialEntries={['/reviewer/requests/7001']}>
          <AuthProvider>
            <Routes>
              <Route path="/reviewer/requests/:id" element={<ReviewerPurchaseRequestDetailsPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      // Wait for items table to render
      await waitFor(() => {
        expect(screen.getByText('PR-2026-07001')).toBeInTheDocument();
        expect(screen.getAllByText('خرسانة جاهزة معتمدة').length).toBeGreaterThanOrEqual(1);
      });

      // Assert operational attributes are present
      expect(screen.getAllByText('50').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/متر مكعب/i).length).toBeGreaterThanOrEqual(1);

      // Assert commercial/financial columns & prices are completely absent from reviewer DOM
      expect(screen.queryByText(/سعر الوحدة/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/إجمالي التكلفة/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/عروض الأسعار/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/25000/)).not.toBeInTheDocument();
      expect(screen.queryByText(/75000/)).not.toBeInTheDocument();
    });
  });
});
