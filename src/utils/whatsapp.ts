import React from 'react';
import { createRoot } from 'react-dom/client';
import html2pdf from 'html2pdf.js';
import { CombinedPrintTemplate } from '../components/procurement/CombinedPrintTemplate';
import { toast } from './toast';
import { formatCleanNumber, formatCleanQty } from './numberFormat';

export interface WhatsAppReceiptData {
  receipt_number?: string | null;
  received_at?: string | null;
  amount?: number | string | null;
  item_reference?: string | null;
  parcel_reference?: string | null;
  region?: string | null;
  purchase_order?: {
    po_number?: string | null;
    project_name?: string | null;
    parcel_reference?: string | null;
    region?: string | null;
    notes?: string | null;
    supplier?: {
      company_name?: string | null;
      phone?: string | null;
    } | null;
    purchase_request?: {
      project_name?: string | null;
      parcel_reference?: string | null;
      region?: string | null;
      notes?: string | null;
      department?: {
        name?: string | null;
      } | null;
      items?: Array<{
        id?: number;
        item_description?: string | null;
        quantity?: number | string | null;
        uom?: string | null;
        specifications?: string | null;
        item_reference?: string | null;
        region?: string | null;
      }>;
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
      specifications?: string | null;
      pr_item?: {
        item_description?: string | null;
        specifications?: string | null;
        item_reference?: string | null;
        region?: string | null;
        uom?: string | null;
      } | null;
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
      specifications?: string | null;
      pr_item?: {
        item_description?: string | null;
        specifications?: string | null;
        item_reference?: string | null;
        region?: string | null;
        uom?: string | null;
      } | null;
    } | null;
  }>;
  [key: string]: any;
}

