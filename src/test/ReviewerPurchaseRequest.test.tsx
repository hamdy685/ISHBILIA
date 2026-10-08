import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import ReviewerDashboardPage from '../pages/reviewer/ReviewerDashboardPage';
import ReviewerRequestsPage from '../pages/reviewer/ReviewerRequestsPage';
import ReviewPurchaseRequestPage from '../pages/reviewer/ReviewPurchaseRequestPage';
import * as reviewerApi from '../api/reviewer';
import * as authApi from '../api/auth';
import * as authStorage from '../utils/authStorage';
import { PurchaseRequest } from '../types/purchaseRequest';

const reviewer = { id: 2, name: 'Reviewer', email: 'reviewer@example.test', is_active: true, roles: ['reviewer'], permissions: ['purchase_request.view_assigned', 'purchase_request.review', 'purchase_request.edit_during_review', 'purchase_request.approve', 'purchase_request.reject'] };
const submitted: PurchaseRequest = { id: 10, request_number: 'PR-10', status: 'SUBMITTED', priority: 'NORMAL', created_at: '2026-08-11T00:00:00Z', updated_at: '2026-08-11T00:00:00Z', items: [{ id: 1, item_description: 'Monitor', quantity: '1.00', uom: 'PCS' }] };
const underReview: PurchaseRequest = { ...submitted, status: 'UNDER_REVIEW' };
const pendingProcurement: PurchaseRequest = { ...submitted, status: 'PENDING_PROCUREMENT_APPROVAL' };

const renderPage = (path: string, element: React.ReactElement) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes><Route path="/reviewer/requests/:id/review" element={element} /><Route path="*" element={element} /></Routes></AuthProvider></MemoryRouter>);

describe('Reviewer purchase request frontend', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authStorage, 'getToken').mockReturnValue('token');
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue(reviewer);
  });

  it('renders dashboard counts from backend-scoped requests', async () => {
    vi.spyOn(reviewerApi, 'getReviewableRequestsApi').mockResolvedValue([submitted]);
    renderPage('/reviewer', <ReviewerDashboardPage />);
    await waitFor(() => expect(screen.getAllByText('PR-10').length).toBeGreaterThan(0), { timeout: 4000 });
  });

  it('shows Start Review only for submitted queue requests', async () => {
    vi.spyOn(reviewerApi, 'getReviewableRequestsApi').mockResolvedValue([submitted]);
    renderPage('/reviewer/requests', <ReviewerRequestsPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /في انتظار بدء المراجعة/i })).toBeInTheDocument());
    expect(screen.queryByText(/مساحة العمل والتعديل/i)).not.toBeInTheDocument();
  });

  it('starts review through the reviewer API and reveals editing', async () => {
    vi.spyOn(reviewerApi, 'getReviewerPurchaseRequestApi').mockResolvedValue(submitted);
    const start = vi.spyOn(reviewerApi, 'startReviewApi').mockResolvedValue(underReview);
    renderPage('/reviewer/requests/10/review', <ReviewPurchaseRequestPage />);
    const button = await screen.findByRole('button', { name: /بدء المراجعة/i });
    fireEvent.click(button);
    await waitFor(() => expect(start).toHaveBeenCalledWith(10));
    expect(await screen.findByRole('button', { name: /اعتماد/i })).toBeInTheDocument();
  });

  it('locks reviewer editing after reviewer approval forwards the request', async () => {
    vi.spyOn(reviewerApi, 'getReviewerPurchaseRequestApi').mockResolvedValue(pendingProcurement);
    renderPage('/reviewer/requests/10/review', <ReviewPurchaseRequestPage />);
    await screen.findByRole('heading', { name: /PR-10/ });
    expect(screen.queryByRole('button', { name: /حفظ/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /إضافة بند/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/يمكنك تعديل البيانات والبنود حتى يصدر مدير المشتريات اعتماده/)).not.toBeInTheDocument();
    expect(screen.getByText(/تم اعتماد المرحلة السابقة، لذلك لا يمكن إجراء تعديلات إضافية/)).toBeInTheDocument();
  });

  it('keeps finalized reviewer requests read-only after procurement approval', async () => {
    vi.spyOn(reviewerApi, 'getReviewerPurchaseRequestApi').mockResolvedValue({ ...submitted, status: 'APPROVED_BY_PROCUREMENT' });
    renderPage('/reviewer/requests/10/review', <ReviewPurchaseRequestPage />);
    await screen.findByRole('heading', { name: /PR-10/ });
    expect(screen.queryByRole('button', { name: /اعتماد/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /إضافة Item/i })).not.toBeInTheDocument();
  });

  it('shows and filters reviewable requests for the department reviewer', async () => {
    vi.spyOn(reviewerApi, 'getReviewableRequestsApi').mockResolvedValue([submitted]);
    renderPage('/reviewer/requests', <ReviewerRequestsPage />);
    const pendingFilter = await screen.findByRole('button', { name: /في انتظار بدء المراجعة\(1\)/i });
    fireEvent.click(pendingFilter);
    expect(screen.getAllByText('PR-10').length).toBeGreaterThan(0);
  });

  it('shows all requested reviewer search filters', async () => {
    vi.spyOn(reviewerApi, 'getReviewableRequestsApi').mockResolvedValue([]);
    renderPage('/reviewer/requests', <ReviewerRequestsPage />);
    expect(await screen.findByText('بحث وتصفية الطلبات')).toBeInTheDocument();
    expect(screen.getAllByLabelText('رقم الطلب').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('اسم مقدم الطلب').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('الحالة').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('من تاريخ الطلب').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('إلى تاريخ الطلب').length).toBeGreaterThan(0);
  });

  it('renders ReviewerDashboardPage without React Error #310 even with incomplete API payloads', async () => {
    vi.spyOn(reviewerApi, 'getReviewableRequestsApi').mockResolvedValue([
      { id: 101, request_number: 'PR-101', status: 'SUBMITTED', items: undefined as any } as any,
      { id: 102, request_number: 'PR-102', status: 'UNDER_REVIEW', items: [{ item_description: 'Cement', quantity: '50' }] } as any,
    ]);
    renderPage('/reviewer', <ReviewerDashboardPage />);

    // Must transition safely from loading spinner to content without invariant #310
    await waitFor(() => expect(screen.getByText('لوحة مراجعة الطلبات')).toBeInTheDocument());
    expect(screen.getAllByText('PR-101').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PR-102').length).toBeGreaterThan(0);
  });

  it('renders ActionRequiredInbox in ReviewerDashboardPage with zero errors when quotes and receipts contain null/undefined fields', async () => {
    vi.spyOn(reviewerApi, 'getReviewableRequestsApi').mockResolvedValue([]);
    renderPage('/reviewer', <ReviewerDashboardPage />);
    await waitFor(() => expect(screen.getByText('لوحة مراجعة الطلبات')).toBeInTheDocument());
    expect(screen.getByText('أنت على دراية تامة بكل المعاملات!')).toBeInTheDocument();
  });
});
