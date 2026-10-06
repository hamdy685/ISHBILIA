import { getUnitLabel } from './units';
import { formatRebarDisplay } from './rebar';

export interface SummaryItem {
  item_description?: string | null;
  item_name?: string | null;
  item?: { name?: string | null } | null;
  item_reference?: string | null;
  region?: string | null;
  quantity?: number | string | null;
  ordered_quantity?: number | string | null;
  received_quantity?: number | string | null;
  uom?: string | null;
  specifications?: string | null;
  purchase_order_item?: SummaryItem | null;
  pr_item?: SummaryItem | null;
}

export interface SummaryRequest {
  request_type?: string | null;
  parcel_reference?: string | null;
  region?: string | null;
  items?: SummaryItem[] | null;
  purchase_request?: SummaryRequest | null;
  purchase_order?: {
    purchase_request?: SummaryRequest | null;
    items?: SummaryItem[] | null;
  } | null;
}

/**
 * ملخص البنود: يعرض أول صنفين مع عبارة '+X أصناف أخرى' إذا كان هناك أكثر من صنفين
 */
export function getItemsSummaryDisplay(items?: SummaryItem[] | null): string {
  if (!items || items.length === 0) {
    return '—';
  }

  const cleanNames = items
    .map((i) => {
      const desc = i.item_description || i.item_name || i.item?.name || i.purchase_order_item?.item_description || i.purchase_order_item?.item_name || i.purchase_order_item?.item?.name;
      return desc ? String(desc).trim() : '';
    })
    .filter(Boolean);

  if (cleanNames.length === 0) {
    return '—';
  }

  if (cleanNames.length === 1) {
    return cleanNames[0];
  }

  if (cleanNames.length === 2) {
    return `${cleanNames[0]}، ${cleanNames[1]}`;
  }

  const remaining = cleanNames.length - 2;
  return `${cleanNames[0]}، ${cleanNames[1]} (+${remaining} أصناف أخرى)`;
}

/**
 * إرجاع رقم قطعة الأرض بدون أي تكرار
 */
export function getSummaryParcels(pr?: SummaryRequest | any | null): string {
  if (!pr) return '—';
  const prObj = pr.purchase_request || pr.purchase_order?.purchase_request || pr;
  const items: SummaryItem[] = pr.items || pr.purchase_order?.items || [];

  const allParcels = [
    prObj.parcel_reference,
    ...items.map((i) => i.item_reference || i.purchase_order_item?.item_reference || i.purchase_order_item?.pr_item?.item_reference || i.pr_item?.item_reference)
  ].filter(Boolean) as string[];

  const unique = Array.from(new Set(allParcels.map((p) => String(p).trim()).filter(Boolean)));
  return unique.length > 0 ? unique.join('، ') : '—';
}

/**
 * إرجاع المنطقة بدون أي تكرار
 */
export function getSummaryRegions(pr?: SummaryRequest | any | null): string {
  if (!pr) return '—';
  const prObj = pr.purchase_request || pr.purchase_order?.purchase_request || pr;
  if (prObj.request_type === 'OFFICE_SUPPLIES') {
    return 'مقر الشركة';
  }

  const items: SummaryItem[] = pr.items || pr.purchase_order?.items || [];
  const allRegions = [
    prObj.region,
    ...items.map((i) => i.region || i.purchase_order_item?.region || i.purchase_order_item?.pr_item?.region || i.pr_item?.region)
  ].filter(Boolean) as string[];

  const unique = Array.from(new Set(allRegions.map((r) => String(r).trim()).filter(Boolean)));
  return unique.length > 0 ? unique.join('، ') : '—';
}

export interface QuantitySummaryResult {
  display: string;
  subtext?: string;
  tooltip: string;
}

/**
 * تنسيق الكميات بشكل واضح وبدون تكرار لنصوص الوحدات
 */
export function getSummaryQuantities(items?: SummaryItem[] | null): QuantitySummaryResult {
  if (!items || items.length === 0) {
    return { display: '—', tooltip: '' };
  }

  const cleanItems = items.map((i) => {
    const rawVal = i.quantity !== undefined && i.quantity !== null
      ? i.quantity
      : i.received_quantity !== undefined && i.received_quantity !== null
      ? i.received_quantity
      : i.ordered_quantity;
    const rawQty = Number(rawVal);
    const qty = isNaN(rawQty) ? 0 : rawQty;
    const rawUom = i.uom || i.purchase_order_item?.uom || '';
    const unit = getUnitLabel(rawUom);
    const name = i.item_description || i.item_name || i.item?.name || i.purchase_order_item?.item_description || i.purchase_order_item?.item_name || 'صنف';
    return { name, qty, unit, rawUom: String(rawUom).trim().toUpperCase() };
  });

  const formatNum = (n: number) => {
    return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
  };

  if (cleanItems.length === 1) {
    const it = items[0];
    const cleanIt = cleanItems[0];
    const rebarText = formatRebarDisplay(it.quantity || it.received_quantity || 0, it.uom, it.specifications);
    if (rebarText) {
      return {
        display: rebarText,
        tooltip: `${cleanIt.name}: ${rebarText}`
      };
    }
    const qtyStr = formatNum(cleanIt.qty);
    return {
      display: `${qtyStr} ${cleanIt.unit}`,
      tooltip: `${cleanIt.name}: ${qtyStr} ${cleanIt.unit}`
    };
  }

  // عدة أصناف
  const detailedTooltip = items
    .map((it, idx) => {
      const cleanIt = cleanItems[idx];
      const rebar = formatRebarDisplay(it.quantity || it.received_quantity || 0, it.uom, it.specifications);
      return `${cleanIt.name}: ${rebar || `${formatNum(cleanIt.qty)} ${cleanIt.unit}`}`;
    })
    .join(' | ');

  // فحص هل كل الأصناف تشترك في نفس وحدة القياس
  const firstUom = cleanItems[0].rawUom;
  const allSameUnit = firstUom !== '' && cleanItems.every((it) => it.rawUom === firstUom);

  if (allSameUnit) {
    const totalQty = cleanItems.reduce((sum, it) => sum + it.qty, 0);
    const unit = cleanItems[0].unit;
    return {
      display: `${formatNum(totalQty)} ${unit}`,
      subtext: `(إجمالي ${cleanItems.length} أصناف)`,
      tooltip: detailedTooltip
    };
  }

  return {
    display: `${cleanItems.length} أصناف`,
    subtext: undefined,
    tooltip: detailedTooltip
  };
}
