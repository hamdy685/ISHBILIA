import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  PurchaseRequestTimeline,
  generateTimelineCards,
  getTimelineStepIndex,
  isDirectProcurement,
  isQuotesProcurement,
} from '../components/procurement/PurchaseRequestTimeline';
import { PurchaseRequest } from '../types/purchaseRequest';

const createBaseRequest = (overrides: Partial<PurchaseRequest> = {}): PurchaseRequest => ({
  id: 101,
  request_number: 'PR-2026-0001',
  user_id: 1,
  status: 'DRAFT',
  priority: 'NORMAL',
  procurement_route: 'DIRECT',
  total_estimated_cost: '50000.00',
  currency: 'EGP',
  created_at: '2026-09-19T10:00:00Z',
  updated_at: '2026-09-19T10:00:00Z',
  items: [
    {
      id: 1,
      purchase_request_id: 101,
      item_name: 'حديد تسليح 12 مم',
      quantity: 10,
      unit: 'طن',
      estimated_unit_price: '5000.00',
      total_estimated_price: '50000.00',
    } as any,
  ],
  ...overrides,
});

describe('PurchaseRequestTimeline Component & Business Logic', () => {
  describe('Route detection', () => {
    it('detects DIRECT route correctly', () => {
      const directReq = createBaseRequest({ procurement_route: 'DIRECT' });
      expect(isDirectProcurement(directReq)).toBe(true);
      expect(isQuotesProcurement(directReq)).toBe(false);
    });

    it('detects QUOTES route correctly', () => {
      const quotesReq = createBaseRequest({
        procurement_route: 'QUOTES',
        quotes: [{ id: 1, purchase_request_id: 101, supplier_id: 2 } as any],
      });
      expect(isDirectProcurement(quotesReq)).toBe(false);
      expect(isQuotesProcurement(quotesReq)).toBe(true);
    });
  });

  describe('Direct Procurement Route Card Mapping', () => {
    it('Card 1 is ACTIVE when status is DRAFT', () => {
      const req = createBaseRequest({ status: 'DRAFT' });
      const cards = generateTimelineCards(req);

      expect(cards).toHaveLength(9);
      expect(cards[0].id).toBe('step-1-create');
      expect(cards[0].state).toBe('ACTIVE');
      expect(cards[1].state).toBe('PENDING');
      expect(getTimelineStepIndex(req)).toBe(0);
    });

    it('Card 2 is ACTIVE in SUBMITTED or UNDER_REVIEW', () => {
      const reqSubmitted = createBaseRequest({ status: 'SUBMITTED' });
      const cardsSubmitted = generateTimelineCards(reqSubmitted);
      expect(cardsSubmitted[0].state).toBe('COMPLETED');
      expect(cardsSubmitted[1].state).toBe('ACTIVE');
      expect(cardsSubmitted[2].state).toBe('PENDING');
      expect(getTimelineStepIndex(reqSubmitted)).toBe(1);

      const reqUnderReview = createBaseRequest({ status: 'UNDER_REVIEW' });
      const cardsUnderReview = generateTimelineCards(reqUnderReview);
      expect(cardsUnderReview[1].state).toBe('ACTIVE');
      expect(getTimelineStepIndex(reqUnderReview)).toBe(1);
    });

    it('Card 5 is ACTIVE in PENDING_EXECUTIVE_APPROVAL for DIRECT route', () => {
      const req = createBaseRequest({
        status: 'PENDING_EXECUTIVE_APPROVAL',
        procurement_route: 'DIRECT',
      });
      const cards = generateTimelineCards(req);

      // Card 1, 2, 3, 4 completed
      expect(cards[0].state).toBe('COMPLETED');
      expect(cards[1].state).toBe('COMPLETED');
      expect(cards[2].state).toBe('COMPLETED');
      expect(cards[3].state).toBe('COMPLETED');
      // Card 5 (GM direct pricing review) is ACTIVE
      expect(cards[4].id).toBe('step-5-direct-exec');
      expect(cards[4].state).toBe('ACTIVE');
      expect(cards[5].state).toBe('PENDING');
      expect(getTimelineStepIndex(req)).toBe(4);
    });

    it('Card 6 is ACTIVE in PENDING_ACCOUNTING_APPROVAL for DIRECT route', () => {
      const req = createBaseRequest({
        status: 'PENDING_ACCOUNTING_APPROVAL',
        procurement_route: 'DIRECT',
      });
      const cards = generateTimelineCards(req);

      expect(cards[4].state).toBe('COMPLETED');
      expect(cards[5].id).toBe('step-6-direct-accounting');
      expect(cards[5].state).toBe('ACTIVE');
      expect(cards[6].state).toBe('PENDING');
      expect(getTimelineStepIndex(req)).toBe(5);
    });

    it('Card 7 (PO issue) is ACTIVE in APPROVED_BY_ACCOUNTING for DIRECT route', () => {
      const req = createBaseRequest({
        status: 'APPROVED_BY_ACCOUNTING',
        procurement_route: 'DIRECT',
      });
      const cards = generateTimelineCards(req);

      expect(cards[5].state).toBe('COMPLETED');
      expect(cards[6].id).toBe('step-7-po-issue');
      expect(cards[6].state).toBe('ACTIVE');
      expect(cards[7].state).toBe('PENDING');
      expect(getTimelineStepIndex(req)).toBe(6);
    });

    it('Card 8 is ACTIVE when PO is issued', () => {
      const req = createBaseRequest({
        status: 'APPROVED_BY_ACCOUNTING',
        procurement_route: 'DIRECT',
        issued_purchase_orders_count: 1,
        purchase_order_issued: true,
      });
      const cards = generateTimelineCards(req);

      expect(cards[6].state).toBe('COMPLETED');
      expect(cards[7].id).toBe('step-8-receipt-inspection');
      expect(cards[7].state).toBe('ACTIVE');
      expect(cards[8].state).toBe('PENDING');
    });

    it('Card 9 is ACTIVE when receipt is approved and COMPLETED when accounting processed', () => {
      const reqApprovedReceipt = createBaseRequest({
        status: 'APPROVED_BY_ACCOUNTING',
        procurement_route: 'DIRECT',
        purchase_orders: [
          { id: 50, has_approved_receipt: true, status: 'ISSUED' },
        ] as any,
      });
      const cardsApproved = generateTimelineCards(reqApprovedReceipt);
      expect(cardsApproved[7].state).toBe('COMPLETED');
      expect(cardsApproved[8].id).toBe('step-9-finance-close');
      expect(cardsApproved[8].state).toBe('ACTIVE');

      const reqCompleted = createBaseRequest({
        status: 'ACCOUNTING_PROCESSED',
        procurement_route: 'DIRECT',
        purchase_orders: [
          { id: 50, has_approved_receipt: true, is_paid: true, status: 'FINAL_APPROVED' },
        ] as any,
      });
      const cardsCompleted = generateTimelineCards(reqCompleted);
      expect(cardsCompleted[8].state).toBe('COMPLETED');
    });
  });

  describe('Quotes Procurement Route Card Mapping', () => {
    it('Card 5a and 5b are ACTIVE in parallel during PENDING_QUOTE_RECOMMENDATIONS when none recommended', () => {
      const req = createBaseRequest({
        status: 'PENDING_QUOTE_RECOMMENDATIONS',
        procurement_route: 'QUOTES',
        quotes: [
          {
            id: 1,
            purchase_request_id: 101,
            supplier_id: 10,
            recommendations: [],
          } as any,
        ],
      });
      const cards = generateTimelineCards(req);

      expect(cards).toHaveLength(10); // 1, 2, 3, 4, 5-أ, 5-ب, 6, 7, 8, 9
      const card5a = cards.find((c) => c.id === 'step-5a-quote-accounting');
      const card5b = cards.find((c) => c.id === 'step-5b-quote-dept');

      expect(card5a?.state).toBe('ACTIVE');
      expect(card5b?.state).toBe('ACTIVE');
      expect(card5a?.stepLabel).toBe('5-أ');
      expect(card5b?.stepLabel).toBe('5-ب');
    });

    it('Card 5a is COMPLETED and 5b remains ACTIVE once accounting has recommended', () => {
      const req = createBaseRequest({
        status: 'PENDING_QUOTE_RECOMMENDATIONS',
        procurement_route: 'QUOTES',
        quotes: [
          {
            id: 1,
            purchase_request_id: 101,
            supplier_id: 10,
            recommendations: [
              { id: 1, role_type: 'ACCOUNTING', decision: 'RECOMMEND' },
            ],
          } as any,
        ],
      });
      const cards = generateTimelineCards(req);

      const card5a = cards.find((c) => c.id === 'step-5a-quote-accounting');
      const card5b = cards.find((c) => c.id === 'step-5b-quote-dept');

      expect(card5a?.state).toBe('COMPLETED');
      expect(card5b?.state).toBe('ACTIVE');
    });

    it('Card 6 is ACTIVE in PENDING_EXECUTIVE_QUOTE_DECISION', () => {
      const req = createBaseRequest({
        status: 'PENDING_EXECUTIVE_QUOTE_DECISION',
        procurement_route: 'QUOTES',
        quotes: [
          {
            id: 1,
            recommendations: [
              { id: 1, role_type: 'ACCOUNTING', decision: 'RECOMMEND' },
              { id: 2, role_type: 'DEPARTMENT', decision: 'RECOMMEND' },
            ],
          } as any,
        ],
      });
      const cards = generateTimelineCards(req);

      const card5a = cards.find((c) => c.id === 'step-5a-quote-accounting');
      const card5b = cards.find((c) => c.id === 'step-5b-quote-dept');
      const card6 = cards.find((c) => c.id === 'step-6-quote-decision');

      expect(card5a?.state).toBe('COMPLETED');
      expect(card5b?.state).toBe('COMPLETED');
      expect(card6?.state).toBe('ACTIVE');
      expect(card6?.title).toContain('الترسية واختيار العرض الفائز');
    });
  });

  describe('REJECTED State Handling', () => {
    it('handles REJECTED status cleanly', () => {
      const req = createBaseRequest({
        status: 'REJECTED',
        rejection_reason: 'الميزانية غير كافية حالياً',
      });
      const cards = generateTimelineCards(req);

      expect(getTimelineStepIndex(req)).toBe(-1);
      expect(cards.some((c) => c.state === 'REJECTED' || c.state === 'COMPLETED')).toBe(true);
    });
  });

  describe('UI Rendering & Aesthetics', () => {
    it('renders all dynamic cards with titles, roles, and badges', () => {
      const req = createBaseRequest({
        status: 'PENDING_ACCOUNTING_APPROVAL',
        procurement_route: 'DIRECT',
      });

      render(<PurchaseRequestTimeline request={req} />);

      expect(screen.getByText('خارطة تتبع المعاملة (Workflow Pipeline)')).toBeInTheDocument();
      expect(screen.getByText('المراجعة والاعتماد المالي')).toBeInTheDocument();
      expect(screen.getByText('بانتظار الموافقة المالية 🔵')).toBeInTheDocument();
      expect(screen.getByText('مسار الشراء المباشر')).toBeInTheDocument();
    });

    it('renders compact mode correctly without description clutter', () => {
      const req = createBaseRequest({ status: 'DRAFT' });
      render(<PurchaseRequestTimeline request={req} compact={true} />);

      expect(screen.getByText('إنشاء الطلب')).toBeInTheDocument();
      expect(screen.queryByText('تسجيل مسودة الطلب وتحديد الأصناف والكميات وتاريخ الاحتياج.')).toBeNull();
    });
  });
});
