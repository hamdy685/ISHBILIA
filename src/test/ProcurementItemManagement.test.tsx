import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrDetailsModal } from '../components/procurement/PrDetailsModal';
import { PurchaseRequest } from '../types/purchaseRequest';
import * as authContext from '../context/AuthContext';

const mockPr: PurchaseRequest = {
  id: 101,
  request_number: 'PR-2026-0099',
  user_id: 5,
  status: 'PENDING_PROCUREMENT_APPROVAL',
  priority: 'NORMAL',
  procurement_route: 'DIRECT',
  total_estimated_cost: '1500.00',
  currency: 'EGP',
  created_at: '2026-09-19T10:00:00Z',
  updated_at: '2026-09-19T10:00:00Z',
  items: [
    {
      id: 1,
      purchase_request_id: 101,
      item_description: 'حديد تسليح 12 مم',
      item_reference: 'PARCEL-01',
      region: 'الرياض',
      quantity: 10,
      uom: 'TON',
      estimated_unit_price: 150.0,
      estimated_line_total: 1500.0,
    } as any,
  ],
};

describe('PrDetailsModal Item Management Permissions & UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Add, Edit, and Delete item buttons for procurement role in PENDING_PROCUREMENT_APPROVAL', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 1, name: 'مدير المشتريات' } as any,
      isAuthenticated: true,
      isLoading: false,
      token: 'mock-token',
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (role: string) => role === 'procurement' || role === 'procurement_manager',
      hasPermission: () => true,
      hasAnyRole: () => true,
      hasAnyPermission: () => true,
    });

    render(
      <PrDetailsModal
        pr={mockPr}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Verify "+ إضافة بند" button exists
    expect(screen.getByText('+ إضافة بند')).toBeInTheDocument();

    // Verify "تعديل" and "حذف" buttons exist
    expect(screen.getAllByText('تعديل').length).toBeGreaterThan(0);
    expect(screen.getAllByText('حذف').length).toBeGreaterThan(0);
  });

  it('renders Add, Edit, and Delete item buttons for APPROVED_BY_ACCOUNTING and PENDING_QUOTE_RECOMMENDATIONS', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 1, name: 'مدير المشتريات' } as any,
      isAuthenticated: true,
      isLoading: false,
      token: 'mock-token',
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (role: string) => role === 'procurement',
      hasPermission: () => true,
      hasAnyRole: () => true,
      hasAnyPermission: () => true,
    });

    const accountingPr: PurchaseRequest = {
      ...mockPr,
      status: 'APPROVED_BY_ACCOUNTING',
    };

    render(
      <PrDetailsModal
        pr={accountingPr}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('+ إضافة بند')).toBeInTheDocument();
    expect(screen.getAllByText('تعديل').length).toBeGreaterThan(0);
    expect(screen.getAllByText('حذف').length).toBeGreaterThan(0);
  });

  it('hides item management buttons for regular employee when status is not DRAFT', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 5, name: 'الموظف صاحب الطلب' } as any,
      isAuthenticated: true,
      isLoading: false,
      token: 'mock-token',
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (role: string) => role === 'employee',
      hasPermission: () => false,
      hasAnyRole: () => false,
      hasAnyPermission: () => false,
    });

    render(
      <PrDetailsModal
        pr={mockPr}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Buttons should NOT be rendered
    expect(screen.queryByText('+ إضافة بند')).toBeNull();
    expect(screen.queryByText('تعديل')).toBeNull();
    expect(screen.queryByText('حذف')).toBeNull();
  });

  it('opens confirmation modal when delete button is clicked', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 1, name: 'مدير المشتريات' } as any,
      isAuthenticated: true,
      isLoading: false,
      token: 'mock-token',
      login: vi.fn(),
      logout: vi.fn(),
      hasRole: (role: string) => role === 'procurement',
      hasPermission: () => true,
      hasAnyRole: () => true,
      hasAnyPermission: () => true,
    });

    render(
      <PrDetailsModal
        pr={mockPr}
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const deleteButtons = screen.getAllByText('حذف');
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText('تأكيد حذف البند')).toBeInTheDocument();
  });
});
