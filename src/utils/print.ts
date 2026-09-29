export interface PrintDocumentOptions {
  orientation?: 'portrait' | 'landscape';
  title?: string;
}

export const printDocumentOnly = (
  selector = '.print-container .print-document',
  options: PrintDocumentOptions = {}
): void => {
  const sourceDocument = document.querySelector<HTMLElement>(selector);
  if (!sourceDocument) {
    window.print();
    return;
  }

  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) {
    window.print();
    return;
  }

  const orientation = options.orientation || 'portrait';
  const docTitle = options.title || document.title || 'طباعة مستند';

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((style) => style.outerHTML)
    .join('\n');

  const clonedDocument = sourceDocument.cloneNode(true) as HTMLElement;
  clonedDocument.classList.remove('hidden', 'print:block');
  clonedDocument.style.display = 'block';
  clonedDocument.style.width = '100%';
  clonedDocument.style.background = '#ffffff';

  // Remove any interactive or hidden-in-print elements from the clone
  clonedDocument.querySelectorAll('button, .print\\:hidden, .print-hidden').forEach((el) => el.remove());

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <title>${docTitle}</title>
    <base href="${document.baseURI}" />
    ${styles}
    <style>
      @page {
        size: A4 ${orientation};
        margin: 6mm;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        min-height: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        font-family: 'Cairo', 'Tajawal', 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif !important;
        direction: rtl !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body * {
        color: #000000 !important;
        -webkit-text-fill-color: #000000 !important;
        letter-spacing: normal !important;
        word-spacing: normal !important;
        line-height: 1.4 !important;
      }
      .print-container {
        position: static !important;
        display: block !important;
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: visible !important;
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      table {
        width: 100% !important;
        border-collapse: collapse !important;
        font-size: 10px !important;
        margin-top: 4px !important;
        border: 1.5px solid #000000 !important;
      }
      th, td {
        padding: 4px 6px !important;
        border: 1px solid #000000 !important;
        line-height: 1.35 !important;
        vertical-align: middle !important;
        color: #000000 !important;
      }
      th {
        background-color: #f1f5f9 !important;
        font-weight: 800 !important;
        text-align: center !important;
        border: 1px solid #000000 !important;
        border-bottom: 1.5px solid #000000 !important;
      }
      img {
        max-width: 100% !important;
        height: auto !important;
        image-rendering: -webkit-optimize-contrast !important;
        image-rendering: crisp-edges !important;
      }
      @media screen {
        body {
          padding: 12px !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="print-container">${clonedDocument.outerHTML}</div>
  </body>
</html>`);
  printWindow.document.close();

  const printAfterResourcesLoad = async () => {
    const images = Array.from(printWindow.document.images);
    await Promise.all(images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }));

    if (printWindow.document.fonts?.ready) {
      await printWindow.document.fonts.ready;
    }

    printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true });
    printWindow.focus();
    printWindow.print();
  };

  void printAfterResourcesLoad();
};

