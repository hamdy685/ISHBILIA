import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ProcurementPendingReceiptsPage } from '../pages/procurement/ProcurementPendingReceiptsPage';
import * as procurementApi from '../api/procurement';

vi.mock('../api/procurement', () => ({
  getProcurementPendingReceiptsApi: vi.fn(),
}));

describe('ProcurementPendingReceiptsPage', () => {
  const mockReceipts = [
    {
      id: 101,
      code: 'REC-2026-00101',
      status: 'PENDING_SITE_ENGINEER',
      po_id: 55,
      po_number: 'PO-2026-00055',
      pr_id: 12,
      pr_number: 'PR-2026-00012',
      supplier: 'شركة الحديد والصلب المصرية',
      department: 'إدارة التنفيذ',
      project_site: 'كمبوند إشبيلية (قطعة 1483)',
      parcel_reference: '1483',
      region: 'أ',
      receiver: 'م. أحمد يوسف',
      receiver_role: 'مهندس الموقع',
      amount: 450000,
      days_elapsed: 4,
      date: '2026-10-20 14:30',
      items_summary: 'حديد تسليح 16 مم (15 طن)',
      items_count: 1,
      has_photo: true,
      photo_url: '/storage/receipts/test.jpg',
      items_list: [
        {
          id: 1,
          item_description: 'حديد تسليح 16 مم',
          received_quantity: 15,
          ordered_quantity: 15,
          uom: 'طن',
          item_reference: '1483',
          region: 'أ',
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pending receipts table and clearly displays the responsible site engineer', async () => {
    vi.mocked(procurementApi.getProcurementPendingReceiptsApi).mockResolvedValue({
      success: true,
      count: 1,
      data: mockReceipts,
    });

    render(
      <BrowserRouter>
        <ProcurementPendingReceiptsPage />
      </BrowserRouter>
    );

    // Verify loading disappears and page header renders
    await waitFor(() => {
      expect(screen.getByText('📦 متابعة أذونات الاستلام المتوقفة بالمواقع')).toBeInTheDocument();
    });

    // Verify receipt code is rendered
    expect(screen.getByText('REC-2026-00101')).toBeInTheDocument();

    // Verify linked PO is rendered
    expect(screen.getByText('PO-2026-00055')).toBeInTheDocument();

    // Verify site engineer / receiver name is rendered clearly
    expect(screen.getByText('م. أحمد يوسف')).toBeInTheDocument();
    expect(screen.getByText('(مهندس الموقع)')).toBeInTheDocument();

    // Verify supplier is displayed
    expect(screen.getByText('شركة الحديد والصلب المصرية')).toBeInTheDocument();

    // Verify delayed badge is shown (4 days >= 3 days)
    expect(screen.getByText('🔥 متأخر')).toBeInTheDocument();
  });
});
