const l=(a=".print-container .print-document")=>{const i=document.querySelector(a);if(!i){window.print();return}const t=window.open("","_blank","width=960,height=720");if(!t){window.print();return}const m=Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(o=>o.outerHTML).join(`
`),p=i.cloneNode(!0);t.document.open(),t.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <base href="${document.baseURI}" />
    ${m}
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
    <div class="print-container print-target-document">${p.outerHTML}</div>
  </body>
</html>`),t.document.close(),(async()=>{var n;const o=Array.from(t.document.images);await Promise.all(o.map(r=>r.complete?Promise.resolve():new Promise(e=>{r.addEventListener("load",()=>e(),{once:!0}),r.addEventListener("error",()=>e(),{once:!0})}))),(n=t.document.fonts)!=null&&n.ready&&await t.document.fonts.ready,t.addEventListener("afterprint",()=>t.close(),{once:!0}),t.focus(),t.print()})()};export{l as p};
