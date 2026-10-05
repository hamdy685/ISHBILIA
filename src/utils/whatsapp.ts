import { formatCleanNumber } from './numberFormat';

export interface WhatsAppReceiptData {
  receipt_number?: string | null;
  received_at?: string | null;
  amount?: number | string | null;
  purchase_order?: {
    po_number?: string | null;
    supplier?: {
      company_name?: string | null;
      phone?: string | null;
    } | null;
    purchase_request?: {
      department?: {
        name?: string | null;
      } | null;
    } | null;
    items?: Array<{
      item_name?: string | null;
      item_description?: string | null;
      quantity?: number | string | null;
      actual_quantity?: number | string | null;
      uom?: string | null;
      unit_price?: number | string | null;
      line_total?: number | string | null;
      item_reference?: string | null;
      region?: string | null;
    }>;
  } | null;
  items?: Array<{
    received_quantity?: number | string | null;
    purchase_order_item?: {
      item_name?: string | null;
      item_description?: string | null;
      uom?: string | null;
      unit_price?: number | string | null;
      line_total?: number | string | null;
      item_reference?: string | null;
      region?: string | null;
    } | null;
  }>;
}

export const buildReceiptWhatsAppText = (receipt: WhatsAppReceiptData, totalValue?: number): string => {
  const po = receipt.purchase_order;
  const supplierName = po?.supplier?.company_name || 'غير محدد';
  const deptName = po?.purchase_request?.department?.name || 'مشتريات المشروعات';
  const receivedDate = receipt.received_at ? String(receipt.received_at).slice(0, 10) : '—';

  let linesOfItems: string[] = [];
  if (receipt.items && receipt.items.length > 0) {
    linesOfItems = receipt.items.map((it, idx) => {
      const desc = it.purchase_order_item?.item_name || it.purchase_order_item?.item_description || 'صنف';
      const qty = it.received_quantity ?? '—';
      const uom = it.purchase_order_item?.uom || '';
      const price = Number(it.purchase_order_item?.unit_price || 0);
      const total = price > 0 ? Math.round(Number(qty) * price * 100) / 100 : null;
      const ref = it.purchase_order_item?.item_reference ? ` (قطعة: ${it.purchase_order_item.item_reference})` : '';
      return `🔹 ${idx + 1}. *${desc}*${ref}\n   الكمية المستلمة: ${qty} ${uom}${price > 0 ? ` | السعر: ${formatCleanNumber(price)} ج.م` : ''}${total ? ` | الإجمالي: ${formatCleanNumber(total)} ج.م` : ''}`;
    });
  } else if (po?.items && po.items.length > 0) {
    linesOfItems = po.items.map((poi, idx) => {
      const desc = poi.item_name || poi.item_description || 'صنف';
      const qty = poi.actual_quantity ?? poi.quantity ?? '—';
      const uom = poi.uom || '';
      const price = Number(poi.unit_price || 0);
      const total = price > 0 ? Math.round(Number(qty) * price * 100) / 100 : null;
      const ref = poi.item_reference ? ` (قطعة: ${poi.item_reference})` : '';
      return `🔹 ${idx + 1}. *${desc}*${ref}\n   الكمية: ${qty} ${uom}${price > 0 ? ` | السعر: ${formatCleanNumber(price)} ج.م` : ''}${total ? ` | الإجمالي: ${formatCleanNumber(total)} ج.م` : ''}`;
    });
  }

  const finalTotal = totalValue ?? Number(receipt.amount || 0);

  const messageSections = [
    '🏢 *شركة إشبيلية للتطوير العقاري والمقاولات*',
    '📋 *بيان إذن استلام معتمد ومطابقة التوريد الميداني*',
    '─────────────────────────',
    `📥 *رقم إذن الاستلام:* ${receipt.receipt_number || '—'}`,
    `📦 *رقم أمر الشراء الفعلي:* ${po?.po_number || '—'}`,
    `🏬 *المورد:* ${supplierName}`,
    `🏗️ *القسم / المشروع:* ${deptName}`,
    `📅 *تاريخ الاستلام الفعلي:* ${receivedDate}`,
    '─────────────────────────',
    '📦 *بيان البنود والكميات المستلمة في الموقع:*',
    ...linesOfItems,
    '─────────────────────────',
    finalTotal > 0 ? `💰 *القيمة الإجمالية الفعلية:* ${formatCleanNumber(finalTotal)} ج.م` : '',
    '─────────────────────────',
    '✅ *المعاملة تم فحصها واعتمادها بالموقع وجاهزة للمطابقة والتسجيل.*',
  ].filter(Boolean);

  return messageSections.join('\n');
};

export const shareReceiptOnWhatsApp = (receipt: WhatsAppReceiptData, totalValue?: number, overridePhone?: string) => {
  const text = buildReceiptWhatsAppText(receipt, totalValue);
  const rawPhone = overridePhone || receipt.purchase_order?.supplier?.phone || '';
  const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
  const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
};
