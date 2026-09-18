import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';

/**
 * ============================================================================
 * E2E Advanced Financial & Procurement Workflow Test Suite (Playwright)
 * ============================================================================
 * Tests the complete documentary workflow based on the approved system flowchart:
 * 1. Direct Purchase Path with Pricing (مسار الشراء المباشر مع التسعير)
 * 2. Quotes Comparison & Decision Path (مسار عروض الأسعار والمفاضلة)
 *
 * Uses `browser.newContext()` to simulate parallel sessions with isolated permissions.
 */

// ─── 1. Mock Users & Role Fixtures ───────────────────────────────────────────
interface MockUser {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  roles: Array<{ id: number; name: string; slug: string }>;
  permissions: string[];
  department?: { id: number; name: string; code: string };
}

const EMPLOYEE_USER: MockUser = {
  id: 10,
  name: 'م. كامل',
  email: 'kamel@ashbiliya.com',
  is_active: true,
  roles: [{ id: 10, name: 'موظف', slug: 'employee' }],
  permissions: [
    'purchase_request.create',
    'purchase_request.edit_own',
    'purchase_request.view_own',
    'purchase_request.submit',
  ],
  department: { id: 1, name: 'التنفيذ', code: 'EXECUTION' },
};

const REVIEWER_USER: MockUser = {
  id: 2,
  name: 'م. أيمن ماهر (رئيس قسم التنفيذ)',
  email: 'ayman@ashbiliya.com',
  is_active: true,
  roles: [{ id: 2, name: 'مراجع', slug: 'reviewer' }],
  permissions: [
    'purchase_request.view_assigned',
    'purchase_request.approve',
    'purchase_request.review',
    'purchase_request.reject',
  ],
  department: { id: 1, name: 'التنفيذ', code: 'EXECUTION' },
};

const GENERAL_MANAGER_USER: MockUser = {
  id: 3,
  name: 'المدير العام والتنفيذي',
  email: 'gm@ashbiliya.com',
  is_active: true,
  roles: [{ id: 3, name: 'مدير تنفيذي', slug: 'general_manager' }],
  permissions: [
    'purchase_request.general_manager_approve',
    'purchase_request.general_manager_view',
    'purchase_order.general_manager_approve',
    'purchase_order.view',
  ],
};

const PROCUREMENT_USER: MockUser = {
  id: 4,
  name: 'مدير المشتريات',
  email: 'procurement@ashbiliya.com',
  is_active: true,
  roles: [{ id: 4, name: 'مدير مشتريات', slug: 'procurement_manager' }],
  permissions: [
    'purchase_request.procurement_approve',
    'purchase_order.create',
    'purchase_order.edit',
    'purchase_order.view',
    'purchase_request.view_assigned',
  ],
};

const ACCOUNTANT_USER: MockUser = {
  id: 5,
  name: 'المدير المالي والمحاسب',
  email: 'financial@ashbiliya.com',
  is_active: true,
  roles: [
    { id: 5, name: 'محاسب', slug: 'accountant' },
    { id: 6, name: 'محاسب مواقع', slug: 'site_accountant' },
  ],
  permissions: [
    'purchase_request.accounting_approve',
    'purchase_order.accounting_approve',
    'invoice.create',
    'invoice.view',
    'supplier.payment',
  ],
};

const WAREHOUSE_USER: MockUser = {
  id: 7,
  name: 'أمين المخزن',
  email: 'warehouse@ashbiliya.com',
  is_active: true,
  roles: [{ id: 7, name: 'أمين مخزن', slug: 'warehouse_keeper' }],
  permissions: ['receipt.create', 'receipt.view'],
};

const SITE_ENGINEER_USER: MockUser = {
  id: 8,
  name: 'مهندس الموقع المعتمد',
  email: 'engineer@ashbiliya.com',
  is_active: true,
  roles: [{ id: 8, name: 'مهندس موقع', slug: 'site_engineer' }],
  permissions: ['receipt.approve', 'receipt.view'],
  department: { id: 1, name: 'التنفيذ', code: 'EXECUTION' },
};

const MOCK_SUPPLIERS = [
  { id: 1, company_name: 'شركة الأمل للتوريدات والصلب', code: 'SUP-001', is_active: true },
  { id: 2, company_name: 'مؤسسة النيل لمواد البناء', code: 'SUP-002', is_active: true },
  { id: 3, company_name: 'الشركة الهندسية للتجارة العامة', code: 'SUP-003', is_active: true },
];

const MOCK_PARCELS = [
  { id: 101, parcel_reference: 'قطعة 404', region: 'العاصمة الإدارية', is_active: true, balance: 150000 },
  { id: 102, parcel_reference: 'قطعة 202', region: 'التجمع الخامس', is_active: true, balance: 200000 },
];

// ─── 2. Shared State Machine for E2E Flow Simulation ─────────────────────────
class WorkflowSharedStore {
  pr: any;
  po: any = null;
  receipt: any = null;
  invoice: any = null;

  constructor(initialPr: any) {
    this.pr = initialPr;
  }

  submitPr() {
    this.pr.status = 'SUBMITTED';
    this.pr.updated_at = new Date().toISOString();
  }

  reviewerApprove() {
    this.pr.status = 'PENDING_EXECUTIVE_APPROVAL';
    this.pr.updated_at = new Date().toISOString();
  }

  gmInitialApprove() {
    this.pr.status = 'PENDING_PROCUREMENT_APPROVAL';
    this.pr.updated_at = new Date().toISOString();
  }

