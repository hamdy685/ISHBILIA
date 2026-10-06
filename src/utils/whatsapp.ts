import React from 'react';
import { createRoot } from 'react-dom/client';
import html2pdf from 'html2pdf.js';
import { CombinedPrintTemplate } from '../components/procurement/CombinedPrintTemplate';
import { toast } from './toast';
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
    '📎 *ملاحظة للمورد:* ملخص التوريد موضح أعلاه، ويتم إرفاق مستند أمر الشراء وإذن الاستلام المعتمد (PDF) مع هذه المحادثة.',
  ].filter(Boolean);

  return messageSections.join('\n');
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

export const shareReceiptOnWhatsApp = async (
  receipt: WhatsAppReceiptData,
  totalValue?: number,
  options?: ShareReceiptWhatsAppOptions | string
): Promise<void> => {
  const opt: ShareReceiptWhatsAppOptions = typeof options === 'string' ? { overridePhone: options } : (options || {});
  const text = buildReceiptWhatsAppText(receipt, totalValue);
  
  // R1: إزالة رقم الهاتف لتفعيل اختيار جهة الاتصال في واتساب
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  try {
    // R2: توليد ملف PDF للمستند
    const { blob, fileName } = await generateReceiptPdfBlob(receipt, opt);

    // R4: دعم Web Share API للموبايل إذا كان المتصفح يدعم مشاركة الملفات
    const pdfFile = new File([blob], fileName, { type: 'application/pdf' });
    if (
      typeof navigator !== 'undefined' &&
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [pdfFile] })
    ) {
      try {
        await navigator.share({
          title: fileName,
          text: text,
          files: [pdfFile],
        });
        toast.success('تمت مشاركة ملف الـ PDF عبر واتساب بنجاح ✅');
        return;
      } catch (shareErr: any) {
        if (shareErr.name === 'AbortError') {
          return;
        }
      }
    }

    // R2: تحميل الملف تلقائياً على جهاز المستخدم
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);

    // R3: فتح نافذة الواتساب ويب
    window.open(whatsappUrl, '_blank');

    // R3: توجيه المستخدم والتنبيه عبر Toast
    toast.success('تم تحميل ملف الـ PDF بنجاح. يرجى اختيار جهة الاتصال وإرفاق الملف في محادثة الواتساب.', {
      duration: 7000,
    });
  } catch (err) {
    console.error('Error in shareReceiptOnWhatsApp:', err);
    // Fallback if PDF generation fails: still open WhatsApp Web so user isn't blocked
    window.open(whatsappUrl, '_blank');
    toast.info('تم فتح واتساب لاختيار جهة الاتصال.');
  }
};
