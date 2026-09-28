import { getUnitLabel } from './units';
import { formatRebarDisplay } from './rebar';

export interface SummaryItem {
  item_description?: string | null;
  item?: { name?: string | null } | null;
  item_reference?: string | null;
  region?: string | null;
  quantity?: number | string | null;
  uom?: string | null;
  specifications?: string | null;
}

export interface SummaryRequest {
  request_type?: string | null;
  parcel_reference?: string | null;
  items?: SummaryItem[] | null;
}

/**
 * إرجاع رقم قطعة الأرض بدون أي تكرار
 */
export function getSummaryParcels(pr: SummaryRequest): string {
  const allParcels = [
    pr.parcel_reference,
    ...(pr.items || []).map((i) => i.item_reference)
  ].filter(Boolean) as string[];

  const unique = Array.from(new Set(allParcels.map((p) => String(p).trim()).filter(Boolean)));
  return unique.length > 0 ? unique.join('، ') : '—';
}

/**
 * إرجاع المنطقة بدون أي تكرار
 */
export function getSummaryRegions(pr: SummaryRequest): string {
  if (pr.request_type === 'OFFICE_SUPPLIES') {
    return 'مقر الشركة';
  }
  const allRegions = (pr.items || []).map((i) => i.region).filter(Boolean) as string[];
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
    const rawQty = Number(i.quantity);
    const qty = isNaN(rawQty) ? 0 : rawQty;
    const unit = getUnitLabel(i.uom);
    const name = i.item_description || i.item?.name || 'صنف';
    return { name, qty, unit, rawUom: (i.uom || '').trim().toUpperCase() };
  });

  const formatNum = (n: number) => {
    return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
  };

  if (cleanItems.length === 1) {
    const it = items[0];
    const cleanIt = cleanItems[0];
    const rebarText = formatRebarDisplay(it.quantity || 0, it.uom, it.specifications);
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
      const rebar = formatRebarDisplay(it.quantity || 0, it.uom, it.specifications);
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
