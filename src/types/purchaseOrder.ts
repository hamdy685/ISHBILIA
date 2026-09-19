export type PurchaseOrderStatus =
  | 'PO_DRAFT'
  | 'ISSUED'
  | 'PENDING_ACCOUNTING_REVIEW'
  | 'RETURNED_TO_PROCUREMENT'
  | 'APPROVED_BY_ACCOUNTING'
  | 'FINAL_APPROVED'
  | 'REJECTED';

export interface المورد {
  id: number;
  code?: string | null;
  company_name: string;
  contact_person?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  opening_balance?: string | number | null;
  opening_balance_notes?: string | null;
  is_active: boolean;
  notes?: string | null;
  tax_number?: string | null;
  commercial_register?: string | null;
  purchase_orders?: Array<{
    id: number;
    po_number: string;
    status: string;
    grand_total: string;
    created_at: string;
  }>;
}

export type Supplier = المورد;

export interface PurchaseOrderItem {
  id: number;
  pr_item_id?: number | null;
  item_name?: string | null;
  pr_item_quantity?: string | null;
  item_id?: number | null;
  item?: {
    id: number;
    name: string;
    sku: string;
  } | null;
  item_description: string;
  item_reference?: string | null;
  region?: string | null;
  quantity: string;
  uom?: string | null;
  unit_price: string;
  line_total: string;
  specifications?: string | null;
  is_supplementary?: boolean;
  supplement_batch?: number | null;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  purchase_request_id?: number | null;
  purchase_request?: {
    id: number;
    request_number: string;
    request_type?: 'PROJECT' | 'OFFICE_SUPPLIES';
    status: string;
    requester?: {
      id: number;
      name: string;
      email?: string;
    };
    assigned_reviewer?: {
      id: number;
      name: string;
      email?: string;
    } | null;
    site_engineer?: {
      id: number;
      name: string;
      email?: string;
    } | null;
    date_needed?: string | null;
    notes?: string | null;
    department?: {
      id: number;
      name: string;
      code?: string;
    };
    items?: Array<{
      id: number;
      item_description: string;
      quantity: string;
      uom?: string;
      specifications?: string;
    }>;
  };
  requested_by?: {
    id: number;
    name: string;
    email?: string;
  } | null;
  department_approver?: {
    id: number;
    name: string;
    email?: string;
  } | null;
  executive_approver?: {
    id: number;
    name: string;
    email?: string;
  } | null;
  department?: {
    id: number;
    name: string;
    code?: string;
  } | null;
  supplier_id: number;
  supplier?: المورد;
  created_by?: {
    id: number;
    name: string;
    email?: string;
  };
  accounting_reviewer?: {
    id: number;
    name: string;
    email?: string;
  };
  status: PurchaseOrderStatus;
  /** Always 'EGP' — Egyptian Pound */
  currency: string;
  subtotal: string;
  grand_total: string;
  payment_terms?: string | null;
  delivery_terms?: string | null;
  delivery_date?: string | null;
  delivery_status?: 'NOT_STARTED' | 'PARTIAL' | 'COMPLETE' | 'LATE' | string;
  actual_delivery_date?: string | null;
  delivery_notes?: string | null;
  budget_code?: string | null;
  financial_notes?: string | null;
  notes?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  items?: PurchaseOrderItem[];
  receipts?: LinkedReceiptSummary[];
  approval_history?: Array<{
    action: string;
    from_state: string;
    to_state: string;
    comments?: string | null;
    created_at?: string | null;
    actor?: {
      id: number;
      name: string;
    } | null;
  }>;
}

export interface LinkedReceiptItem {
  id: number;
  purchase_order_item_id?: number | null;
  ordered_quantity: string | number;
  received_quantity: string | number;
  notes?: string | null;
  purchase_order_item?: {
    id: number;
    item_description: string;
    item_name?: string | null;
    uom?: string | null;
    unit_price?: string | number;
  } | null;
}

export interface LinkedReceiptSummary {
  id: number;
  receipt_number: string;
  receipt_type?: string | null;
  status: string;
  received_at?: string | null;
  warehouse_submitted_at?: string | null;
  site_engineer_approved_at?: string | null;
  warehouse_notes?: string | null;
  site_engineer_notes?: string | null;
  receiver_notes?: string | null;
  photo_url?: string | null;
  photo_name?: string | null;
  warehouse_keeper?: { id: number; name: string } | null;
  site_engineer?: { id: number; name: string } | null;
  receiver?: { id: number; name: string } | null;
  items?: LinkedReceiptItem[];
}

export interface PurchaseOrderPayload {
  purchase_request_id?: number;
  supplier_id?: number;
  one_time_supplier_name?: string;
  payment_terms?: string;
  delivery_terms?: string;
  delivery_date?: string;
  budget_code?: string;
  financial_notes?: string;
  notes?: string;
  items?: Array<{
    pr_item_id?: number;
    item_id?: number | null;
    item_description?: string;
    item_reference?: string;
    region?: string;
    quantity?: number;
    uom?: string;
    unit_price?: number;
    specifications?: string;
  }>;
}

export interface PurchaseOrderItemPayload {
  item_id?: number | null;
  item_description: string;
  item_reference?: string;
  region?: string;
  quantity: number | string;
  uom?: string;
  unit_price: number | string;
  specifications?: string;
}
