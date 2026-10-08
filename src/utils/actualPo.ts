import { PurchaseOrder, PurchaseOrderItem } from '../types/purchaseOrder';

/**
 * Determine if a purchase order is an Actual PO (or in the Actual PO finalization stage).
 */
export const isActualPurchaseOrder = (po?: PurchaseOrder | null): boolean => {
  if (!po) return false;
  if (po.is_actual_po) return true;
  if (po.finalized_at) return true;
  if (po.status === 'APPROVED_BY_ACCOUNTING' || po.status === 'FINAL_APPROVED') return true;
  if (po.status === 'PENDING_ACTUAL_PO') return true;
  if (po.receipts && po.receipts.some((r) => r.status === 'APPROVED')) return true;
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
  const approvedOrPendingReceipts = receipts.filter(
    (r) => r.status === 'APPROVED' || r.status === 'PENDING_SITE_ENGINEER'
  );

  const receiptItemMap = new Map<number, number>();
  let hasReceiptData = false;

  approvedOrPendingReceipts.forEach((r) => {
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

/**
 * Calculate dynamic subtotal and grand total for an Actual PO.
 * Can accept either a PurchaseOrder or a list of PurchaseOrderItem.
 */
export const calculateActualPoGrandTotal = (
  poOrItems?: PurchaseOrder | PurchaseOrderItem[] | null,
  fallbackGrandTotal?: string | number | null
): number => {
  if (!poOrItems) return 0;
  const items = Array.isArray(poOrItems) ? poOrItems : getActualPoLineItems(poOrItems);
  if (items.length === 0) {
    if (!Array.isArray(poOrItems) && poOrItems.grand_total) {
      return Number(poOrItems.grand_total) || 0;
    }
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
