import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { PrintableMaterialTransfer } from '../components/transfers/PrintableMaterialTransfer';
import { MaterialTransferRequest } from '../types/materialTransfer';

vi.mock('../utils/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('MaterialTransfer Workflow & Components', () => {
  const mockTransfer: MaterialTransferRequest = {
    id: 101,
    request_number: 'MTR-202610-001',
    user_id: 1,
    status: 'ARCHIVED',
    transfer_date: '2026-10-23',
    from_project: 'مشروع أبراج النرجس',
    to_project: 'مشروع فيلات الياسمين',
    driver_name: 'عماد الدين حسن',
    vehicle_plate_number: 'أ ب ج 1234',
    reviewer_id: 2,
    reviewed_at: '2026-10-23T10:00:00Z',
    review_notes: 'معتمد للنقل وفق احتياج الموقع',
    accountant_id: 3,
    accounted_at: '2026-10-23T11:30:00Z',
    accounting_notes: 'تم الخصم والإضافة في مراكز التكلفة',
    created_at: '2026-10-23T08:00:00Z',
    updated_at: '2026-10-23T11:30:00Z',
    user: { id: 1, name: 'م. أحمد مهندس الموقع' },
    reviewer: { id: 2, name: 'م. خالد المراجع العام' },
    accountant: { id: 3, name: 'أ. محمود محاسب المشروعات' },
    items: [
      {
        id: 1,
        material_transfer_request_id: 101,
        item_description: 'حديد تسليح 16 مم عز الدخيلة',
        uom: 'طن',
        quantity: 12.5,
        notes: 'سليم ومرصوص على بالتات',
      },
      {
        id: 2,
        material_transfer_request_id: 101,
        item_description: 'أسمنت بورتلاندي مقاوم',
        uom: 'شيكارة',
        quantity: 200,
        notes: 'إنتاج الشهر الحالي',
      },
    ],
  };

  it('renders PrintableMaterialTransfer with all company headers, project info, items and 3 signature blocks', () => {
    const handleClose = vi.fn();
    render(<PrintableMaterialTransfer request={mockTransfer} onClose={handleClose} />);

    // Title and Company Header
    expect(screen.getByText(/MATERIAL TRANSFER REQUEST/)).toBeDefined();
    expect(screen.getByText('إدارة المشروعات')).toBeDefined();
    expect(screen.getByText('معاينة وطباعة نموذج طلب نقل الخامات')).toBeDefined();

    // Request Number & Date
    expect(screen.getByText('MTR-202610-001')).toBeDefined();
    expect(screen.getAllByText(/2026/).length).toBeGreaterThanOrEqual(1);

    // From and To Projects
    expect(screen.getByText('مشروع أبراج النرجس')).toBeDefined();
    expect(screen.getByText('مشروع فيلات الياسمين')).toBeDefined();

    // Driver & Vehicle
    expect(screen.getByText(/عماد الدين حسن/)).toBeDefined();
    expect(screen.getByText(/أ ب ج 1234/)).toBeDefined();

    // Items table content
    expect(screen.getByText('حديد تسليح 16 مم عز الدخيلة')).toBeDefined();
    expect(screen.getByText('أسمنت بورتلاندي مقاوم')).toBeDefined();
    expect(screen.getByText('12.5')).toBeDefined();
    expect(screen.getByText('200')).toBeDefined();

    // 3 Official Signature Blocks
    expect(screen.getByText('مسؤول الإفراج والتحميل')).toBeDefined();
    expect(screen.getByText('السائق المستلم')).toBeDefined();
    expect(screen.getByText('مسؤول الاستلام بالموقع')).toBeDefined();
  });

  it('invokes onClose when clicking close button in PrintableMaterialTransfer', () => {
    const handleClose = vi.fn();
    render(<PrintableMaterialTransfer request={mockTransfer} onClose={handleClose} />);

    const closeBtn = screen.getByText('إغلاق');
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
