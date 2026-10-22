import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ActionRequiredInbox, ActionInboxItem } from '../components/dashboard/ActionRequiredInbox';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockGmAuth: any = {
  user: {
    id: 1,
    name: 'المهندس محمد عبدالكريم',
    email: 'gm@company.test',
    roles: [{ id: 1, slug: 'general_manager', name: 'المدير العام' }],
  },
  token: 'fake-token',
  hasRole: (slug: string) => slug === 'general_manager' || slug === 'execution_manager',
  hasAnyRole: (slugs: string[]) => slugs.includes('general_manager'),
  hasPermission: () => true,
  isLoading: false,
};

const mockReviewerAuth: any = {
  user: {
    id: 2,
    name: 'مهندس المراجعة',
    email: 'reviewer@company.test',
    roles: [{ id: 2, slug: 'reviewer', name: 'المراجع' }],
  },
  token: 'fake-token',
  hasRole: (slug: string) => slug === 'reviewer',
  hasAnyRole: (slugs: string[]) => slugs.includes('reviewer'),
  hasPermission: () => true,
  isLoading: false,
};

const samplePrItem: ActionInboxItem = {
  id: 'pr-123',
  rawId: 123,
  type: 'PR',
  code: 'PR-123',
  title: 'طلب مستلزمات مكتبية',
  requester: 'عمرو بيومي',
  department: 'المبيعات',
  reason: 'طلب شراء مسعر من إدارة المشتريات ومحدد المورد — بانتظار اعتمادك النهائي',
  actionUrl: '/general-manager/purchase-requests?open=123',
  actionLabel: 'مراجعة الأسعار والمورد وتعديل الطلب',
  purpose: 'توريد وتركيب أجهزة تابلت ميدانية لمشرفي الموقع لفحص ومطابقة الاستلامات',
  notes: 'توريد وتركيب أجهزة تابلت ميدانية لمشرفي الموقع لفحص ومطابقة الاستلامات',
};

describe('Purchase Purpose Button and Modal (Executive & Approvers)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces the preview button with "الغرض من الشراء" for the General Manager', () => {
    vi.mocked(useAuth).mockReturnValue(mockGmAuth);

    render(
      <MemoryRouter>
        <ActionRequiredInbox
          items={[samplePrItem]}
          roleName="الإدارة التنفيذية العليا"
        />
      </MemoryRouter>
    );

    // The Preview button "معاينة" must NOT be rendered for General Manager
    expect(screen.queryByText('معاينة')).toBeNull();

    // The "الغرض من الشراء" button MUST be rendered
    const purposeBtn = screen.getByRole('button', { name: /الغرض من الشراء/i });
    expect(purposeBtn).toBeTruthy();
  });

  it('opens the mobile-friendly purpose modal with full original text and closes with "×"', async () => {
    vi.mocked(useAuth).mockReturnValue(mockGmAuth);

    render(
      <MemoryRouter>
        <ActionRequiredInbox
          items={[samplePrItem]}
          roleName="الإدارة التنفيذية العليا"
        />
      </MemoryRouter>
    );

    const purposeBtn = screen.getByRole('button', { name: /الغرض من الشراء/i });
    fireEvent.click(purposeBtn);

    // The modal must display the original purpose text in full
    expect(screen.getByText('توريد وتركيب أجهزة تابلت ميدانية لمشرفي الموقع لفحص ومطابقة الاستلامات')).toBeTruthy();

    // The modal must display the code badge
    expect(screen.getAllByText('PR-123').length).toBeGreaterThanOrEqual(2);

    // The modal must display the requester name
    expect(screen.getAllByText('عمرو بيومي').length).toBeGreaterThanOrEqual(2);

    // The modal must display the read-only notice
    expect(screen.getByText(/نص أصلي للقراءة فقط/i)).toBeTruthy();

    // Clicking "×" closes the modal
    const closeBtn = screen.getByTitle('إغلاق');
    fireEvent.click(closeBtn);

    expect(screen.queryByText('توريد وتركيب أجهزة تابلت ميدانية لمشرفي الموقع لفحص ومطابقة الاستلامات')).toBeNull();
  });

  it('provides the purpose button for reviewers as well', () => {
    vi.mocked(useAuth).mockReturnValue(mockReviewerAuth);

    render(
      <MemoryRouter>
        <ActionRequiredInbox
          items={[samplePrItem]}
          roleName="قسم المراجعة"
        />
      </MemoryRouter>
    );

    // Reviewer has both معاينة and الغرض
    expect(screen.getByText('معاينة')).toBeTruthy();
    expect(screen.getByRole('button', { name: /الغرض/i })).toBeTruthy();
  });
});
