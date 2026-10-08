import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ActionRequiredInbox, PendingActions, ActionInboxItem } from '../components/dashboard/ActionRequiredInbox';
import * as authStorage from '../utils/authStorage';
import * as authApi from '../api/auth';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockEmployeeUser = {
  id: 10,
  name: 'مهندس أحمد الميداني',
  email: 'ahmed@ashbiliya.com',
  is_active: true,
  roles: ['employee'],
  permissions: ['purchase_request.create', 'purchase_request.view_own'],
  department: {
    id: 1,
    name: 'المكتب الفني والمواقع',
    code: 'ENG',
  },
};

describe('Unified Pending Actions Frontend Widget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(authStorage, 'getToken').mockReturnValue('mock-token');
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue(mockEmployeeUser as any);
  });

  const sampleMixedItems: ActionInboxItem[] = [
    {
      id: 'pr-draft-101',
      rawId: 101,
      type: 'PR',
      code: 'PR-101',
      title: 'مسودة طلب مواد حديد تسليح',
      subtitle: 'مسودة لم تُرسل بعد',
      department: 'المكتب الفني',
      urgency: 'HIGH',
      reason: 'مسودة لم تُرسل بعد للمراجعة والاعتماد',
      actionUrl: '/employee/requests/101/edit',
      actionLabel: 'فتح وتعديل المسودة',
      items_count: 1,
      items_list: [{ description: 'حديد 16 مم', quantity: 10, uom: 'طن' }],
    },
    {
      id: 'receipt-202',
      rawId: 202,
      type: 'RECEIPT',
      code: 'REC-202',
      title: 'إذن استلام مواد أسمنت بورتلاندي',
      subtitle: 'لأمر الشراء PO-88',
      department: 'المكتب الفني',
      supplier: 'شركة الأسمنت الوطنية',
      urgency: 'CRITICAL',
      reason: 'تم استلام المواد وبانتظار معاينتك وفحصك الميداني/الهندسي واعتماد الاستلام بالموقع',
      actionUrl: '/site-engineer?receipt_id=202',
      actionLabel: 'فحص واعتماد إذن الاستلام',
      stageBadge: {
        text: 'إذن استلام مواد',
        icon: '📦',
        className: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
      },
      items_count: 1,
      items_list: [{ description: 'أسمنت بورتلاندي', quantity: 50, uom: 'شيكارة' }],
    },
  ];

  it('renders mixed cards (PR and RECEIPT) simultaneously with general description', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ActionRequiredInbox
            title="المهام والإجراءات المطلوبة منك الآن"
            description="جميع المعاملات والطلبات التي تتطلب تدخلك أو قرارك الفوري."
            items={sampleMixedItems}
          />
        </AuthProvider>
      </MemoryRouter>
    );

    // Verify title and unified general description
    expect(screen.getByText('المهام والإجراءات المطلوبة منك الآن')).toBeInTheDocument();
    expect(screen.getByText('جميع المعاملات والطلبات التي تتطلب تدخلك أو قرارك الفوري.')).toBeInTheDocument();

    // Verify both items appear at the same time
    expect(screen.getByText('PR-101')).toBeInTheDocument();
    expect(screen.getByText('REC-202')).toBeInTheDocument();
    expect(screen.getByText('مسودة طلب مواد حديد تسليح')).toBeInTheDocument();
    expect(screen.getByText('إذن استلام مواد أسمنت بورتلاندي')).toBeInTheDocument();
    expect(screen.getByText('إذن استلام مواد')).toBeInTheDocument();
  });

  it('navigates to site engineer inspection screen when clicking receipt card', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ActionRequiredInbox items={sampleMixedItems} />
        </AuthProvider>
      </MemoryRouter>
    );

    // Find and click receipt card
    const receiptCardCode = screen.getByText('REC-202');
    const receiptCard = receiptCardCode.closest('div.cursor-pointer');
    expect(receiptCard).not.toBeNull();

    fireEvent.click(receiptCard!);
    expect(mockNavigate).toHaveBeenCalledWith('/site-engineer?receipt_id=202');
  });

  it('navigates to request edit screen when clicking draft PR card', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ActionRequiredInbox items={sampleMixedItems} />
        </AuthProvider>
      </MemoryRouter>
    );

    // Find and click draft PR card
    const draftCardCode = screen.getByText('PR-101');
    const draftCard = draftCardCode.closest('div.cursor-pointer');
    expect(draftCard).not.toBeNull();

    fireEvent.click(draftCard!);
    expect(mockNavigate).toHaveBeenCalledWith('/employee/requests/101/edit');
  });

  it('PendingActions alias component behaves identically', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <PendingActions items={sampleMixedItems} />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('جميع المعاملات والطلبات التي تتطلب تدخلك أو قرارك الفوري.')).toBeInTheDocument();
    expect(screen.getByText('PR-101')).toBeInTheDocument();
    expect(screen.getByText('REC-202')).toBeInTheDocument();
  });
});
