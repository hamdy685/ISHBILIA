import { PurchaseOrderItem } from './purchaseOrder';

export type ShipmentGroupStatus = 'PENDING_DELIVERY' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

export interface ShipmentGroup {
  id: number;
  group_number: string;
  purchase_order_id: number;
  supplier_id: number;
  group_name: string;
  status: ShipmentGroupStatus;
  vehicle_plate_number?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  notes?: string | null;
  created_by_user_id?: number | null;
  created_at?: string;
  updated_at?: string;
  items_count?: number;
  items?: PurchaseOrderItem[];
  supplier?: {
    id: number;
    company_name: string;
  };
  createdBy?: {
    id: number;
    name: string;
  };
}

export interface EligibleShipmentItem {
  id: number;
  item_description: string;
  quantity: number;
  uom: string;
  unit_price: number;
  line_total: number;
  region?: string | null;
  land_plot_number?: string | null;
  supplier_id: number;
}
