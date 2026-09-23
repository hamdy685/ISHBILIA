<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Services\PurchaseReceiptService;
use Illuminate\Http\Request;

class PurchaseReceiptController extends Controller
{
    public function __construct(
        protected PurchaseReceiptService $service
    ) {}

    public function warehouseQueue(Request $request)
    {
        return response()->json($this->service->warehouseQueue(min((int) $request->query('per_page', 15), 100)));
    }

    public function archive(Request $request)
    {
        return response()->json($this->service->receiptArchive($request->user(), min((int) $request->query('per_page', 25), 100)));
    }

    public function store(Request $request, int $purchaseOrderId)
    {
        $validated = $request->validate([
            'received_at' => ['nullable', 'date'],
            'warehouse_notes' => ['nullable', 'string', 'max:3000'],
            'photo' => ['nullable', 'file', 'max:20480'], // max 20MB
            'photo_base64' => ['nullable', 'string'],
            'photo_name' => ['nullable', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.purchase_order_item_id' => ['required', 'integer', 'exists:purchase_order_items,id'],
            'items.*.received_quantity' => ['required', 'numeric', 'gte:0'],
            'items.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $photoData = null;
        if ($request->hasFile('photo')) {
            $photoData = \App\Services\StorageService::storeUploadedFile($request->file('photo'), 'receipts');
        } elseif ($request->filled('photo_base64')) {
            $photoData = \App\Services\StorageService::storeBase64(
                $request->input('photo_base64'),
                'receipts',
                $request->input('photo_name')
            );
        }

        $purchaseOrder = PurchaseOrder::findOrFail($purchaseOrderId);
        try {
            $receipt = $this->service->createByWarehouse(
                $request->user(),
                $purchaseOrder,
                $validated['items'],
                $validated['received_at'] ?? null,
                $validated['warehouse_notes'] ?? null,
                $photoData,
            );
        } catch (\RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 409);
        }

        return response()->json(['message' => 'تم تسجيل الاستلام واعتماده نهائياً ونقله للحسابات.', 'data' => $receipt], 201);
    }

    public function indexAssigned(Request $request)
    {
        $this->service->syncPendingBuildingsReceiptsForEngineer($request->user());

        $receipts = PurchaseReceipt::with([
            'purchaseOrder.supplier',
            'purchaseOrder.purchaseRequest.department',
            'purchaseOrder.purchaseRequest.requester',
            'purchaseOrder.purchaseRequest.siteEngineer',
            'purchaseOrder.items.item',
            'purchaseOrder.items.prItem',
            'purchaseRequest.department',
            'purchaseRequest.requester',
            'purchaseRequest.siteEngineer',
            'warehouseKeeper',
            'siteEngineer',
            'items.purchaseOrderItem.item',
            'items.purchaseOrderItem.prItem',
        ])
            ->where('site_engineer_user_id', $request->user()->id)
            ->where('status', 'PENDING_SITE_ENGINEER')
            ->orderByDesc('created_at')
            ->paginate(min((int) $request->query('per_page', 15), 100));

        return response()->json($receipts);
    }

    public function show(string|int $id)
    {
        $receipt = PurchaseReceipt::with([
            'purchaseOrder.supplier',
            'purchaseOrder.createdBy',
            'purchaseOrder.accountingReviewer',
            'purchaseOrder.purchaseRequest.department',
            'purchaseOrder.purchaseRequest.requester',
            'purchaseOrder.purchaseRequest.assignedReviewer',
            'purchaseOrder.purchaseRequest.siteEngineer',
            'purchaseOrder.purchaseRequest.approvalHistory.actor',
            'purchaseOrder.items.item',
            'purchaseOrder.items.prItem',
            'purchaseOrder.approvalHistory.actor',
            'purchaseRequest.department',
            'purchaseRequest.requester',
            'purchaseRequest.assignedReviewer',
            'purchaseRequest.siteEngineer',
            'warehouseKeeper',
            'siteEngineer',
            'items.purchaseOrderItem.item',
            'items.purchaseOrderItem.prItem',
        ])->findOrFail((int) $id);

        return response()->json(['data' => $receipt]);
    }

    public function update(Request $request, string|int $id)
    {
        $validated = $request->validate([
            'site_engineer_notes' => ['nullable', 'string', 'max:3000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'integer', 'exists:purchase_receipt_items,id'],
            'items.*.received_quantity' => ['required', 'numeric', 'gte:0'],
            'items.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);
        $receipt = PurchaseReceipt::findOrFail((int) $id);

        try {
            $updated = $this->service->updateBySiteEngineer(
                $request->user(),
                $receipt,
                $validated['items'],
                $validated['site_engineer_notes'] ?? null,
            );
        } catch (\RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 409);
        }

        return response()->json(['message' => 'تم حفظ تعديل إذن الاستلام ويمكن اعتماده وإرساله للحسابات.', 'data' => $updated]);
    }

    public function approve(Request $request, string|int $id)
    {
        $validated = $request->validate([
            'site_engineer_notes' => ['nullable', 'string', 'max:3000'],
            'items' => ['nullable', 'array'],
            'items.*.id' => ['required_with:items', 'integer', 'exists:purchase_receipt_items,id'],
            'items.*.received_quantity' => ['required_with:items', 'numeric', 'gte:0'],
            'items.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);
        $receipt = PurchaseReceipt::findOrFail((int) $id);

        try {
            if (! empty($validated['items'])) {
                $receipt = $this->service->updateBySiteEngineer(
                    $request->user(),
                    $receipt,
                    $validated['items'],
                    $validated['site_engineer_notes'] ?? null,
                );
            }

            $approved = $this->service->approveBySiteEngineer(
                $request->user(),
                $receipt,
                $validated['site_engineer_notes'] ?? null,
            );
        } catch (\RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 409);
        }

        return response()->json(['message' => 'تم اعتماد إذن الاستلام وإرساله إلى الحسابات.', 'data' => $approved]);
    }

    public function confirmOfficeReceipt(Request $request, int $purchaseOrderId)
    {
        $validated = $request->validate([
            'notes' => ['nullable', 'string', 'max:3000'],
            'items' => ['nullable', 'array'],
            'items.*.purchase_order_item_id' => ['required_with:items', 'integer', 'exists:purchase_order_items,id'],
            'items.*.received_quantity' => ['required_with:items', 'numeric', 'gte:0'],
            'items.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $purchaseOrder = PurchaseOrder::findOrFail($purchaseOrderId);
        try {
            $receipt = $this->service->confirmByRequester(
                $request->user(),
                $purchaseOrder,
                $validated['items'] ?? [],
                $validated['notes'] ?? null,
            );
        } catch (\RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 409);
        }

        return response()->json([
            'message' => 'تم تأكيد استلام المستلزمات المكتبية بنجاح وإرسال الإشعار للحسابات.',
            'data' => $receipt,
        ], 201);
    }

    public function viewPhoto(Request $request, string|int $id)
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

        $receipt = PurchaseReceipt::with(['purchaseOrder.purchaseRequest.department', 'purchaseOrder.purchaseRequest.targetDepartment', 'purchaseRequest.department', 'purchaseRequest.targetDepartment'])->findOrFail((int) $id);

        // Departmental and Site Isolation:
        // Central roles have global oversight: admin, general_manager, procurement_manager, accountant, warehouse_keeper
        if (! $user->hasAnyRole(['admin', 'general_manager', 'procurement_manager', 'accountant', 'warehouse_keeper'])) {
            $pr = $receipt->purchaseOrder?->purchaseRequest ?: $receipt->purchaseRequest;
            if ($pr) {
                if ($user->hasRole('site_accountant')) {
                    $allowedDepts = ['EXECUTION', 'FINISHING', 'BUILDINGS'];
                    $deptCode = $pr->department?->code ?: $pr->targetDepartment?->code;
                    if ($deptCode && ! in_array($deptCode, $allowedDepts, true)) {
                        abort(403, 'غير مصرح لك باستعراض صور استلام هذا القسم.');
                    }
                } elseif ($user->hasRole('licenses_accountant')) {
                    $deptCode = $pr->department?->code ?: $pr->targetDepartment?->code;
                    if ($deptCode !== 'LICENSES') {
                        abort(403, 'غير مصرح لك باستعراض صور استلام هذا القسم.');
                    }
                } elseif ($user->hasRole('buffet_accountant')) {
                    $deptCode = $pr->department?->code ?: $pr->targetDepartment?->code;
                    if ($deptCode !== 'BUFFET') {
                        abort(403, 'غير مصرح لك باستعراض صور استلام هذا القسم.');
                    }
                } elseif ($user->hasRole('site_engineer')) {
                    if ($receipt->site_engineer_user_id && $receipt->site_engineer_user_id !== $user->id) {
                        abort(403, 'غير مصرح لك باستعراض استلام غير مسند إليك.');
                    }
                } elseif ($user->hasRole('reviewer')) {
                    if ($user->department_id !== $pr->department_id && $user->department_id !== $pr->target_department_id) {
                        abort(403, 'غير مصرح لك باستعراض استلامات أقسام أخرى.');
                    }
                }
            }
        }

        if (! $receipt->photo_path) {
            abort(404, 'لم يتم إرفاق صورة لهذا الإذن.');
        }

        if (filter_var($receipt->photo_path, FILTER_VALIDATE_URL)) {
            return redirect()->away($receipt->photo_path);
        }

        try {
            return \App\Services\StorageService::streamResponse(
                $receipt->photo_path,
                $receipt->photo_name ?: "receipt_{$receipt->id}.jpg",
                $receipt->photo_mime_type ?: 'image/jpeg',
                false
            );
        } catch (\Throwable) {
            abort(404, 'الصورة غير موجودة أو تعذر تحميلها.');
        }
    }
}
