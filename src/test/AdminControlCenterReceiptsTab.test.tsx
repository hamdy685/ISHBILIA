import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminControlCenterPage } from '../pages/admin/AdminControlCenterPage';
import * as controlCenterApi from '../api/admin/controlCenter';

vi.mock('../api/admin/controlCenter', () => ({
  searchAdminControlApi: vi.fn(),
  getAdminAuditLogsApi: vi.fn().mockResolvedValue({ data: [] }),
  previewImpactApi: vi.fn(),
  cancelDocumentSafelyApi: vi.fn(),
}));

vi.mock('../components/admin/AdminImpactPreviewModal', () => ({
  AdminImpactPreviewModal: () => <div data-testid="impact-modal" />,
}));

vi.mock('../components/admin/AdminReassignReceiptModal', () => ({
  AdminReassignReceiptModal: () => <div data-testid="reassign-modal" />,
}));

vi.mock('../components/admin/AdminWorkflowTransitionModal', () => ({
  AdminWorkflowTransitionModal: () => <div data-testid="transition-modal" />,
}));

vi.mock('../components/admin/AdminExcelGrid', () => ({
  AdminExcelGrid: () => <div data-testid="excel-grid" />,
}));

vi.mock('../utils/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('AdminControlCenterPage - Receipts Tab Rich Columns', () => {
  const mockReceiptsData: controlCenterApi.AdminControlSearchResult[] = [
    {
      entity_type: 'PURCHASE_RECEIPT',
      id: 80,
      code: 'REC-80',
      title: 'إذن استلام مواد: REC-80',
      status: 'PENDING_SITE_ENGINEER',
      department: 'إدارة التسويق',
      supplier: 'شركة بيشوى للتوريدات',
      receiver: 'عم سالم',
      date: '2026-10-19 14:00',
      weighing_group_id: null,
      project_site: 'قطعة 142 - منطقة A1',
      parcel_reference: '142',
      region: 'A1',
      po_id: 101,
      po_number: 'PO-2026-00101',
      pr_id: 55,
      pr_number: 'PR-2026-00055',
      requester_name: 'م. أحمد الشريف',
      items_summary: 'طوب أحمر مفرغ (12000 PCS)',
      items_count: 1,
      total_quantity: 12000,
      amount: 29400,
      has_photo: true,
      photo_url: 'https://example.com/receipt-80.jpg',
      invoice_status: 'PENDING_INVOICE',
      invoice_status_label: 'بانتظار الفاتورة والتسجيل',
      days_elapsed: 0,
      received_at: '2026-10-19',
      site_engineer_notes: 'تم استلام الطوب بحالة جيدة ونظيف',
      items_list: [
        {
          id: 501,
          item_description: 'طوب أحمر مفرغ',
          ordered_quantity: 12000,
          received_quantity: 12000,
          uom: 'PCS',
          unit_price: 2.45,
          line_total: 29400,
          item_reference: '142',
          region: 'A1',
        },
      ],
    },
    {
      entity_type: 'PURCHASE_RECEIPT',
      id: 79,
      code: 'REC-79',
      title: 'إذن استلام مواد: REC-79',
      status: 'APPROVED',
      department: 'إدارة التنفيذ',
      supplier: 'شركة حامد عتار للحديد',
      receiver: 'م. كامل',
      date: '2026-10-15 10:00',
      weighing_group_id: 12,
      project_site: 'مشروع فيلات الياسمين (قطعة 88 - منطقة B)',
      parcel_reference: '88',
      region: 'B',
      po_id: 102,
      po_number: 'PO-2026-00102',
      pr_id: 56,
      pr_number: 'PR-2026-00056',
      requester_name: 'م. حاتم',
      items_summary: 'حديد تسليح 16 مم (25 TON)',
      items_count: 1,
      total_quantity: 25,
      amount: 112500,
      has_photo: false,
      photo_url: null,
      invoice_status: 'RECORDED',
      invoice_status_label: 'مسقط ومسجل بالحسابات',
      days_elapsed: 4,
      received_at: '2026-10-15',
      items_list: [
        {
          id: 502,
          item_description: 'حديد تسليح 16 مم',
          ordered_quantity: 25,
          received_quantity: 25,
          uom: 'TON',
          unit_price: 4500,
          line_total: 112500,
          item_reference: '88',
          region: 'B',
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(controlCenterApi.searchAdminControlApi).mockResolvedValue({
      count: 2,
      data: mockReceiptsData,
      lookups: {
        departments: [
          { id: 1, name: 'إدارة التسويق', code: 'MKT' },
          { id: 2, name: 'إدارة التنفيذ', code: 'EXEC' },
        ],
        suppliers: [
          { id: 10, company_name: 'شركة بيشوى للتوريدات', name: 'بيشوى' },
          { id: 11, company_name: 'شركة حامد عتار للحديد', name: 'عتار' },
        ],
      },
    } as any);
  });

  it('renders rich decision-making columns when switching to RECEIPTS tab', async () => {
    render(<AdminControlCenterPage />);

    // Wait for initial load and tabs to render
    const tabBtn = await screen.findByTestId('tab-receipts');
    fireEvent.click(tabBtn);

    // Wait for Receipts tab content to appear
    const content = await screen.findByTestId('receipts-tab-content');

    // Verify rich table headers exist
    expect(screen.getByText('رقم الإذن REC والنوع')).toBeInTheDocument();
    expect(screen.getByText('أمر وطلب الشراء')).toBeInTheDocument();
    expect(screen.getByText('الموقع والقطعة والمنطقة')).toBeInTheDocument();
    expect(screen.getByText('المورد والقسم')).toBeInTheDocument();
    expect(screen.getByText('الأصناف والكميات المستلمة')).toBeInTheDocument();
    expect(screen.getByText('القيمة المالية')).toBeInTheDocument();
    expect(screen.getByText('المستلم الميداني')).toBeInTheDocument();
    expect(screen.getByText('إثبات الاستلام')).toBeInTheDocument();
    expect(screen.getByText('حالة الاستلام بالموقع')).toBeInTheDocument();
    expect(screen.getByText('الحالة المحاسبية')).toBeInTheDocument();

    // Verify rows data
    expect(screen.getByText('REC-80')).toBeInTheDocument();
    expect(screen.getByText('PO-2026-00101')).toBeInTheDocument();
    expect(screen.getByText('طوب أحمر مفرغ (12000 PCS)')).toBeInTheDocument();
    expect(screen.getByText('قطعة 142 - منطقة A1')).toBeInTheDocument();
    expect(screen.getAllByText('شركة بيشوى للتوريدات').length).toBeGreaterThan(0);
    expect(screen.getByText('بانتظار الفاتورة والتسجيل')).toBeInTheDocument();
    expect(screen.getByText('مسقط ومسجل بالحسابات')).toBeInTheDocument();
  });

  it('opens quick inspection modal when clicking on view items button', async () => {
    render(<AdminControlCenterPage />);

    const tabBtn = await screen.findByTestId('tab-receipts');
    fireEvent.click(tabBtn);

    await screen.findByTestId('receipts-tab-content');

    // Click "معاينة البنود" on the first receipt
    const viewItemsBtns = screen.getAllByText(/معاينة البنود/i);
    expect(viewItemsBtns.length).toBeGreaterThan(0);
    fireEvent.click(viewItemsBtns[0]);

    // Modal should appear with items details
    expect(await screen.findByText('معاينة وبيانات إذن الاستلام التفصيلي')).toBeInTheDocument();
    expect(screen.getByText('طوب أحمر مفرغ')).toBeInTheDocument();
    expect(screen.getAllByText('12,000').length).toBeGreaterThan(0);
  });
});
