const f=(p=".print-container .print-document",n={})=>{const e=document.querySelector(p);if(!e){window.print();return}const t=window.open("","_blank","width=1100,height=800");if(!t){window.print();return}const d=n.orientation||"portrait",l=n.title||document.title||"طباعة مستند",c=Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(r=>r.outerHTML).join(`
`),o=e.cloneNode(!0);o.classList.remove("hidden","print:block"),o.style.display="block",o.style.width="100%",o.style.background="#ffffff",o.querySelectorAll("button, .print\\:hidden, .print-hidden").forEach(r=>r.remove()),t.document.open(),t.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <title>${l}</title>
    <base href="${document.baseURI}" />
    ${c}
    <style>
      @page {
        size: A4 ${d};
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
    <div class="print-container">${o.outerHTML}</div>
  </body>
</html>`),t.document.close(),(async()=>{var a;const r=Array.from(t.document.images);await Promise.all(r.map(i=>i.complete?Promise.resolve():new Promise(m=>{i.addEventListener("load",()=>m(),{once:!0}),i.addEventListener("error",()=>m(),{once:!0})}))),(a=t.document.fonts)!=null&&a.ready&&await t.document.fonts.ready,t.addEventListener("afterprint",()=>t.close(),{once:!0}),t.focus(),t.print()})()};export{f as p};