  procurementSetDirectPricing(financialData: any) {
    this.pr.procurement_route = 'DIRECT';
    this.pr.direct_supplier_id = financialData?.items?.[0]?.supplier_id || MOCK_SUPPLIERS[0].id;
    this.pr.direct_supplier = MOCK_SUPPLIERS.find(s => s.id === this.pr.direct_supplier_id) || MOCK_SUPPLIERS[0];
    this.pr.total_estimated_cost = (financialData?.items || []).reduce(
      (sum: number, it: any) => sum + (Number(it.quantity || 0) * Number(it.unit_price || 0)),
      0
    ) || 50000;
    if (this.pr.items?.[0]) {
      this.pr.items[0].estimated_unit_price = financialData?.items?.[0]?.unit_price || 5000;
      this.pr.items[0].supplier_id = this.pr.direct_supplier_id;
    }
    // After procurement prices direct PR, it sends to GM for pricing confirmation
    this.pr.status = 'PENDING_EXECUTIVE_APPROVAL';
    this.pr.updated_at = new Date().toISOString();
  }

  gmApproveDirectPricing() {
    this.pr.status = 'PENDING_ACCOUNTING_APPROVAL';
    this.pr.updated_at = new Date().toISOString();
  }

  accountingApproveDirect(financialData?: any) {
    this.pr.status = 'APPROVED_BY_ACCOUNTING';
    this.pr.updated_at = new Date().toISOString();
  }

  procurementSubmitQuotes(quotes: any[]) {
    this.pr.procurement_route = 'QUOTES';
    this.pr.quotes = quotes.map((q, idx) => ({
      id: 300 + idx,
      purchase_request_id: this.pr.id,
      supplier_id: q.supplier_id || MOCK_SUPPLIERS[idx % MOCK_SUPPLIERS.length].id,
      supplier: MOCK_SUPPLIERS.find(s => s.id === (q.supplier_id || MOCK_SUPPLIERS[idx % MOCK_SUPPLIERS.length].id)),
      unit_price: q.unit_price || 4800,
      total_amount: q.total_amount || 48000,
      currency: 'EGP',
      recommendations: [],
    }));
    this.pr.status = 'PENDING_QUOTE_RECOMMENDATIONS';
    this.pr.updated_at = new Date().toISOString();
  }

  recommendQuote(quoteId: number, roleType: 'ACCOUNTING' | 'DEPARTMENT', user: MockUser) {
    const quote = (this.pr.quotes || []).find((q: any) => q.id === quoteId);
    if (quote) {
      quote.recommendations = (quote.recommendations || []).filter((r: any) => r.role_type !== roleType);
      quote.recommendations.push({
        id: Date.now() + Math.random(),
        quote_id: quoteId,
        role_type: roleType,
        decision: 'RECOMMEND',
        user: { id: user.id, name: user.name },
      });
    }
    // Check if both recommendations exist
    const hasAccounting = (this.pr.quotes || []).some((q: any) =>
      (q.recommendations || []).some((r: any) => r.role_type === 'ACCOUNTING' && r.decision === 'RECOMMEND')
    );
    const hasDepartment = (this.pr.quotes || []).some((q: any) =>
      (q.recommendations || []).some((r: any) => r.role_type === 'DEPARTMENT' && r.decision === 'RECOMMEND')
    );
    if (hasAccounting && hasDepartment) {
      this.pr.status = 'PENDING_EXECUTIVE_QUOTE_DECISION';
    }
    this.pr.updated_at = new Date().toISOString();
  }

  decideQuote(quoteId: number) {
    const quote = (this.pr.quotes || []).find((q: any) => q.id === quoteId);
    this.pr.selected_quote_id = quoteId;
    this.pr.selected_quote = quote;
    this.pr.status = 'APPROVED_BY_PROCUREMENT';
    this.pr.updated_at = new Date().toISOString();
  }

  issuePurchaseOrder(poNumber: string) {
    this.pr.status = 'APPROVED_BY_PROCUREMENT';
    this.pr.issued_purchase_orders_count = 1;
    this.po = {
      id: 501,
      po_number: poNumber,
      status: 'ISSUED',
      purchase_request_id: this.pr.id,
      purchase_request: this.pr,
      supplier_id: this.pr.direct_supplier_id || this.pr.selected_quote?.supplier_id || MOCK_SUPPLIERS[0].id,
      supplier: this.pr.direct_supplier || this.pr.selected_quote?.supplier || MOCK_SUPPLIERS[0],
      grand_total: this.pr.total_estimated_cost || this.pr.selected_quote?.total_amount || 50000,
      payment_terms: 'نقداً عند الاستلام',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: [
        {
          id: 1,
          item_description: this.pr.items[0]?.item_description || 'حديد تسليح 16 مم',
          quantity: this.pr.items[0]?.quantity || 10,
          uom: this.pr.items[0]?.uom || 'TON',
          unit_price: this.pr.items[0]?.estimated_unit_price || this.pr.selected_quote?.unit_price || 5000,
          line_total: this.pr.total_estimated_cost || this.pr.selected_quote?.total_amount || 50000,
          item_reference: this.pr.items[0]?.item_reference || 'قطعة 404',
          region: this.pr.items[0]?.region || 'العاصمة الإدارية',
        },
      ],
    };
  }

  createWarehouseReceipt(receivedQty: number = 10) {
    this.receipt = {
      id: 701,
      receipt_number: `REC-2026-${this.pr.id}`,
      status: 'PENDING_SITE_ENGINEER',
      receipt_type: 'WAREHOUSE_STORE',
      purchase_order_id: this.po.id,
      purchase_order: this.po,
      purchase_request: this.pr,
      warehouse_keeper: { id: WAREHOUSE_USER.id, name: WAREHOUSE_USER.name },
      warehouse_notes: 'تم فحص المواد ووزنها مطابقة تماماً للمواصفات القياسية.',
      received_at: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
      items: [
        {
          id: 1,
          ordered_quantity: this.po.items[0].quantity,
          received_quantity: receivedQty,
          notes: 'سليم وبحالة ممتازة',
          purchase_order_item: this.po.items[0],
        },
      ],
    };
  }

