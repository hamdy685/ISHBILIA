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

  it('renders SUPPLEMENT and QUOTE cards with proper stage badges and navigates on click', () => {
    const reviewerItems: ActionInboxItem[] = [
      {
        id: 'supplement-303',
        rawId: 303,
        type: 'SUPPLEMENT',
        code: 'PR-101 (كمالة #1)',
        title: 'طلب كمالة جديد (دفعة #1) — PR-101',
        subtitle: 'بنود إضافية ملحقة بطلب الشراء تنتظر مراجعتك واعتمادك الفني',
        department: 'المكتب الفني',
        urgency: 'CRITICAL',
        reason: 'طلب كمالة جديد (دفعة إضافية) مقدم بانتظار مراجعتك واعتمادك الفني',
        actionUrl: '/requests/supplements?expand_pr=101&supplement_id=303',
        actionLabel: 'مراجعة واعتماد الكمالة',
        stageBadge: {
          text: 'كمالة عاجلة',
          icon: '➕',
          className: 'bg-purple-950/80 text-purple-300 border-purple-800/60',
        },
        items_count: 1,
        items_list: [{ description: 'حديد تسليح إضافي', quantity: 5, uom: 'طن' }],
      },
      {
        id: 'quote-404',
        rawId: 404,
        type: 'QUOTE',
        code: 'PR-404',
        title: 'عروض أسعار بانتظار الترشيح',
        subtitle: 'عروض أسعار مسجلة من الموردين',
        department: 'المكتب الفني',
        urgency: 'HIGH',
        reason: 'عروض أسعار مسجلة بانتظار التوصية الفنية لاختيار العرض الأنسب',
        actionUrl: '/reviewer/purchase-quotes?open=404',
        actionLabel: 'البت وترشيح عروض الأسعار',
        stageBadge: {
          text: 'ترشيح أسعار',
          icon: '⚖️',
          className: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
        },
        items_count: 1,
        items_list: [{ description: 'خرسانة جاهزة', quantity: 100, uom: 'م3' }],
      },
    ];

    render(
      <MemoryRouter>
        <AuthProvider>
          <PendingActions items={reviewerItems} />
        </AuthProvider>
      </MemoryRouter>
    );

    // Badges
    expect(screen.getByText('كمالة عاجلة')).toBeInTheDocument();
    expect(screen.getByText('ترشيح أسعار')).toBeInTheDocument();

    // Clicking Supplement card navigates to supplements page with query params
    const supplementCard = screen.getByText('PR-101 (كمالة #1)').closest('div.cursor-pointer');
    expect(supplementCard).not.toBeNull();
    fireEvent.click(supplementCard!);
    expect(mockNavigate).toHaveBeenCalledWith('/requests/supplements?expand_pr=101&supplement_id=303');

    // Clicking Quote card navigates to quotes decision page
    const quoteCard = screen.getByText('PR-404').closest('div.cursor-pointer');
    expect(quoteCard).not.toBeNull();
    fireEvent.click(quoteCard!);
    expect(mockNavigate).toHaveBeenCalledWith('/reviewer/purchase-quotes?open=404');
  });

  it('navigates to /receipts/:id/inspect using actual receipt_id when clicking button', () => {
    const receiptItem: ActionInboxItem[] = [
      {
        id: 'receipt-505',
        rawId: 505,
        receipt_id: 505,
        po_id: 88,
        type: 'RECEIPT',
        code: 'REC-505',
        title: 'إذن استلام مواد سيراميك',
        subtitle: 'لأمر الشراء PO-88',
        department: 'المكتب الفني',
        urgency: 'CRITICAL',
        reason: 'تم استلام المواد وبانتظار معاينتك وفحصك الميداني/الهندسي واعتماد الاستلام بالموقع',
        actionUrl: '/receipts/505/inspect',
        actionLabel: 'فحص واعتماد إذن الاستلام',
      },
    ];

    render(
      <MemoryRouter>
        <AuthProvider>
          <PendingActions items={receiptItem} />
        </AuthProvider>
      </MemoryRouter>
    );

    const actionButton = screen.getByRole('button', { name: /فحص واعتماد إذن الاستلام/i });
    fireEvent.click(actionButton);
    expect(mockNavigate).toHaveBeenCalledWith('/receipts/505/inspect');
  });

  it('purges wrong po_id/pr_id from actionUrl and routes to /receipts/:id/inspect with genuine receipt_id', () => {
    const contaminatedItem: ActionInboxItem[] = [
      {
        id: 'receipt-606',
        rawId: 606,
        receipt_id: 606,
        po_id: 99,
        type: 'RECEIPT',
        code: 'REC-606',
        title: 'إذن استلام مواد رمل صب',
        subtitle: 'لأمر الشراء PO-99',
        department: 'المكتب الفني',
        urgency: 'CRITICAL',
        reason: 'تم استلام المواد وبانتظار معاينتك وفحصك الميداني/الهندسي واعتماد الاستلام بالموقع',
        // Deliberately contaminated actionUrl passing po_id instead of receipt_id
        actionUrl: '/site-engineer?po_id=99',
        actionLabel: 'فحص واعتماد إذن الاستلام',
      },
    ];

    render(
      <MemoryRouter>
        <AuthProvider>
          <ActionRequiredInbox items={contaminatedItem} />
        </AuthProvider>
      </MemoryRouter>
    );

    const actionButton = screen.getByRole('button', { name: /فحص واعتماد إذن الاستلام/i });
    fireEvent.click(actionButton);
    // Verified that po_id=99 was stripped and genuine receipt_id=606 is used
    expect(mockNavigate).toHaveBeenCalledWith('/receipts/606/inspect');
  });
});
