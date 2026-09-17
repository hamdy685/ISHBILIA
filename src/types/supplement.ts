import { PurchaseRequest, PurchaseRequestItem } from './purchaseRequest';
import { Supplier } from './purchaseOrder';
import { User } from './auth';
import { PurchaseOrder } from './purchaseOrder';

export type SupplementStatus = 'SUBMITTED' | 'REVIEWER_APPROVED' | 'PROCUREMENT_PROCESSED' | 'REJECTED';

export interface PurchaseRequestSupplement {
  id: number;
  purchase_request_id: number;
  batch_number: number;
  requested_by_user_id: number;
  reviewer_user_id?: number | null;
  reviewed_at?: string | null;
  procurement_user_id?: number | null;
  procurement_processed_at?: string | null;
  purchase_order_id?: number | null;
  supplier_id?: number | null;
  status: SupplementStatus;
  notes?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;

  // Relations
  items?: PurchaseRequestItem[];
  requester?: User;
  reviewer?: User;
  procurementManager?: User;
  supplier?: Supplier;
  purchaseOrder?: PurchaseOrder;
  purchase_request?: PurchaseRequest;
}

export interface CreateSupplementItemPayload {
  item_id?: number | null;
  item_description: string;
  quantity: number;
  uom?: string;
  estimated_unit_price?: number;
  item_reference?: string | null;
  region?: string | null;
  specifications?: string;
  notes?: string;
}

export interface CreateSupplementPayload {
  notes?: string;
  items: CreateSupplementItemPayload[];
}

export interface ProcessSupplementPricingItem {
  pr_item_id: number;
  unit_price: number;
}

export interface ProcessSupplementPayload {
  supplier_id: number;
  merge_to_existing_po?: boolean;
  notes?: string;
  items_pricing: ProcessSupplementPricingItem[];
}