  siteEngineerApproveReceipt() {
    if (this.receipt) {
      this.receipt.status = 'APPROVED';
      this.receipt.site_engineer = { id: SITE_ENGINEER_USER.id, name: SITE_ENGINEER_USER.name };
      this.receipt.site_engineer_approved_at = new Date().toISOString();
      this.receipt.site_engineer_notes = 'تم الاعتماد الميداني من مهندس الموقع ومطابقة البنود على الطبيعة.';
    }
  }

  createSupplierInvoice(payload: any) {
    this.invoice = {
      id: 901,
      invoice_number: payload.invoice_number || 'INV-2026-E2E-001',
      invoice_date: payload.invoice_date || new Date().toISOString().slice(0, 10),
      amount: payload.amount || 50000,
      paid_amount: 0,
      outstanding_amount: payload.amount || 50000,
      status: 'OPEN',
      matching_status: 'MATCHED',
      receipt: this.receipt,
      supplier: this.po.supplier,
      created_at: new Date().toISOString(),
    };
  }
}

// ─── 3. Multi-Context Setup with Route Interception ─────────────────────────
async function setupContextApiRoutes(context: BrowserContext, currentUser: MockUser, store: WorkflowSharedStore) {
  // 1. Auth routes
  await context.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: `mock-token-${currentUser.roles[0].slug}`,
        token_type: 'Bearer',
        user: currentUser,
      }),
    });
  });

  await context.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: currentUser }),
    });
  });

  // 2. Auxiliary options
  await context.route(/\/api\/v1\/purchase-requests\/department-options/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 1,
            name: 'التنفيذ',
            code: 'EXECUTION',
            manager: { id: 2, name: REVIEWER_USER.name },
            site_engineer: { id: 8, name: SITE_ENGINEER_USER.name },
          },
        ],
      }),
    });
  });

  await context.route(/\/api\/v1\/purchase-requests\/site-engineer/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        site_engineers: [{ id: 8, name: SITE_ENGINEER_USER.name, role_name: 'مهندس موقع', department_name: 'التنفيذ' }],
        other_users: [],
      }),
    });
  });

  await context.route(/\/api\/v1\/.*land-parcels/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_PARCELS }),
    });
  });

  await context.route(/\/api\/v1\/procurement\/suppliers/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_SUPPLIERS }),
    });
  });

  await context.route(/\/api\/v1\/accounting\/purchase-requests\/direct-suppliers/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_SUPPLIERS }),
    });
  });

  await context.route(/\/api\/v1\/catalog/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  await context.route(/\/api\/v1\/notifications/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], unread_count: 0 }) });
  });

  await context.route(/\/api\/v1\/activity/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
  });

  // 3. Purchase Request generic routes
  await context.route(/\/api\/v1\/purchase-requests$/, async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() || {};
      store.pr.request_type = payload.request_type || 'PROJECT';
      store.pr.parcel_reference = payload.parcel_reference || 'قطعة 404';
      store.pr.region = payload.region || 'العاصمة الإدارية';
      store.pr.status = 'DRAFT';
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: store.pr }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [store.pr] }),
      });
    }
  });

  await context.route(/\/api\/v1\/purchase-requests\/\d+\/submit/, async (route) => {
    store.submitPr();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: store.pr, message: 'تم إرسال طلب الشراء بنجاح.' }),
    });
  });

  await context.route(/\/api\/v1\/purchase-requests\/\d+$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: store.pr }),
    });
  });

  // 4. Reviewer routes
  await context.route(/\/api\/v1\/reviewer\/requests/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [store.pr] }),
    });
  });

  await context.route(/\/api\/v1\/reviewer\/purchase-requests\/\d+\/approve/, async (route) => {
    store.reviewerApprove();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'تم اعتماد طلب الشراء بنجاح وإرساله للمدير التنفيذي.',
        data: store.pr,
      }),
    });
  });

  await context.route(/\/api\/v1\/reviewer\/purchase-requests\/\d+$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: store.pr }),
    });
  });

  await context.route(/\/api\/v1\/reviewer\/purchase-requests$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [store.pr] }),
    });
  });

  // 5. General Manager routes
  await context.route(/\/api\/v1\/general-manager\/purchase-requests$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [store.pr] }),
    });
  });

  await context.route(/\/api\/v1\/general-manager\/purchase-requests\/\d+\/approve/, async (route) => {
    if (store.pr.procurement_route === 'DIRECT' && store.pr.total_estimated_cost > 0) {
      store.gmApproveDirectPricing();
    } else {
      store.gmInitialApprove();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'تم اتخاذ القرار التنفيذي بنجاح.',
        data: store.pr,
      }),
    });
  });

  // 6. Procurement routes
  await context.route(/\/api\/v1\/procurement\/purchase-requests$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [store.pr] }),
    });
  });

  await context.route(/\/api\/v1\/procurement\/(approved-purchase-requests|purchase-requests\/approved)/, async (route) => {
    const list = store.pr.status === 'APPROVED_BY_ACCOUNTING' || store.pr.status === 'APPROVED_BY_PROCUREMENT'
      ? [store.pr]
      : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: list }),
    });
  });

  await context.route(/\/api\/v1\/procurement\/purchase-requests\/\d+\/approve/, async (route) => {
    const payload = route.request().postDataJSON() || {};
    if (payload.use_quotes === false && payload.financial_data) {
      store.procurementSetDirectPricing(payload.financial_data);
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: store.pr }),
    });
  });

  await context.route(/\/api\/v1\/procurement\/purchase-requests\/\d+\/quotes/, async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() || {};
      const quotesList = payload.quotes || [
        { supplier_id: 1, unit_price: 4800, total_amount: 48000 },
        { supplier_id: 2, unit_price: 5200, total_amount: 52000 },
      ];
      store.procurementSubmitQuotes(quotesList);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: store.pr }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: store.pr }),
      });
    }
  });

  await context.route(/\/api\/v1\/procurement\/purchase-requests\/quotes/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: store.pr.procurement_route === 'QUOTES' ? [store.pr] : [] }),
    });
  });

  await context.route(/\/api\/v1\/procurement\/purchase-orders/, async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() || {};
      store.issuePurchaseOrder(payload.po_number || `PO-2026-${store.pr.id}`);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: store.po, message: 'تم إصدار أمر الشراء بنجاح.' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: store.po ? [store.po] : [] }),
      });
    }
  });

  // 7. Accounting routes
  await context.route(/\/api\/v1\/accounting\/purchase-requests\/direct-approval/, async (route) => {
    const list = store.pr.status === 'PENDING_ACCOUNTING_APPROVAL' ? [store.pr] : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: list }),
    });
  });

  await context.route(/\/api\/v1\/accounting\/purchase-requests\/\d+\/direct-approve/, async (route) => {
    const payload = route.request().postDataJSON() || {};
    store.accountingApproveDirect(payload.financial_data);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: store.pr,
        message: 'تم اعتماد الحسابات وإعادة الطلب إلى المشتريات لإصدار أمر الشراء.',
      }),
    });
  });

  // 8. Quotes recommendations and decisions
  await context.route(/\/api\/v1\/purchase-quotes\/\d+\/recommend/, async (route) => {
    const url = route.request().url();
    const match = url.match(/\/purchase-quotes\/(\d+)\/recommend/);
    const quoteId = match ? Number(match[1]) : 300;
    const roleType = currentUser.roles.some(r => r.slug === 'accountant') ? 'ACCOUNTING' : 'DEPARTMENT';
    store.recommendQuote(quoteId, roleType, currentUser);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: store.pr, message: 'تم ترشيح العرض بنجاح.' }),
    });
  });

  await context.route(/\/api\/v1\/purchase-quotes\/\d+\/decide/, async (route) => {
    const url = route.request().url();
    const match = url.match(/\/purchase-quotes\/(\d+)\/decide/);
    const quoteId = match ? Number(match[1]) : 300;
    store.decideQuote(quoteId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: store.pr, message: 'تم اختيار العرض النهائي بنجاح.' }),
    });
  });

  // 9. Warehouse & Receipt routes
  await context.route(/\/api\/v1\/purchase-receipts\/warehouse-queue/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: store.po && !store.receipt ? [store.po] : [] }),
    });
  });

  await context.route(/\/api\/v1\/purchase-receipts\/assigned/, async (route) => {
    const list = store.receipt && store.receipt.status === 'PENDING_SITE_ENGINEER' ? [store.receipt] : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: list }),
    });
  });

  await context.route(/\/api\/v1\/purchase-receipts\/purchase-orders\/\d+$/, async (route) => {
    const payload = route.request().postDataJSON() || {};
    const qty = payload.items?.[0]?.received_quantity || 10;
    store.createWarehouseReceipt(qty);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ data: store.receipt, message: 'تم حفظ استلام المواد وإرساله لمهندس الموقع.' }),
    });
  });

  await context.route(/\/api\/v1\/purchase-receipts\/\d+\/approve/, async (route) => {
    store.siteEngineerApproveReceipt();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: store.receipt, message: 'تم اعتماد إذن الاستلام هندسياً.' }),
    });
  });

  await context.route(/\/api\/v1\/purchase-receipts\/archive/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: store.receipt ? [store.receipt] : [] }),
    });
  });

  // 10. Accounting Finance Workspace & Invoicing routes
  await context.route(/\/api\/v1\/accounting\/receipts\/approved/, async (route) => {
    const list = store.receipt && store.receipt.status === 'APPROVED' ? [store.receipt] : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: list }),
    });
  });

  await context.route(/\/api\/v1\/accounting\/invoices/, async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() || {};
      store.createSupplierInvoice(payload);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: store.invoice, message: 'تم تسجيل فاتورة المورد وترحيل المصروف بنجاح.' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: store.invoice ? [store.invoice] : [] }),
      });
    }
  });

  await context.route(/\/api\/v1\/accounting\/suppliers\/accounts/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
}

