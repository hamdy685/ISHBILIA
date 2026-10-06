import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DirectAccountingReviewModal from '../components/procurement/DirectAccountingReviewModal';
import { PurchaseRequest } from '../types/purchaseRequest';
import { المورد } from '../types/purchaseOrder';

const mockRequest = {
  id: 101,
  request_number: 'PR-TEST-101',
  date_needed: '2026-09-15',
  items: [
    {
      id: 11,
      item_description: 'حديد تسليح 12 مم',
      item_reference: 'P-101',
      region: 'المنطقة الصناعية',
      quantity: 10,
      estimated_unit_price: '500',
      uom: 'TON',
    },
  ],
  requester: { id: 1, name: 'موظف تجريبي' },
  department: { id: 1, name: 'إدارة المشروعات' },
} as unknown as PurchaseRequest;

const mockSuppliers = [
  { id: 1, company_name: 'شركة الأمل للتوريدات', is_active: true },
  { id: 2, company_name: 'شركة البناء الحديث', is_active: false },
] as unknown as المورد[];

describe('DirectAccountingReviewModal', () => {
  it('renders correctly when open with request and active suppliers', () => {
    render(
      <DirectAccountingReviewModal
        isOpen={true}
        request={mockRequest}
        suppliers={mockSuppliers}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(screen.getByText(/إدخال البيانات المالية — PR-TEST-101/)).toBeInTheDocument();
    expect(screen.getAllByText('حديد تسليح 12 مم').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('👤 إرسال للمدير التنفيذي للاعتماد')).toBeInTheDocument();
  });

  it('renders safely without throwing when suppliers is undefined or empty', () => {
    render(
      <DirectAccountingReviewModal
        isOpen={true}
        request={mockRequest}
        suppliers={undefined as unknown as المورد[]}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(screen.getByText(/إدخال البيانات المالية — PR-TEST-101/)).toBeInTheDocument();
    expect(screen.getByText('👤 إرسال للمدير التنفيذي للاعتماد')).toBeInTheDocument();
  });

  it('renders correctly with explicit accounting target destination', () => {
    render(
      <DirectAccountingReviewModal
        isOpen={true}
        request={mockRequest}
        suppliers={mockSuppliers}
        targetDestination="accounting"
        onClose={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(screen.getByText(/إدخال البيانات المالية — PR-TEST-101/)).toBeInTheDocument();
    expect(screen.getByText('💰 اعتماد وإرسال للإدارة المالية')).toBeInTheDocument();
  });

  it('renders safely when request has empty items or undefined items', () => {
    const emptyRequest = {
      id: 102,
      request_number: 'PR-EMPTY-102',
      items: undefined,
    } as unknown as PurchaseRequest;

    render(
      <DirectAccountingReviewModal
        isOpen={true}
        request={emptyRequest}
        suppliers={[]}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(screen.getByText(/إدخال البيانات المالية — PR-EMPTY-102/)).toBeInTheDocument();
    expect(screen.getAllByText('لا توجد بنود مرتبطة بهذا الطلب لإدخال بياناتها المالية.').length).toBeGreaterThanOrEqual(1);
  });

  it('renders safely in accounting review mode with read-only badges and approve/reject buttons', () => {
    render(
      <DirectAccountingReviewModal
        isOpen={true}
        request={mockRequest}
        suppliers={mockSuppliers}
        reviewMode="accounting"
        onClose={() => undefined}
        onConfirm={() => undefined}
        onReject={() => undefined}
      />
    );

    expect(screen.getByText(/اعتماد طلب الشراء المباشر — PR-TEST-101/)).toBeInTheDocument();
    expect(screen.getByText('✓ موافقة واعتماد')).toBeInTheDocument();
    expect(screen.getByText('✕ رفض الطلب')).toBeInTheDocument();
  });

  it('opens and closes repeatedly without changing hook order or crashing', () => {
    const { rerender } = render(
      <DirectAccountingReviewModal
        isOpen={false}
        request={null}
        suppliers={mockSuppliers}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />
    );

    // Open with request
    rerender(
      <DirectAccountingReviewModal
        isOpen={true}
        request={mockRequest}
        suppliers={mockSuppliers}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(screen.getByText(/إدخال البيانات المالية — PR-TEST-101/)).toBeInTheDocument();

    // Close
    rerender(
      <DirectAccountingReviewModal
        isOpen={false}
        request={null}
        suppliers={mockSuppliers}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />
    );

    // Reopen
    rerender(
      <DirectAccountingReviewModal
        isOpen={true}
        request={mockRequest}
        suppliers={mockSuppliers}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(screen.getByText(/إدخال البيانات المالية — PR-TEST-101/)).toBeInTheDocument();
  });
});
