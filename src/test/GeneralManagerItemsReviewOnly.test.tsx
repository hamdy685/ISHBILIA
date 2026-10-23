import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GeneralManagerPurchaseRequestsPage } from '../pages/general-manager/GeneralManagerPurchaseRequestsPage';
import * as gmApi from '../api/generalManager';
import { useAuth } from '../context/AuthContext';
import { PurchaseRequest } from '../types/purchaseRequest';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../api/generalManager', () => ({
  getGeneralManagerPurchaseRequestsApi: vi.fn(),
  approveGeneralManagerPurchaseRequestApi: vi.fn(),
  rejectGeneralManagerPurchaseRequestApi: vi.fn(),
  updateGeneralManagerPurchaseRequestApi: vi.fn(),
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

const sampleRequest: PurchaseRequest = {
  id: 135,
  request_number: 'PR-135',
  status: 'APPROVED_BY_REVIEWER',
  priority: 'NORMAL',
  request_type: 'OFFICE_SUPPLIES',
  date_needed: '2026-10-25',
  notes: 'توفير مستلزمات مكتبية للمقر الرئيسي',
  requester: {
    id: 10,
    name: 'أحمد محمود',
    email: 'ahmed@test.com',
  },
  department: {
    id: 2,
    name: 'إدارة تكنولوجيا المعلومات',
  },
  direct_supplier: {
    id: 5,
    company_name: 'شركة التقنية للتجهيزات',
  },
  items: [
    {
      id: 501,
      item_description: 'ماوس للابتوب',
      item_reference: 'مقر الشركة',
      region: 'إداري / المقر الرئيسي',
      quantity: 1,
      uom: 'PCS',
      estimated_unit_price: 150,
      estimated_line_total: 150,
    },
    {
      id: 502,
      item_description: 'لوحة مفاتيح سلكية',
      item_reference: 'مقر الشركة',
      region: 'إداري / المقر الرئيسي',
      quantity: 2,
      uom: 'PCS',
      estimated_unit_price: 200,
      estimated_line_total: 400,
    },
  ],
  created_at: '2026-10-23T10:00:00Z',
  updated_at: '2026-10-23T10:00:00Z',
};

describe('GeneralManager Items-Only Review Interface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue(mockGmAuth);
    vi.mocked(gmApi.getGeneralManagerPurchaseRequestsApi).mockResolvedValue([sampleRequest]);
    vi.mocked(gmApi.approveGeneralManagerPurchaseRequestApi).mockResolvedValue({} as any);
    vi.mocked(gmApi.updateGeneralManagerPurchaseRequestApi).mockResolvedValue({} as any);
  });

  it('renders ONLY the items review section and actions when opened with view=items_only', async () => {
    render(
      <MemoryRouter initialEntries={['/general-manager/purchase-requests?open=135&view=items_only']}>
        <Routes>
          <Route path="/general-manager/purchase-requests" element={<GeneralManagerPurchaseRequestsPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for the request to load and modal to open in items_only view
    await waitFor(() => {
      expect(screen.getByText('مراجعة بنود الطلب والاعتماد الجزئي')).toBeInTheDocument();
    });

    // 1. Check title & badge
    expect(screen.getByText('معتمد: 2 من 2 بند')).toBeInTheDocument();

    // 2. Check item cards contents
    expect(screen.getByDisplayValue('ماوس للابتوب')).toBeInTheDocument();
    expect(screen.getByDisplayValue('لوحة مفاتيح سلكية')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('مقر الشركة')).toHaveLength(2);
    expect(screen.getAllByDisplayValue('إداري / المقر الرئيسي')).toHaveLength(2);

    // 3. Check item action buttons
    const excludeButtons = screen.getAllByRole('button', { name: /استبعاد هذا البند/i });
    expect(excludeButtons).toHaveLength(2);

    // 4. Check bottom approval & rejection buttons
    expect(screen.getByRole('button', { name: /اعتماد البنود المحددة/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /رفض الطلب بالكامل/i })).toBeInTheDocument();

    // 5. Verify long-page sections are NOT displayed in items_only mode
    expect(screen.queryByText('مسار دورة الاعتمادات والقرارات')).not.toBeInTheDocument();
    expect(screen.queryByText('الغرض من الشراء ومبررات الاحتياج:')).not.toBeInTheDocument();
    expect(screen.queryByText('سجل التدقيق والملاحظات الشاملة')).not.toBeInTheDocument();
  });

  it('supports item exclusion, toggle, and partial approval saving to backend', async () => {
    render(
      <MemoryRouter initialEntries={['/general-manager/purchase-requests?open=135&view=items_only']}>
        <Routes>
          <Route path="/general-manager/purchase-requests" element={<GeneralManagerPurchaseRequestsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('معتمد: 2 من 2 بند')).toBeInTheDocument();
    });

    // Exclude the first item
    const excludeButtons = screen.getAllByRole('button', { name: /استبعاد هذا البند/i });
    fireEvent.click(excludeButtons[0]);

    // Check count updated to 1 of 2
    expect(screen.getByText('معتمد: 1 من 2 بند')).toBeInTheDocument();
    expect(screen.getByText('❌ مستبعد من الشراء')).toBeInTheDocument();
    expect(screen.getByText('↩️ استرجاع البند')).toBeInTheDocument();

    // Click approve button
    const approveBtn = screen.getByRole('button', { name: /اعتماد البنود المحددة \(1\)/i });
    fireEvent.click(approveBtn);

    // Verify backend update API was called with the single remaining approved item
    await waitFor(() => {
      expect(gmApi.updateGeneralManagerPurchaseRequestApi).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(gmApi.updateGeneralManagerPurchaseRequestApi).mock.calls[0];
      expect(callArgs[0]).toBe(135);
      expect(callArgs[1].items).toHaveLength(1);
      expect(callArgs[1].items[0].item_description).toBe('لوحة مفاتيح سلكية');
    });
  });

  it('renders original full view when opened without view=items_only', async () => {
    render(
      <MemoryRouter initialEntries={['/general-manager/purchase-requests?open=135']}>
        <Routes>
          <Route path="/general-manager/purchase-requests" element={<GeneralManagerPurchaseRequestsPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for the modal to open in full mode
    await waitFor(() => {
      expect(screen.getByText('قرار المدير العام')).toBeInTheDocument();
    });

    // Check that timeline and info cards are present in full mode
    expect(screen.getAllByText('مقدم الطلب').length).toBeGreaterThan(0);
    expect(screen.getAllByText('أحمد محمود').length).toBeGreaterThan(0);
    expect(screen.getByText('تاريخ الاحتياج ⏳')).toBeInTheDocument();
    expect(screen.getByText('📦 مراجعة البنود فقط')).toBeInTheDocument();
  });
});