export const buildReceiptWhatsAppText = (
  receipt: WhatsAppReceiptData,
  totalValue?: number,
  options?: ShareReceiptWhatsAppOptions | string
): string => {
  const opt: ShareReceiptWhatsAppOptions = typeof options === 'string' ? { overridePhone: options } : (options || {});
  const po = opt.po || receipt?.purchase_order || null;
  const pr = po?.purchase_request || (receipt as any)?.purchase_request || null;

  // Extract the single received item from receipt or fallback to PO item
  const receiptItem = receipt?.items && receipt.items.length > 0 ? receipt.items[0] : null;
  const poItem =
    receiptItem?.purchase_order_item ||
    (po?.items && po.items.length > 0 ? po.items[0] : null);
  const prItem =
    poItem?.pr_item ||
    (pr?.items && pr.items.length > 0 ? pr.items[0] : null);

  // 1. RECEIVED_QUANTITY = الكمية المستلمة فعليًا
  let receivedQuantityStr = 'غير مسجل';
  const rawReceivedQty = receiptItem?.received_quantity;
  if (rawReceivedQty !== undefined && rawReceivedQty !== null && String(rawReceivedQty).trim() !== '') {
    const num = parseFloat(String(rawReceivedQty));
    if (!isNaN(num)) {
      receivedQuantityStr = formatCleanQty(num);
    } else {
      receivedQuantityStr = String(rawReceivedQty).trim();
    }
  }

  // 2. UNIT = وحدة القياس
  const rawUnit =
    receiptItem?.purchase_order_item?.uom ||
    poItem?.uom ||
    prItem?.uom ||
    (receiptItem as any)?.uom ||
    null;
  const unitStr = rawUnit && String(rawUnit).trim() ? String(rawUnit).trim() : '';

  // 3. ITEM_NAME = اسم الصنف
  const rawItemName =
    receiptItem?.purchase_order_item?.item_name ||
    receiptItem?.purchase_order_item?.item_description ||
    poItem?.item_name ||
    poItem?.item_description ||
    (poItem as any)?.item?.name ||
    prItem?.item_description ||
    (receiptItem as any)?.item_name ||
    (receiptItem as any)?.item_description ||
    null;
  const itemNameStr = rawItemName && String(rawItemName).trim() ? String(rawItemName).trim() : 'غير مسجل';

  // 4. UNIT_PRICE = سعر الوحدة
  let unitPriceNum: number | null = null;
  const rawUnitPrice = poItem?.unit_price ?? (poItem as any)?.actual_unit_price;
  if (rawUnitPrice !== undefined && rawUnitPrice !== null && String(rawUnitPrice).trim() !== '') {
    const p = parseFloat(String(rawUnitPrice));
    if (!isNaN(p)) {
      unitPriceNum = p;
    }
  }
  const unitPriceStr = unitPriceNum !== null ? `${formatCleanNumber(unitPriceNum)} ج.م` : 'غير مسجل';

  // 5. LINE_TOTAL = إجمالي البند
  let lineTotalNum: number | null = null;
  const numRecQty = rawReceivedQty !== undefined && rawReceivedQty !== null ? parseFloat(String(rawReceivedQty)) : NaN;
  if (!isNaN(numRecQty) && unitPriceNum !== null) {
    lineTotalNum = Math.round(numRecQty * unitPriceNum * 100) / 100;
  } else if ((poItem as any)?.actual_line_total !== undefined && (poItem as any)?.actual_line_total !== null && String((poItem as any).actual_line_total).trim() !== '') {
    const parsed = parseFloat(String((poItem as any).actual_line_total));
    if (!isNaN(parsed)) lineTotalNum = parsed;
  } else if (poItem?.line_total !== undefined && poItem?.line_total !== null && String(poItem.line_total).trim() !== '') {
    const parsed = parseFloat(String(poItem.line_total));
    if (!isNaN(parsed)) lineTotalNum = parsed;
  }
  const lineTotalStr = lineTotalNum !== null ? `${formatCleanNumber(lineTotalNum)} ج.م` : 'غير مسجل';

  // 6. LAND_PLOT_NUMBER = رقم قطعة الأرض
  const rawPlot =
    poItem?.item_reference ||
    receiptItem?.purchase_order_item?.item_reference ||
    prItem?.item_reference ||
    (receipt as any)?.parcel_reference ||
    (receipt as any)?.item_reference ||
    po?.parcel_reference ||
    pr?.parcel_reference ||
    null;
  const landPlotNumberStr = rawPlot && String(rawPlot).trim() ? String(rawPlot).trim() : 'غير مسجل';

  // 7. REGION = المنطقة
  const rawRegion =
    poItem?.region ||
    receiptItem?.purchase_order_item?.region ||
    prItem?.region ||
    (receipt as any)?.region ||
    po?.region ||
    pr?.region ||
    null;
  const regionStr = rawRegion && String(rawRegion).trim() ? String(rawRegion).trim() : 'غير مسجل';

  // 8. PURPOSE = الغرض
  const rawPurpose =
    po?.purchase_request?.notes ||
    pr?.notes ||
    poItem?.specifications ||
    receiptItem?.purchase_order_item?.specifications ||
    prItem?.specifications ||
    (receiptItem as any)?.notes ||
    (receipt as any)?.warehouse_notes ||
    (poItem as any)?.purpose ||
    (receiptItem as any)?.purpose ||
    (prItem as any)?.purpose ||
    po?.project_name ||
    pr?.project_name ||
    po?.purchase_request?.department?.name ||
    pr?.department?.name ||
    null;
  const purposeStr = rawPurpose && String(rawPurpose).trim() ? String(rawPurpose).trim() : 'غير مسجل';

  // Construction of lines according to strict template
  const quantityLine =
    receivedQuantityStr !== 'غير مسجل'
      ? `🔹 الكمية: ${receivedQuantityStr}${unitStr ? ` ${unitStr}` : ''}`
      : '🔹 الكمية: غير مسجل';

  return [
    quantityLine,
    `🔹 الصنف: ${itemNameStr}`,
    `🔹 المبلغ الكلي: ${lineTotalStr}`,
    `🔹 سعر الوحدة: ${unitPriceStr}`,
    `🔹 رقم قطعة الأرض: ${landPlotNumberStr}`,
    `🔹 المنطقة: ${regionStr}`,
    `🔹 الغرض: ${purposeStr}`,
  ].join('\n');
};

export const normalizeWhatsAppPhone = (phone?: string | null): string => {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (!clean) return '';

  // If starts with international 00, strip the 00
  if (clean.startsWith('00')) {
    clean = clean.slice(2);
  }

  // Egyptian numbers: starts with 01 (11 digits) -> prefix with 2
  if (clean.startsWith('01') && clean.length === 11) {
    return `2${clean}`;
  }

  // Egyptian numbers without leading 0: starts with 1 (10 digits) -> prefix with 20
  if (clean.startsWith('1') && clean.length === 10) {
    return `20${clean}`;
  }

  return clean;
};

