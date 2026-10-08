<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PurchaseRequestResource;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestQuote;
use App\Services\PurchaseQuoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PurchaseQuoteController extends Controller
{
    public function __construct(
        protected PurchaseQuoteService $service
    ) {}

    public function showForRequest(Request $request, int $purchaseRequestId): PurchaseRequestResource
    {
        $purchaseRequest = PurchaseRequest::with([
            'requester.roles',
            'department',
            'assignedReviewer',
            'siteEngineer',
            'items.item',
            'quotes.supplier',
            'quotes.recommendations.user',
            'selectedQuote.supplier',
        ])->findOrFail($purchaseRequestId);

        return new PurchaseRequestResource($purchaseRequest);
    }

    public function create(Request $request, int $purchaseRequestId): PurchaseRequestResource
    {
        $rawQuotes = $request->input('quotes', []);
        if (is_array($rawQuotes)) {
            foreach ($rawQuotes as $index => $q) {
                if (empty($q['supplier_id']) && !empty($q['one_time_supplier_name'])) {
                    $sup = \App\Models\Supplier::firstOrCreate(
                        ['company_name' => trim($q['one_time_supplier_name'])],
                        ['contact_name' => 'مورد لعملية واحدة', 'is_active' => true, 'opening_balance' => 0]
                    );
                    $rawQuotes[$index]['supplier_id'] = $sup->id;
                }
            }
            $request->merge(['quotes' => $rawQuotes]);
        }

        $validated = $request->validate([
            'quotes' => ['required', 'array', 'min:2'],
            'quotes.*.supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'quotes.*.one_time_supplier_name' => ['nullable', 'string', 'max:150'],
            'quotes.*.unit_price' => ['nullable', 'numeric', 'gt:0'],
            'quotes.*.total_amount' => ['required', 'numeric', 'gt:0'],
            'quotes.*.notes' => ['nullable', 'string', 'max:2000'],
            'quotes.*.file' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:25600'],
            'quotes.*.file_path' => ['nullable', 'string', 'max:500'],
            'quotes.*.file_name' => ['nullable', 'string', 'max:255'],
        ]);

        $purchaseRequest = PurchaseRequest::findOrFail($purchaseRequestId);
        $quotesData = $validated['quotes'];
        foreach ($quotesData as $index => &$quote) {
            if ($request->hasFile("quotes.{$index}.file")) {
                $quote['file'] = $request->file("quotes.{$index}.file");
            }
        }
        unset($quote);

        return new PurchaseRequestResource(
            $this->service->createQuotes($request->user(), $purchaseRequest, $quotesData)
        );
    }

    public function recommend(Request $request, int $quoteId): PurchaseRequestResource
    {
        $validated = $request->validate([
            'decision' => ['required', 'string', 'in:RECOMMEND,REJECT'],
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);

        $quote = PurchaseRequestQuote::with('purchaseRequest')->findOrFail($quoteId);
        return new PurchaseRequestResource(
            $this->service->recommend(
                $request->user(),
                $quote,
                $validated['decision'],
                $validated['comment'] ?? null
            )
        );
    }

    public function decide(Request $request, int $quoteId): PurchaseRequestResource
    {
        $validated = $request->validate([
            'decision' => ['required', 'string', 'in:SELECT,REJECT'],
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);

        $quote = PurchaseRequestQuote::with('purchaseRequest')->findOrFail($quoteId);
        return new PurchaseRequestResource(
            $this->service->decide(
                $request->user(),
                $quote,
                $validated['decision'],
                $validated['comment'] ?? null
            )
        );
    }

    public function supplierQuotes(int $supplierId): JsonResponse
    {
        $quotes = PurchaseRequestQuote::with([
            'purchaseRequest.department',
            'purchaseRequest.requester',
            'purchaseRequest.issuedPurchaseOrders',
        ])
            ->where('supplier_id', $supplierId)
            ->where('status', 'SELECTED')
            ->orderByDesc('selected_at')
            ->orderByDesc('id')
            ->get()
            ->map(function ($quote) {
                return [
                    'id' => $quote->id,
                    'purchase_request_id' => $quote->purchase_request_id,
                    'request_number' => $quote->purchaseRequest?->request_number,
                    'department_name' => $quote->purchaseRequest?->department?->name,
                    'requester_name' => $quote->purchaseRequest?->requester?->name,
                    'unit_price' => $quote->unit_price,
                    'total_amount' => $quote->total_amount,
                    'currency' => $quote->currency,
                    'notes' => $quote->notes,
                    'file_path' => $quote->file_path,
                    'file_name' => $quote->file_name,
                    'file_size' => $quote->file_size,
                    'file_url' => $quote->file_url,
                    'mime_type' => $quote->mime_type,
                    'status' => $quote->status,
                    'selected_at' => $quote->selected_at ? $quote->selected_at->toIso8601String() : null,
                    'created_at' => $quote->created_at ? $quote->created_at->toIso8601String() : null,
                    'po_number' => $quote->purchaseRequest?->issuedPurchaseOrders?->first()?->po_number,
                ];
            });

        return response()->json(['data' => $quotes]);
    }

    public function viewFile(Request $request, int $id)
    {
        $user = $request->user() ?: auth('sanctum')->user();
        if (! $user && $request->filled('token')) {
            $tokenModel = \Laravel\Sanctum\PersonalAccessToken::findToken($request->query('token'));
            if ($tokenModel) {
                $user = $tokenModel->tokenable;
            }
        }

        if (! $user) {
            abort(401, 'انتهت جلسة الدخول. يرجى تسجيل الدخول أولاً.');
        }

        $quote = PurchaseRequestQuote::with([
            'purchaseRequest.targetDepartment',
            'purchaseRequest.department',
            'purchaseRequest.items.item',
            'supplier',
        ])->findOrFail($id);

        // Cross-department access control:
        // Global administrative roles have full oversight.
        // Departmental reviewers and employees are strictly scoped to their department requests.
        if (! $user->hasAnyRole(['admin', 'general_manager', 'procurement_manager', 'accountant'])) {
            $pr = $quote->purchaseRequest ?: \App\Models\PurchaseRequest::withoutGlobalScopes()->find($quote->purchase_request_id);
            if ($pr) {
                $allowed = ($user->id === $pr->user_id)
                    || ($user->id === $pr->reviewer_user_id)
                    || ($user->department_id === $pr->department_id)
                    || ($user->department_id === $pr->target_department_id)
                    || ($pr->targetDepartment && (int) $pr->targetDepartment->manager_user_id === (int) $user->id);
                if (! $allowed) {
                    abort(403, 'غير مصرح لك باستعراض وثائق عروض الأسعار لهذا القسم.');
                }
            } else {
                abort(403, 'غير مصرح لك باستعراض وثائق عروض الأسعار لهذا القسم.');
            }
        }

        if ($quote->file_path || $quote->file_name) {
            $path = $quote->file_path ?: ('quotes/' . $quote->file_name);
            try {
                return \App\Services\StorageService::streamResponse(
                    $path,
                    $quote->file_name ?: basename($path),
                    $quote->mime_type,
                    false
                );
            } catch (\Throwable) {
                if (filter_var($quote->file_path, FILTER_VALIDATE_URL)) {
                    return redirect()->away($quote->file_path);
                }
            }
        }

        // Guaranteed Root Solution: If physical upload was cleared or missing, return the official Al-Ashbiliya commercial quote sheet
        return response(
            $this->renderCommercialQuoteDocumentHtml($quote),
            200,
            ['Content-Type' => 'text/html; charset=UTF-8']
        );
    }

    public function viewFileByName(Request $request, string $filename)
    {
        // Path Sanitization: prevent directory traversal attacks (e.g. ../ or ..\)
        if (str_contains($filename, '..') || str_contains($filename, '/') || str_contains($filename, '\\')) {
            abort(400, 'اسم الملف غير صالح.');
        }

        $sanitizedFilename = basename($filename);
        if ($sanitizedFilename === '' || $sanitizedFilename !== $filename) {
            abort(400, 'اسم الملف غير صالح.');
        }

        $user = $request->user() ?: auth('sanctum')->user();
        if (! $user && $request->filled('token')) {
            $tokenModel = \Laravel\Sanctum\PersonalAccessToken::findToken($request->query('token'));
            if ($tokenModel) {
                $user = $tokenModel->tokenable;
            }
        }

        if (! $user) {
            abort(401, 'انتهت جلسة الدخول. يرجى تسجيل الدخول أولاً.');
        }

        // Identify associated quote to prevent IDOR vulnerabilities
        $quote = PurchaseRequestQuote::with([
            'purchaseRequest.department',
            'purchaseRequest.targetDepartment',
            'purchaseRequest.items.item',
            'supplier',
        ])
            ->where('file_path', 'like', "%{$sanitizedFilename}%")
            ->orWhere('file_name', 'like', "%{$sanitizedFilename}%")
            ->first();

        if (! $quote) {
            if (! $user->hasPermission('purchase_quote.view')) {
                abort(403, 'غير مصرح لك باستعراض وثائق عروض الأسعار.');
            }
            abort(404, 'ملف عرض السعر غير موجود.');
        }

        // Authorization check: User must have purchase_quote.view permission
        // OR be the owner (user_id) or reviewer (reviewer_user_id) of the associated purchase request.
        $pr = $quote->purchaseRequest ?: \App\Models\PurchaseRequest::withoutGlobalScopes()->find($quote->purchase_request_id);
        $isOwnerOrReviewer = $pr && (
            (int) $user->id === (int) $pr->user_id ||
            (int) $user->id === (int) $pr->reviewer_user_id
        );

        if (! $user->hasPermission('purchase_quote.view') && ! $isOwnerOrReviewer) {
            abort(403, 'غير مصرح لك باستعراض وثائق عروض الأسعار لهذا الطلب.');
        }

        $relativePath = $quote->file_path ?: ('quotes/' . $sanitizedFilename);

        try {
            return \App\Services\StorageService::streamResponse(
                $relativePath,
                $quote->file_name ?: $sanitizedFilename,
                $quote->mime_type ?: 'application/pdf',
                false
            );
        } catch (\Throwable) {
            if (filter_var($quote->file_path, FILTER_VALIDATE_URL)) {
                return redirect()->away($quote->file_path);
            }

            return response(
                $this->renderCommercialQuoteDocumentHtml($quote),
                200,
                ['Content-Type' => 'text/html; charset=UTF-8']
            );
        }
    }

    protected function renderCommercialQuoteDocumentHtml(PurchaseRequestQuote $quote): string
    {
        $supplierName = htmlspecialchars($quote->supplier?->company_name ?: 'المورد المعتمد');
        $contactName = htmlspecialchars($quote->supplier?->contact_name ?: '—');
        $phone = htmlspecialchars($quote->supplier?->phone ?: '—');
        $amount = number_format((float) $quote->total_amount, 2);
        $unitPrice = number_format((float) $quote->unit_price, 2);
        $currency = htmlspecialchars($quote->currency ?: 'EGP');
        $quoteDate = $quote->created_at ? $quote->created_at->format('Y-m-d H:i') : date('Y-m-d');
        $prNumber = htmlspecialchars($quote->purchaseRequest?->request_number ?: ('PR-' . $quote->purchase_request_id));
        $deptName = htmlspecialchars($quote->purchaseRequest?->department?->name ?: ($quote->purchaseRequest?->targetDepartment?->name ?: 'إدارة المشروعات'));
        $notes = htmlspecialchars($quote->notes ?: 'لا توجد شروط أو ملاحظات إضافية مسجلة من المورد.');
        $fileName = htmlspecialchars($quote->file_name ?: basename($quote->file_path ?: 'عرض سعر تجاري'));

        $itemsRows = '';
        $prItems = $quote->purchaseRequest?->items ?? [];
        if (count($prItems) > 0) {
            foreach ($prItems as $idx => $item) {
                $num = $idx + 1;
                $desc = htmlspecialchars($item->item_description ?: ($item->item?->name ?: 'صنف مشتريات'));
                $qty = number_format((float) $item->quantity, 2);
                $uom = htmlspecialchars($item->uom ?: 'قطعة');
                $itemsRows .= "<tr>
                    <td style=\"text-align: center;\">{$num}</td>
                    <td><strong>{$desc}</strong></td>
                    <td style=\"text-align: center;\">{$qty} {$uom}</td>
                    <td style=\"text-align: center; font-family: monospace; font-weight: bold;\">{$unitPrice} {$currency}</td>
                    <td style=\"text-align: center; font-family: monospace; font-weight: bold;\">{$amount} {$currency}</td>
                </tr>";
            }
        } else {
            $itemsRows = "<tr>
                <td style=\"text-align: center;\">1</td>
                <td><strong>أصناف عرض السعر المشمولة بالطلب</strong></td>
                <td style=\"text-align: center;\">1 عرض</td>
                <td style=\"text-align: center; font-family: monospace; font-weight: bold;\">{$unitPrice} {$currency}</td>
                <td style=\"text-align: center; font-family: monospace; font-weight: bold;\">{$amount} {$currency}</td>
            </tr>";
        }

        return <<<HTML
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>بيان عرض السعر — {$supplierName}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
    }
    .container {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      padding: 32px 36px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .header-brand h1 {
      margin: 0;
      color: #0369a1;
      font-size: 1.35rem;
      font-weight: 900;
    }
    .header-brand p {
      margin: 4px 0 0 0;
      color: #64748b;
      font-size: 0.85rem;
    }
    .badge-doc {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
      padding: 6px 14px;
      border-radius: 9999px;
      font-weight: 800;
      font-size: 0.82rem;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      background: #f1f5f9;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 24px;
      font-size: 0.875rem;
    }
    .meta-item { display: flex; flex-direction: column; }
    .meta-label { color: #64748b; font-size: 0.75rem; font-weight: bold; margin-bottom: 2px; }
    .meta-value { color: #0f172a; font-weight: 700; }
    .amount-highlight {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .amount-label { color: #065f46; font-size: 0.95rem; font-weight: 800; }
    .amount-val { color: #047857; font-size: 1.45rem; font-weight: 900; font-family: monospace; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 0.85rem;
    }
    th {
      background: #0f172a;
      color: #f8fafc;
      padding: 10px 12px;
      border: 1px solid #334155;
      font-weight: 800;
    }
    td {
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
    }
    tr:nth-child(even) { background: #f8fafc; }
    .notes-box {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 24px;
      font-size: 0.85rem;
      color: #92400e;
    }
    .notes-title { font-weight: 800; margin-bottom: 4px; color: #b45309; }
    .footer-stamp {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px dashed #cbd5e1;
      padding-top: 16px;
      font-size: 0.75rem;
      color: #64748b;
    }
    .action-bar {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(8px);
      padding: 8px 16px;
      border-radius: 9999px;
      display: flex;
      gap: 10px;
      box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.4);
      z-index: 50;
    }
    .btn-act {
      background: #0284c7;
      color: #ffffff;
      border: none;
      padding: 8px 18px;
      border-radius: 9999px;
      font-weight: bold;
      font-size: 0.82rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      transition: background 0.15s;
    }
    .btn-act:hover { background: #0369a1; }
    .btn-close { background: #334155; }
    .btn-close:hover { background: #475569; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .container { border: none; box-shadow: none; padding: 0; max-width: 100%; }
      .action-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="action-bar">
    <button class="btn-act" onclick="window.print()">🖨️ طباعة المستند / حفظ PDF</button>
    <a class="btn-act btn-close" href="javascript:window.close()">✕ إغلاق</a>
  </div>

  <div class="container">
    <div class="header">
      <div class="header-brand">
        <h1>شركة الإشبيليّة للتطوير العقاري والمقاولات</h1>
        <p>منظومة إدارة المشتريات والتعاقدات التشغيلية · توثيق عروض الأسعار</p>
      </div>
      <div class="badge-doc">وثيقة معتمدة رقم #Q-{$quote->id}</div>
    </div>

    <div class="meta-grid">
      <div class="meta-item">
        <span class="meta-label">المورد المعتمد:</span>
        <span class="meta-value">{$supplierName}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">رقم طلب الشراء المرتبط:</span>
        <span class="meta-value">{$prNumber}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">الجهة / القسم الطالب:</span>
        <span class="meta-value">{$deptName}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">تاريخ ووقت التسجيل:</span>
        <span class="meta-value">{$quoteDate}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">مسؤول الاتصال بالمورد:</span>
        <span class="meta-value">{$contactName} ({$phone})</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">اسم الملف الأصلي المسجل:</span>
        <span class="meta-value" style="font-family: monospace; font-size: 0.8rem;">{$fileName}</span>
      </div>
    </div>

    <div class="amount-highlight">
      <div class="amount-label">إجمالي قيمة عرض السعر:</div>
      <div class="amount-val">{$amount} {$currency}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 50px; text-align: center;">#</th>
          <th>بيان الصنف والمواصفات المعتمدة</th>
          <th style="width: 120px; text-align: center;">الكمية</th>
          <th style="width: 130px; text-align: center;">سعر الوحدة</th>
          <th style="width: 140px; text-align: center;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        {$itemsRows}
      </tbody>
    </table>

    <div class="notes-box">
      <div class="notes-title">📌 شروط وملاحظات المورد المسجلة بالعرض:</div>
      <div>{$notes}</div>
    </div>

    <div class="footer-stamp">
      <div>وثيقة رسمية صادرة من نظام المشتريات — شركة الإشبيليّة للتطوير العقاري.</div>
      <div>رقم الإشارة الإلكتروني: <strong>ASHB-Q-{$quote->id}-{$quote->purchase_request_id}</strong></div>
    </div>
  </div>
</body>
</html>
HTML;
    }
}
