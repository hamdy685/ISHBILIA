import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { ActionRequiredInbox, ActionInboxItem } from '../../components/dashboard/ActionRequiredInbox';
import RejectRequestDialog from '../../components/reviewer/RejectRequestDialog';
import * as authStorage from '../../utils/authStorage';
import * as authApi from '../../api/auth';

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

const createMockInboxItem = (overrides?: Partial<ActionInboxItem>): ActionInboxItem => ({
  id: 'pr-77',
  rawId: 77,
  type: 'PR',
  code: 'PR-2026-0077',
  title: 'طلب مواد أسمنت ومون للموقع',
  subtitle: 'مشروع النرجس - قطعة 115',
  department: 'المكتب الفني',
  requester: 'علي الموظف',
  urgency: 'HIGH',
  reason: 'طلب جديد مقدم بانتظار مراجعتك واعتمادك الفني',
  actionUrl: '/reviewer/requests/77/review',
  actionLabel: 'مراجعة وتعديل الطلب',
  timeAgo: '2026-09-18',
  parcel_number: '115',
  region: 'النرجس',
  items_count: 1,
  items_list: [
    {
      description: 'أسمنت مقاوم 50 كجم',
      quantity: 100,
      uom: 'كيس',
      parcel: '115',
      region: 'النرجس',
    },
  ],
  ...overrides,
});

describe('Scenario 3: اختبار تدفق المراجع الفني والإجراءات السريعة (Reviewer Flow & Quick Actions)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(authStorage, 'getToken').mockReturnValue('mock_token');
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockReviewerUser);
  });

  it('3.1 Verify quick action buttons (اعتماد, رفض / إرجاع) appear on the request card', () => {
    const onDirectApprove = vi.fn();
    const onDirectReject = vi.fn();

    const mockItem = createMockInboxItem({
      onDirectApprove,
      onDirectReject,
      directApproveLabel: 'اعتماد فوري',
      directRejectLabel: 'إرجاع / رفض',
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <ActionRequiredInbox
            title="طلبات تتطلب قرارك الفني"
            items={[mockItem]}
          />
        </AuthProvider>
      </MemoryRouter>
    );

    // Verify card rendered with PR code and description
    expect(screen.getByText('PR-2026-0077')).toBeInTheDocument();
    expect(screen.getByText(/أسمنت مقاوم 50 كجم/)).toBeInTheDocument();

    // Verify Quick Action buttons exist on the card
    const approveBtn = screen.getByRole('button', { name: /اعتماد فوري/i });
    expect(approveBtn).toBeInTheDocument();

    const rejectBtn = screen.getByRole('button', { name: /إرجاع \/ رفض/i });
    expect(rejectBtn).toBeInTheDocument();
  });

  it('3.2 Clicking reject on card opens modal requiring rejection_reason and prevents submission if empty', () => {
    const onDirectApprove = vi.fn();
    const onDirectReject = vi.fn();

    const mockItem = createMockInboxItem({
      onDirectApprove,
      onDirectReject,
      directRejectLabel: 'إرجاع / رفض',
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <ActionRequiredInbox
            title="طلبات تتطلب قرارك الفني"
            items={[mockItem]}
          />
        </AuthProvider>
      </MemoryRouter>
    );

    // Click quick reject button on card
    const rejectCardBtn = screen.getByRole('button', { name: /إرجاع \/ رفض/i });
    fireEvent.click(rejectCardBtn);

    // Rejection modal pops up
    expect(screen.getByRole('heading', { name: /رفض أو إعادة المعاملة/i })).toBeInTheDocument();
    expect(screen.getByText(/يرجى توضيح سبب الرفض بالتفصيل لمقدم الطلب/i)).toBeInTheDocument();

    // Try submitting without reason
    const confirmRejectBtn = screen.getByRole('button', { name: /تأكيد الرفض والإعادة/i });
    fireEvent.click(confirmRejectBtn);

    // Error must be displayed and reject API must NOT be called
    expect(screen.getByText(/يرجى كتابة سبب الرفض أو الإعادة أولاً/i)).toBeInTheDocument();
    expect(onDirectReject).not.toHaveBeenCalled();

    // Try submitting with only spaces
    const textarea = screen.getByPlaceholderText(/اكتب سبب الرفض الإلزامي هنا/i);
    fireEvent.change(textarea, { target: { value: '    ' } });
    fireEvent.click(confirmRejectBtn);

    expect(screen.getByText(/يرجى كتابة سبب الرفض أو الإعادة أولاً/i)).toBeInTheDocument();
    expect(onDirectReject).not.toHaveBeenCalled();
  });

  it('3.3 Entering a valid rejection reason calls onDirectReject with the reason', async () => {
    const onDirectReject = vi.fn().mockResolvedValue(undefined);

    const mockItem = createMockInboxItem({
      onDirectReject,
      directRejectLabel: 'إرجاع / رفض',
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <ActionRequiredInbox
            title="طلبات تتطلب قرارك الفني"
            items={[mockItem]}
          />
        </AuthProvider>
      </MemoryRouter>
    );

    const rejectCardBtn = screen.getByRole('button', { name: /إرجاع \/ رفض/i });
    fireEvent.click(rejectCardBtn);

    const textarea = screen.getByPlaceholderText(/اكتب سبب الرفض الإلزامي هنا/i);
    fireEvent.change(textarea, {
      target: { value: 'المواصفات الفنية غير مطابقة لاشتراطات صب الخرسانة' },
    });

    const confirmRejectBtn = screen.getByRole('button', { name: /تأكيد الرفض والإعادة/i });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(onDirectReject).toHaveBeenCalledWith(
        mockItem,
        'المواصفات الفنية غير مطابقة لاشتراطات صب الخرسانة'
      );
    });
  });

  it('3.4 RejectRequestDialog modal component enforces mandatory rejection reason (> 3 characters)', () => {
    const mockOnConfirm = vi.fn();
    const mockOnCancel = vi.fn();

    render(
      <RejectRequestDialog
        isOpen={true}
        requestNumber="PR-2026-0077"
        isRejecting={false}
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByRole('heading', { name: /رفض طلب الشراء/i })).toBeInTheDocument();
    expect(screen.getAllByText(/PR-2026-0077/).length).toBeGreaterThanOrEqual(1);

    const submitBtn = screen.getByRole('button', { name: /تأكيد الرفض/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/يرجى إدخال سبب الرفض/i)).toBeInTheDocument();
    expect(mockOnConfirm).not.toHaveBeenCalled();

    const textarea = screen.getByPlaceholderText(/يرجى كتابة سبب عدم قبول الطلب/i);
    fireEvent.change(textarea, {
      target: { value: 'يرجى مراجعة وتعديل المواصفات الهندسية' },
    });
    fireEvent.click(submitBtn);

    expect(mockOnConfirm).toHaveBeenCalledWith('يرجى مراجعة وتعديل المواصفات الهندسية');
  });
});