export interface ShareReceiptWhatsAppOptions {
  po?: any;
  sourceElement?: HTMLElement | null;
  overridePhone?: string;
}

export const generateReceiptPdfBlob = async (
  receipt: WhatsAppReceiptData,
  options?: ShareReceiptWhatsAppOptions
): Promise<{ blob: Blob; fileName: string }> => {
  const poNum = receipt.purchase_order?.po_number || options?.po?.po_number || 'PO';
  const cleanPoNum = String(poNum).replace(/[/\\?%*:|"<>]/g, '-').trim();
  const fileName = `Document-${cleanPoNum}.pdf`;

  let cleanup: (() => void) | null = null;
  let targetElement: HTMLElement | null =
    options?.sourceElement ||
    document.querySelector<HTMLElement>('.three-way-print-container .print-document');

  if (!targetElement) {
    const poData = options?.po || receipt.purchase_order;
    const offscreen = document.createElement('div');
    offscreen.id = 'offscreen-pdf-renderer';
    offscreen.style.position = 'fixed';
    offscreen.style.left = '-9999px';
    offscreen.style.top = '0';
    offscreen.style.width = '210mm';
    offscreen.style.backgroundColor = '#ffffff';
    offscreen.style.zIndex = '-99999';
    offscreen.style.opacity = '0';
    offscreen.style.pointerEvents = 'none';
    document.body.appendChild(offscreen);

    const root = createRoot(offscreen);
    root.render(
      React.createElement(
        'div',
        { className: 'bg-white text-black p-4 w-full' },
        React.createElement(CombinedPrintTemplate, {
          po: poData,
          receipt: receipt as any,
        })
      )
    );

    await new Promise((r) => setTimeout(r, 350));

    const images = Array.from(offscreen.querySelectorAll('img'));
    if (images.length > 0) {
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          });
        })
      );
    }

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    targetElement = offscreen.querySelector<HTMLElement>('.print-document') || offscreen;
    cleanup = () => {
      try {
        root.unmount();
        offscreen.remove();
      } catch {}
    };
  }

  try {
    const opt = {
      margin: [4, 4, 4, 4] as [number, number, number, number],
      filename: fileName,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        letterRendering: true,
        backgroundColor: '#ffffff',
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait' as const,
      },
    };

    const worker = (typeof html2pdf === 'function' ? html2pdf : (html2pdf as any).default)();
    const blob: Blob = await worker.set(opt).from(targetElement).outputPdf('blob');
    return { blob, fileName };
  } finally {
    if (cleanup) cleanup();
  }
};

export const isMobileBrowser = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTouchScreen = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return Boolean(isMobileUA && isTouchScreen);
};

export const shareReceiptOnWhatsApp = async (
  receipt: WhatsAppReceiptData,
  totalValue?: number,
  options?: ShareReceiptWhatsAppOptions | string
): Promise<void> => {
  const opt: ShareReceiptWhatsAppOptions = typeof options === 'string' ? { overridePhone: options } : (options || {});
  const text = buildReceiptWhatsAppText(receipt, totalValue, opt);
  const isMobile = isMobileBrowser();

  const phone = normalizeWhatsAppPhone(opt.overridePhone || receipt.purchase_order?.supplier?.phone);
  const phoneQuery = phone ? `phone=${phone}&` : '';

  // Desktop: توجيه مباشر إلى واتساب ويب web.whatsapp.com (أو برقم هاتف إذا توفر)
  // Mobile: api.whatsapp.com
  const whatsappUrl = isMobile
    ? `https://api.whatsapp.com/send?${phoneQuery}text=${encodeURIComponent(text)}`
    : (phone
        ? `https://web.whatsapp.com/send?${phoneQuery}text=${encodeURIComponent(text)}`
        : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`);

  try {
    window.open(whatsappUrl, '_blank');
    toast.success('تم فتح واتساب لإرسال بيانات البند ✅');
  } catch (err) {
    console.error('Error in shareReceiptOnWhatsApp:', err);
    window.open(whatsappUrl, '_blank');
  }
};
