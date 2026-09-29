export const printDocumentOnly = (selector = '.print-container .print-document'): void => {
  const sourceDocument = document.querySelector<HTMLElement>(selector);
  if (!sourceDocument) {
    window.print();
    return;
  }

  const printWindow = window.open('', '_blank', 'width=960,height=720');
  if (!printWindow) {
    window.print();
    return;
  }

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((style) => style.outerHTML)
    .join('\n');
  const clonedDocument = sourceDocument.cloneNode(true) as HTMLElement;

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <base href="${document.baseURI}" />
    ${styles}
    <style>
      @page { size: A4 portrait; margin: 8mm; }
      html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; min-height: 0 !important; background: #fff !important; font-family: 'Cairo', 'Tajawal', 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif !important; direction: rtl !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body, body * { color: #000 !important; -webkit-text-fill-color: #000 !important; letter-spacing: normal !important; word-spacing: normal !important; line-height: 1.4 !important; word-break: normal !important; overflow-wrap: break-word !important; }
      .print-container { position: static !important; display: block !important; width: 100% !important; height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; background: #fff !important; }
      .print-container > .print-target-document { display: block !important; width: 100% !important; height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; }
      .print-target-document { display: block !important; visibility: visible !important; }
      table { width: 100% !important; border-collapse: collapse !important; font-size: 11px !important; margin-top: 6px !important; border: 2px solid #000000 !important; }
      th, td { padding: 5px 8px !important; border: 1px solid #000000 !important; line-height: 1.4 !important; vertical-align: middle !important; color: #000000 !important; }
      th { background-color: #f8fafc !important; font-weight: 800 !important; text-align: center !important; border: 1px solid #000000 !important; border-bottom: 2px solid #000000 !important; }
      img { max-width: 100% !important; height: auto !important; image-rendering: -webkit-optimize-contrast !important; image-rendering: crisp-edges !important; }
    </style>
  </head>
  <body>
    <div class="print-container print-target-document">${clonedDocument.outerHTML}</div>
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