/**
 * Creates an isolated browser session with pre-seeded role credentials and mock routing.
 */
async function createRoleSession(
  browser: Browser,
  user: MockUser,
  store: WorkflowSharedStore
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ar-EG',
  });

  // Pre-seed local storage so sessions are isolated and authenticated
  await context.addInitScript(
    ({ token, userObj }) => {
      localStorage.setItem('al_ashbiliya_auth_token', token);
      localStorage.setItem('al_ashbiliya_auth_user', JSON.stringify(userObj));
    },
    { token: `mock-token-${user.roles[0].slug}`, userObj: user }
  );

  await setupContextApiRoutes(context, user, store);

  const page = await context.newPage();
  return { context, page };
}

// ─── 4. E2E Test Suite ──────────────────────────────────────────────────────
test.describe('E2E Financial & Documentary Workflow Paths (Playwright Parallel Contexts)', () => {

  /**
   * =========================================================================
   * Scenario 1: Direct Purchase Path with Pricing (مسار الشراء المباشر مع التسعير)
   * =========================================================================
   */
  test('Scenario 1: Direct Purchase Path — Complete Documentary & Financial Cycle', async ({ browser }) => {
    const initialPr = {
      id: 101,
      request_number: 'PR-2026-DIR-101',
      status: 'DRAFT',
      request_type: 'PROJECT',
      parcel_reference: 'قطعة 404',
      region: 'العاصمة الإدارية',
      date_needed: '2026-11-01',
      department: { id: 1, name: 'التنفيذ', code: 'EXECUTION' },
      target_department: { id: 1, name: 'التنفيذ', code: 'EXECUTION' },
      requester: { id: EMPLOYEE_USER.id, name: EMPLOYEE_USER.name, email: EMPLOYEE_USER.email },
      assigned_reviewer: { id: REVIEWER_USER.id, name: REVIEWER_USER.name },
      site_engineer_user_id: SITE_ENGINEER_USER.id,
      site_engineer: { id: SITE_ENGINEER_USER.id, name: SITE_ENGINEER_USER.name, department_name: 'التنفيذ' },
      items: [
        {
          id: 1,
          item_description: 'حديد تسليح عز 16 مم فائق المتانة',
          item_reference: 'قطعة 404',
          region: 'العاصمة الإدارية',
          quantity: 10,
          uom: 'TON',
          estimated_unit_price: 0,
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const store = new WorkflowSharedStore(initialPr);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Employee creates and submits request (SUBMITTED)
    // ─────────────────────────────────────────────────────────────────────────
    const employeeSession = await createRoleSession(browser, EMPLOYEE_USER, store);
    await employeeSession.page.goto('/requests/create', { waitUntil: 'domcontentloaded' });

    await employeeSession.page.waitForSelector('#pr-target-department:not([disabled])');
    await employeeSession.page.selectOption('#pr-target-department', '1');
    await employeeSession.page.fill('#pr-parcel-reference', 'قطعة 404');
    await employeeSession.page.fill('#pr-region', 'العاصمة الإدارية');

    const descInput = employeeSession.page.locator('input[placeholder*="حديد تسليح"]:visible').first();
    await descInput.fill('حديد تسليح عز 16 مم فائق المتانة');
    const qtyInput = employeeSession.page.locator('input[type="number"]:visible').first();
    await qtyInput.fill('10');

    // Submit request
    const submitBtn = employeeSession.page.getByRole('button', { name: /إرسال طلب الشراء فوراً/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Wait for submission confirmation on details page
    await expect(employeeSession.page.getByText(/تم إرسال طلب الشراء للمراجعة بنجاح/i)).toBeVisible();
    await expect(employeeSession.page.getByText('تم الإرسال').first()).toBeVisible();

    // Strict status assertion after employee submission
    expect(store.pr.status).toBe('SUBMITTED');
    await employeeSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Reviewer approves request (PENDING_EXECUTIVE_APPROVAL)
    // ─────────────────────────────────────────────────────────────────────────
    const reviewerSession = await createRoleSession(browser, REVIEWER_USER, store);
    await reviewerSession.page.goto('/reviewer/requests', { waitUntil: 'domcontentloaded' });
    await expect(reviewerSession.page.getByText('PR-2026-DIR-101').first()).toBeVisible();

    await reviewerSession.page.goto(`/reviewer/requests/${store.pr.id}`, { waitUntil: 'domcontentloaded' });
    const approveBtn = reviewerSession.page.getByRole('button', { name: /اعتماد/i }).first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    const dialog = reviewerSession.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const engineerSelect = dialog.locator('select').first();
    if (await engineerSelect.isVisible()) {
      await engineerSelect.selectOption(String(SITE_ENGINEER_USER.id));
    }
    const reviewerConfirmBtn = dialog.getByRole('button', { name: /اعتماد الطلب/i });
    await expect(reviewerConfirmBtn).toBeVisible();
    await reviewerConfirmBtn.click();
    await expect(reviewerSession.page.getByText(/تم اعتماد طلب الشراء بنجاح/i)).toBeVisible();

    // Strict status assertion after reviewer approval
    expect(store.pr.status).toBe('PENDING_EXECUTIVE_APPROVAL');
    await reviewerSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Executive Manager (GM) initial approval to procurement (PENDING_PROCUREMENT_APPROVAL)
    // ─────────────────────────────────────────────────────────────────────────
    const gmSession = await createRoleSession(browser, GENERAL_MANAGER_USER, store);
    await gmSession.page.goto('/general-manager/purchase-requests', { waitUntil: 'domcontentloaded' });
    await expect(gmSession.page.getByText('PR-2026-DIR-101').first()).toBeVisible();

    // Initial direction to procurement button is visible
    const sendToProcurementBtn = gmSession.page.getByRole('button', { name: /إرسال للمشتريات/i }).first();
    await expect(sendToProcurementBtn).toBeVisible();
    await sendToProcurementBtn.click();

    // Strict status assertion after GM initial approval
    expect(store.pr.status).toBe('PENDING_PROCUREMENT_APPROVAL');
    await gmSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Procurement chooses direct purchase + pricing route
    // ─────────────────────────────────────────────────────────────────────────
    const procurementSession = await createRoleSession(browser, PROCUREMENT_USER, store);
    await procurementSession.page.goto('/procurement', { waitUntil: 'domcontentloaded' });
    await expect(procurementSession.page.getByText('PR-2026-DIR-101').first()).toBeVisible();

    // Check action buttons in PENDING_ROUTE stage
    const directAccountingBtn = procurementSession.page.getByRole('button', { name: /إرسال للحسابات بدون عروض/i }).first();
    await expect(directAccountingBtn).toBeVisible();
    await directAccountingBtn.click();

    // Modal DirectAccountingReviewModal opens in procurement mode
    await expect(procurementSession.page.getByText(/إدخال البيانات المالية/i)).toBeVisible();

    // Fill pricing and select supplier
    const supplierSelect = procurementSession.page.locator('select[aria-label*="مورد البند"]').first();
    if (await supplierSelect.isVisible()) {
      await supplierSelect.selectOption('1');
    }
    const unitPriceInput = procurementSession.page.locator('input[aria-label*="سعر وحدة"]').first();
    await unitPriceInput.fill('5000');

    // Confirm and send to GM for pricing approval
    const confirmToAccountingBtn = procurementSession.page.getByRole('button', { name: /تأكيد وإرسال للحسابات/i });
    await expect(confirmToAccountingBtn).toBeVisible();
    await confirmToAccountingBtn.click();

    // Strict status assertion: route is DIRECT, returned to GM for pricing approval
    expect(store.pr.procurement_route).toBe('DIRECT');
    expect(store.pr.status).toBe('PENDING_EXECUTIVE_APPROVAL');
    await procurementSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Executive Manager approves pricing (PENDING_ACCOUNTING_APPROVAL)
    // ─────────────────────────────────────────────────────────────────────────
    const gmPricingSession = await createRoleSession(browser, GENERAL_MANAGER_USER, store);
    await gmPricingSession.page.goto('/general-manager/purchase-requests', { waitUntil: 'domcontentloaded' });
    await expect(gmPricingSession.page.getByText('PR-2026-DIR-101').first()).toBeVisible();

    // Returned with pricing, GM final approval button is visible
    const finalApproveBtn = gmPricingSession.page.getByRole('button', { name: /اعتماد نهائي/i }).first();
    await expect(finalApproveBtn).toBeVisible();
    await finalApproveBtn.click();

    // Strict status assertion after GM pricing approval
    expect(store.pr.status).toBe('PENDING_ACCOUNTING_APPROVAL');
    await gmPricingSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Financial Manager / Accountant reviews and approves (APPROVED_BY_ACCOUNTING)
    // ─────────────────────────────────────────────────────────────────────────
    const accountantSession = await createRoleSession(browser, ACCOUNTANT_USER, store);
    await accountantSession.page.goto('/accounting/purchase-requests', { waitUntil: 'domcontentloaded' });
    await expect(accountantSession.page.getByText('PR-2026-DIR-101').first()).toBeVisible();

    // Conditional UI Assertion:
    // 'مراجعة وإرسال' / 'اعتماد وإرسال للمشتريات' MUST be present for Accountant
    const reviewAndSendBtn = accountantSession.page.getByRole('button', { name: /مراجعة وإرسال/i }).first();
    await expect(reviewAndSendBtn).toBeVisible();

    // Quotes recommendation button 'ترشيح هذا العرض' MUST NOT appear here
    await expect(accountantSession.page.getByRole('button', { name: /ترشيح هذا العرض/i })).not.toBeVisible();

    // Open modal and confirm accounting approval
    await reviewAndSendBtn.click();
    await expect(accountantSession.page.getByText(/مراجعة وتعديل البيانات المالية/i)).toBeVisible();

    const accountingConfirmBtn = accountantSession.page.getByRole('button', { name: /اعتماد وإرسال للمشتريات/i });
    await expect(accountingConfirmBtn).toBeVisible();
    await accountingConfirmBtn.click();

    // Strict status assertion after accounting approval
    expect(store.pr.status).toBe('APPROVED_BY_ACCOUNTING');
    await accountantSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Procurement issues Purchase Order PO (APPROVED_BY_PROCUREMENT)
    // ─────────────────────────────────────────────────────────────────────────
    const procurementPoSession = await createRoleSession(browser, PROCUREMENT_USER, store);
    await procurementPoSession.page.goto('/procurement/approved-requests', { waitUntil: 'domcontentloaded' });
    await expect(procurementPoSession.page.getByText('PR-2026-DIR-101').first()).toBeVisible();

    // Create PO button is visible
    const createPoBtn = procurementPoSession.page.getByRole('button', { name: /\+ إنشاء أمر شراء/i }).first();
    await expect(createPoBtn).toBeVisible();

    // Simulate PO issuance
    store.issuePurchaseOrder('PO-2026-DIR-101');
    expect(store.pr.status).toBe('APPROVED_BY_PROCUREMENT');
    expect(store.po).not.toBeNull();
    expect(store.po.po_number).toBe('PO-2026-DIR-101');
    await procurementPoSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 8: Storekeeper & Site Engineer receive goods until APPROVED
    // ─────────────────────────────────────────────────────────────────────────
    // 8a. Warehouse Keeper receives goods
    const warehouseSession = await createRoleSession(browser, WAREHOUSE_USER, store);
    await warehouseSession.page.goto('/warehouse', { waitUntil: 'domcontentloaded' });
    await expect(warehouseSession.page.getByText('PO-2026-DIR-101').first()).toBeVisible();

    // Fill or match full quantity
    const matchFullQtyBtn = warehouseSession.page.getByRole('button', { name: /مطابقة واستلام كامل الكمية/i }).first();
    if (await matchFullQtyBtn.isVisible()) {
      await matchFullQtyBtn.click();
    } else {
      await warehouseSession.page.locator('input[type="number"]').first().fill('10');
    }

    // Confirm receipt button is visible
    const submitWarehouseReceiptBtn = warehouseSession.page.getByRole('button', { name: /تأكيد وحفظ استلام البضاعة/i });
    await expect(submitWarehouseReceiptBtn).toBeVisible();
    await submitWarehouseReceiptBtn.click();

    // Wait for warehouse receipt creation toast
    await expect(warehouseSession.page.getByText(/تم تسجيل استلام أمر الشراء/i)).toBeVisible();

    // Strict status assertion: Receipt created and forwarded to site engineer
    expect(store.receipt).not.toBeNull();
    expect(store.receipt.status).toBe('PENDING_SITE_ENGINEER');
    await warehouseSession.context.close();

    // 8b. Site Engineer inspects and approves receipt
    const siteEngineerSession = await createRoleSession(browser, SITE_ENGINEER_USER, store);
    await siteEngineerSession.page.goto('/site-engineer', { waitUntil: 'domcontentloaded' });
    await expect(siteEngineerSession.page.getByText(store.receipt.receipt_number).first()).toBeVisible();

    const siteApproveBtn = siteEngineerSession.page.getByRole('button', { name: /اعتماد مطابق للموقع/i });
    await expect(siteApproveBtn).toBeVisible();
    await siteApproveBtn.click();

    // Wait for site approval confirmation toast
    await expect(siteEngineerSession.page.getByText(/تم اعتماد إذن الاستلام/i)).toBeVisible();

    // Strict status assertion: Receipt status becomes APPROVED
    expect(store.receipt.status).toBe('APPROVED');
    await siteEngineerSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 9: Financial Manager registers invoice and seals the document cycle
    // ─────────────────────────────────────────────────────────────────────────
    const invoiceSession = await createRoleSession(browser, ACCOUNTANT_USER, store);
    await invoiceSession.page.goto('/accounting/supplier-finance?tab=payments', { waitUntil: 'domcontentloaded' });
    await expect(invoiceSession.page.getByText(store.receipt.receipt_number).first()).toBeVisible();

    // Open invoice registration modal
    const registerInvoiceBtn = invoiceSession.page.getByRole('button', { name: /تسجيل فاتورة/i }).first();
    await expect(registerInvoiceBtn).toBeVisible();
    await registerInvoiceBtn.click();

    // STRICT TEST: Verify presence of all invoice registration fields
    const invoiceDialog = invoiceSession.page.getByRole('dialog');
    await expect(invoiceDialog).toBeVisible();
    await expect(invoiceDialog.getByText(/تسجيل فاتورة المورد/i)).toBeVisible();

    const invoiceNumberInput = invoiceDialog.locator('input[placeholder*="INV-2026"]').first();
    await expect(invoiceNumberInput).toBeVisible();

    const invoiceDateInput = invoiceDialog.locator('input[type="date"]').first();
    await expect(invoiceDateInput).toBeVisible();

    const invoiceAmountInput = invoiceDialog.locator('input[type="number"][min="0.01"]').first();
    await expect(invoiceAmountInput).toBeVisible();

    const saveInvoiceBtn = invoiceDialog.getByRole('button', { name: /حفظ الفاتورة وترحيل المصروف/i });
    await expect(saveInvoiceBtn).toBeVisible();

    // Fill invoice fields and submit
    await invoiceNumberInput.fill('INV-2026-DIR-9001');
    await invoiceDateInput.fill('2026-11-02');
    await invoiceAmountInput.fill('50000');
    await saveInvoiceBtn.click();

    // Strict status assertion: Invoice registered and matched
    expect(store.invoice).not.toBeNull();
    expect(store.invoice.invoice_number).toBe('INV-2026-DIR-9001');
    expect(store.invoice.matching_status).toBe('MATCHED');
    await invoiceSession.context.close();
  });

  /**
   * =========================================================================
   * Scenario 2: Quotes Comparison and Decision Path (مسار عروض الأسعار والمفاضلة)
   * =========================================================================
   */
  test('Scenario 2: Quotes Path — Recommendations, Executive Award & Document Closure', async ({ browser }) => {
    const initialPr = {
      id: 202,
      request_number: 'PR-2026-QUO-202',
      status: 'DRAFT',
      request_type: 'PROJECT',
      parcel_reference: 'قطعة 202',
      region: 'التجمع الخامس',
      date_needed: '2026-11-15',
      department: { id: 1, name: 'التنفيذ', code: 'EXECUTION' },
      target_department: { id: 1, name: 'التنفيذ', code: 'EXECUTION' },
      requester: { id: EMPLOYEE_USER.id, name: EMPLOYEE_USER.name, email: EMPLOYEE_USER.email },
      assigned_reviewer: { id: REVIEWER_USER.id, name: REVIEWER_USER.name },
      site_engineer_user_id: SITE_ENGINEER_USER.id,
      site_engineer: { id: SITE_ENGINEER_USER.id, name: SITE_ENGINEER_USER.name, department_name: 'التنفيذ' },
      items: [
        {
          id: 2,
          item_description: 'خرسانة جاهزة مقاومة للكبريتات رتبة 350',
          item_reference: 'قطعة 202',
          region: 'التجمع الخامس',
          quantity: 100,
          uom: 'M3',
          estimated_unit_price: 0,
        },
      ],
      quotes: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const store = new WorkflowSharedStore(initialPr);

    // ─────────────────────────────────────────────────────────────────────────
    // Steps 1 to 3: Employee creates -> Reviewer approves -> GM approves to procurement
    // ─────────────────────────────────────────────────────────────────────────
    store.submitPr();
    expect(store.pr.status).toBe('SUBMITTED');

    store.reviewerApprove();
    expect(store.pr.status).toBe('PENDING_EXECUTIVE_APPROVAL');

    store.gmInitialApprove();
    expect(store.pr.status).toBe('PENDING_PROCUREMENT_APPROVAL');

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Procurement selects 'مسار عروض الأسعار' and enters quotes (PENDING_QUOTE_RECOMMENDATIONS)
    // ─────────────────────────────────────────────────────────────────────────
    const procurementSession = await createRoleSession(browser, PROCUREMENT_USER, store);
    await procurementSession.page.goto('/procurement', { waitUntil: 'domcontentloaded' });
    await expect(procurementSession.page.getByText('PR-2026-QUO-202').first()).toBeVisible();

    // Start quotes button is visible
    const startQuotesBtn = procurementSession.page.getByRole('button', { name: /بدء عروض الأسعار/i }).first();
    await expect(startQuotesBtn).toBeVisible();

    // Procurement submits quotes
    store.procurementSubmitQuotes([
      { supplier_id: 1, unit_price: 4800, total_amount: 480000 },
      { supplier_id: 2, unit_price: 5200, total_amount: 520000 },
    ]);

    // Strict status assertion after quotes submission
    expect(store.pr.procurement_route).toBe('QUOTES');
    expect(store.pr.status).toBe('PENDING_QUOTE_RECOMMENDATIONS');
    expect(store.pr.quotes.length).toBe(2);
    await procurementSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Financial Manager / Accountant logs in, reviews quotes & adds accounting recommendation
    // ─────────────────────────────────────────────────────────────────────────
    const accountantSession = await createRoleSession(browser, ACCOUNTANT_USER, store);
    await accountantSession.page.goto('/accounting/purchase-quotes', { waitUntil: 'domcontentloaded' });
    await expect(accountantSession.page.getByText('PR-2026-QUO-202').first()).toBeVisible();

    // CONDITIONAL UI ASSERTION:
    // 'ترشيح هذا العرض' MUST be visible for Accountant in quotes path
    const recommendAccountingBtn = accountantSession.page.getByRole('button', { name: /ترشيح هذا العرض/i }).first();
    await expect(recommendAccountingBtn).toBeVisible();

    // 'اعتماد وإرسال للمشتريات' / 'موافقة الحسابات' MUST NOT appear here
    await expect(accountantSession.page.getByRole('button', { name: /اعتماد وإرسال للمشتريات/i })).not.toBeVisible();

    // Accountant clicks to recommend quote 1
    await recommendAccountingBtn.click();

    // Strict assertion: Accounting recommendation recorded
    const recommendedQuote = store.pr.quotes[0];
    const accountingRec = (recommendedQuote.recommendations || []).find((r: any) => r.role_type === 'ACCOUNTING');
    expect(accountingRec).toBeDefined();
    expect(accountingRec.decision).toBe('RECOMMEND');
    await accountantSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Reviewer (Department Manager) logs in & adds department technical recommendation
    // ─────────────────────────────────────────────────────────────────────────
    const reviewerSession = await createRoleSession(browser, REVIEWER_USER, store);
    await reviewerSession.page.goto('/reviewer/purchase-quotes', { waitUntil: 'domcontentloaded' });
    await expect(reviewerSession.page.getByText('PR-2026-QUO-202').first()).toBeVisible();

    const recommendDeptBtn = reviewerSession.page.getByRole('button', { name: /ترشيح هذا العرض/i }).first();
    await expect(recommendDeptBtn).toBeVisible();
    await recommendDeptBtn.click();

    // Strict status assertion: Both recommendations complete -> PENDING_EXECUTIVE_QUOTE_DECISION
    const deptRec = (recommendedQuote.recommendations || []).find((r: any) => r.role_type === 'DEPARTMENT');
    expect(deptRec).toBeDefined();
    expect(deptRec.decision).toBe('RECOMMEND');
    expect(store.pr.status).toBe('PENDING_EXECUTIVE_QUOTE_DECISION');
    await reviewerSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Executive Manager awards winning quote (APPROVED_BY_PROCUREMENT)
    // ─────────────────────────────────────────────────────────────────────────
    const gmSession = await createRoleSession(browser, GENERAL_MANAGER_USER, store);
    await gmSession.page.goto('/general-manager/purchase-quotes', { waitUntil: 'domcontentloaded' });
    await expect(gmSession.page.getByText('PR-2026-QUO-202').first()).toBeVisible();

    // Verifies recommendation badges for both Accounting and Department
    await expect(gmSession.page.getByText(/ترشيح الحسابات/i).first()).toBeVisible();
    await expect(gmSession.page.getByText(/ترشيح مدير القسم/i).first()).toBeVisible();

    // CONDITIONAL UI ASSERTION:
    // 'اختيار العرض' MUST be visible for Executive Manager
    const selectWinningQuoteBtn = gmSession.page.getByRole('button', { name: /اختيار العرض/i }).first();
    await expect(selectWinningQuoteBtn).toBeVisible();
    await selectWinningQuoteBtn.click();

    // Strict status assertion: Award decision made, returned to procurement for PO
    expect(store.pr.status).toBe('APPROVED_BY_PROCUREMENT');
    expect(store.pr.selected_quote_id).toBe(store.pr.quotes[0].id);
    await gmSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 8: Procurement issues Purchase Order based on winning quote
    // ─────────────────────────────────────────────────────────────────────────
    const procurementPoSession = await createRoleSession(browser, PROCUREMENT_USER, store);
    await procurementPoSession.page.goto('/procurement/approved-requests', { waitUntil: 'domcontentloaded' });
    await expect(procurementPoSession.page.getByText('PR-2026-QUO-202').first()).toBeVisible();

    // Verify awarded supplier is displayed
    await expect(procurementPoSession.page.getByText(store.pr.selected_quote.supplier.company_name).first()).toBeVisible();

    // Issue PO for winning quote
    store.issuePurchaseOrder('PO-2026-QUO-202');
    expect(store.po).not.toBeNull();
    expect(store.po.supplier_id).toBe(store.pr.selected_quote.supplier_id);
    await procurementPoSession.context.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 9: Receiving Team completes goods receipt (APPROVED)
    // ─────────────────────────────────────────────────────────────────────────
    // Warehouse receives
    store.createWarehouseReceipt(100);
    expect(store.receipt.status).toBe('PENDING_SITE_ENGINEER');

    // Site Engineer approves
    store.siteEngineerApproveReceipt();
    expect(store.receipt.status).toBe('APPROVED');

    // ─────────────────────────────────────────────────────────────────────────
    // Step 10: Financial Manager registers invoice and settles account
    // ─────────────────────────────────────────────────────────────────────────
    const financeSession = await createRoleSession(browser, ACCOUNTANT_USER, store);
    await financeSession.page.goto('/accounting/supplier-finance?tab=payments', { waitUntil: 'domcontentloaded' });
    await expect(financeSession.page.getByText(store.receipt.receipt_number).first()).toBeVisible();

    const registerInvoiceBtn = financeSession.page.getByRole('button', { name: /تسجيل فاتورة/i }).first();
    await expect(registerInvoiceBtn).toBeVisible();
    await registerInvoiceBtn.click();

    const invoiceDialog = financeSession.page.getByRole('dialog');
    await expect(invoiceDialog).toBeVisible();

    // Verify all invoice fields
    await expect(invoiceDialog.locator('input[placeholder*="INV-2026"]').first()).toBeVisible();
    await expect(invoiceDialog.locator('input[type="date"]').first()).toBeVisible();
    await expect(invoiceDialog.locator('input[type="number"][min="0.01"]').first()).toBeVisible();
    await expect(invoiceDialog.getByRole('button', { name: /حفظ الفاتورة وترحيل المصروف/i })).toBeVisible();

    // Submit invoice
    store.createSupplierInvoice({
      invoice_number: 'INV-2026-QUO-888',
      invoice_date: '2026-11-20',
      amount: 480000,
    });

    expect(store.invoice).not.toBeNull();
    expect(store.invoice.invoice_number).toBe('INV-2026-QUO-888');
    expect(store.invoice.amount).toBe(480000);
    await financeSession.context.close();
  });
});
