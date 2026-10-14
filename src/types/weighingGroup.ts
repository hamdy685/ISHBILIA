export interface WeighingGroupItem {
  id: number;
  weighing_group_id: number;
  purchase_order_item_id: number;
  item_description: string;
  size_or_diameter?: string | null;
  ordered_weight: number;
  received_weight?: number | null;
  uom: string;
  unit_price: number;
  line_total: number;
  region?: string | null;
  land_plot_number?: string | null;
  purpose?: string | null;
  purchase_order_item?: any;
}

export interface WeighingGroup {
  id: number;
  group_number: string;
  purchase_order_id: number;
  supplier_id: number;
  group_type: string;
  status: 'PENDING_RECEIPT' | 'RECEIVED' | 'CANCELLED';
  total_ordered_weight: number;
  total_received_weight?: number | null;
  weight_difference?: number | null;
  uom: string;
  unit_price?: number | null;
  total_amount?: number | null;
  scale_ticket_photo?: string | null;
  notes?: string | null;
  receiver_notes?: string | null;
  created_by_user_id?: number | null;
  received_by_user_id?: number | null;
  received_at?: string | null;
  created_at: string;
  updated_at: string;
  items?: WeighingGroupItem[];
  supplier?: {
    id: number;
    name?: string;
    company_name?: string;
  };
  purchase_order?: any;
}

export interface EligibleSteelItem {
  id: number;
  item_description: string;
  size_or_diameter: string;
  quantity: number;
  uom: string;
  weight_in_tons: number;
  unit_price: number;
  line_total: number;
  supplier_id: number;
  supplier_name: string;
  region?: string | null;
  land_plot_number?: string | null;
  purpose?: string | null;
}
