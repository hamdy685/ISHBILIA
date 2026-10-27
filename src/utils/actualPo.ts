import { PurchaseOrder, PurchaseOrderItem } from '../types/purchaseOrder';

export type ActualPoDiscountType = 'NONE' | 'TOTAL' | 'SELECTED_ITEMS';

/**
 * Determine if a purchase order is an Actual PO (or in the Actual PO finalization stage).
 */
export const isActualPurchaseOrder = (po?: PurchaseOrder | null): boolean => {
  if (!po) return false;
  if (po.is_actual_po) return true;
  if (po.finalized_at) return true;
  if (po.status === 'APPROVED_BY_ACCOUNTING' || po.status === 'FINAL_APPROVED') return true;
  return false;
};

/**
 * Filter and resolve line items strictly for an Actual Purchase Order.
 * Excludes delayed/unreceived items from the Master PO, ensuring that only
 * items actually received and approved at the site appear in views and printouts.
 */
export const getActualPoLineItems = (po?: PurchaseOrder | null): PurchaseOrderItem[] => {
  if (!po || !po.items || po.items.length === 0) return [];

  // If not an Actual PO, return items as is (excluding zero quantities)
  if (!isActualPurchaseOrder(po)) {
    return po.items.filter((item) => (Number(item.quantity) || 0) > 0);
  }

  // Look for linked receipts to know actual delivered quantities
  const receipts = po.receipts || [];
  const approvedReceipts = receipts.filter(
    (r) => r.status === 'APPROVED'
  );

  const receiptItemMap = new Map<number, number>();
  let hasReceiptData = false;

  approvedReceipts.forEach((r) => {
    r.items?.forEach((ri) => {
      if (ri.purchase_order_item_id) {
        hasReceiptData = true;
        const currentQty = receiptItemMap.get(ri.purchase_order_item_id) || 0;
        receiptItemMap.set(ri.purchase_order_item_id, currentQty + Number(ri.received_quantity || 0));
      }
    });
  });

  return po.items
    .filter((item) => {
      const itemQty = Number(item.quantity) || 0;
      if (itemQty <= 0) return false;

      // If receipt data exists, check if this item was tracked and received
      if (hasReceiptData && item.id) {
        if (receiptItemMap.has(item.id)) {
          const receivedQty = receiptItemMap.get(item.id) || 0;
          return receivedQty > 0;
        }
        // If not in the receipt at all and receipts exist, it wasn't delivered in this GRN
        return false;
      }

      return true;
    })
    .map((item) => {
      // If receipt specifies received_quantity, adapt it to the actual delivered quantity
      if (hasReceiptData && item.id && receiptItemMap.has(item.id)) {
        const receivedQty = receiptItemMap.get(item.id)!;
        const unitPrice = Number(item.unit_price) || 0;
        const lineTotal = Math.round(receivedQty * unitPrice * 100) / 100;
        return {
          ...item,
          quantity: String(receivedQty),
          line_total: String(lineTotal),
          actual_quantity: String(receivedQty),
          actual_line_total: String(lineTotal),
        };
      }
      return item;
    });
};

export interface ActualPoTotals {
  subtotal: number;
  discountType: 'NONE' | 'TOTAL' | 'SELECTED_ITEMS';
  discountPercentage: number;
  targetedSubtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
}

export interface CalculateActualPoFinancialsOptions {
  items: Array<{ quantity?: string | number; unit_price?: string | number; line_total?: string | number; is_discount_applied?: boolean }>;
  discountType?: ActualPoDiscountType;
  discountPercentage?: number;
  taxAmount?: number;
}

/**
 * Calculate accurate dynamic financials for an Actual PO.
 * Supports both options object or positional arguments.
 */
export function calculateActualPoFinancials(
  itemsOrOptions: Array<{ quantity?: string | number; unit_price?: string | number; line_total?: string | number; is_discount_applied?: boolean }> | CalculateActualPoFinancialsOptions,
  discountTypeArg: ActualPoDiscountType = 'NONE',
  discountPercentageArg: number = 0,
  taxAmountArg: number = 0
): ActualPoTotals & { targetedCount: number } {
  let itemsList: Array<{ quantity?: string | number; unit_price?: string | number; line_total?: string | number; is_discount_applied?: boolean }> = [];
  let discountType: ActualPoDiscountType = 'NONE';
  let discountPercentage = 0;
  let taxAmount = 0;

  if (Array.isArray(itemsOrOptions)) {
    itemsList = itemsOrOptions;
    discountType = discountTypeArg;
    discountPercentage = discountPercentageArg;
    taxAmount = taxAmountArg;
  } else if (itemsOrOptions && typeof itemsOrOptions === 'object') {
    itemsList = Array.isArray(itemsOrOptions.items) ? itemsOrOptions.items : [];
    discountType = itemsOrOptions.discountType || 'NONE';
    discountPercentage = Number(itemsOrOptions.discountPercentage) || 0;
    taxAmount = Number(itemsOrOptions.taxAmount) || 0;
  }

  let subtotal = 0;
  let targetedSubtotal = 0;
  let targetedCount = 0;

  itemsList.forEach((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    const line = Math.round(qty * price * 100) / 100;
    subtotal += line;
    if (item.is_discount_applied) {
      targetedSubtotal += line;
      targetedCount += 1;
    }
  });

  subtotal = Math.round(subtotal * 100) / 100;
  targetedSubtotal = Math.round(targetedSubtotal * 100) / 100;

  const validPct = Math.max(0, Math.min(100, Number(discountPercentage) || 0));
  let discountAmount = 0;

  if (discountType === 'TOTAL' && validPct > 0) {
    discountAmount = Math.round(subtotal * (validPct / 100) * 100) / 100;
  } else if (discountType === 'SELECTED_ITEMS' && validPct > 0) {
    discountAmount = Math.round(targetedSubtotal * (validPct / 100) * 100) / 100;
  }

  const grandTotal = Math.max(0, Math.round((subtotal - discountAmount + taxAmount) * 100) / 100);

  return {
    subtotal,
    discountType,
    discountPercentage: validPct,
    targetedSubtotal,
    targetedCount,
    discountAmount,
    taxAmount,
    grandTotal,
  };
}

/**
 * Calculate dynamic subtotal and grand total for an Actual PO.
 * Can accept either a PurchaseOrder or a list of PurchaseOrderItem.
 */
export const calculateActualPoGrandTotal = (
  poOrItems?: PurchaseOrder | PurchaseOrderItem[] | null,
  fallbackGrandTotal?: string | number | null
): number => {
  if (!poOrItems) return 0;
  if (!Array.isArray(poOrItems)) {
    const po = poOrItems;
    if (po.grand_total !== undefined && po.grand_total !== null && Number(po.grand_total) > 0) {
      return Number(po.grand_total);
    }
    const items = getActualPoLineItems(po);
    const discType = po.discount_type || 'NONE';
    const discPct = Number(po.discount_percentage) || 0;
    const tax = Number(po.tax_amount) || 0;
    return calculateActualPoFinancials(items, discType, discPct, tax).grandTotal;
  }

  const items = poOrItems;
  if (items.length === 0) {
    return Number(fallbackGrandTotal) || 0;
  }
  const calculated = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    const line = Number(item.line_total) || Math.round(qty * price * 100) / 100;
    return sum + line;
  }, 0);

  return Math.round(calculated * 100) / 100;
};
