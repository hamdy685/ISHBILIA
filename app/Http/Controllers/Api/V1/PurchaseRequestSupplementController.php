<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestSupplement;
use App\Services\PurchaseRequestSupplementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PurchaseRequestSupplementController extends Controller
{
    public function __construct(
        protected PurchaseRequestSupplementService $service
    ) {}

    /**
     * Get requests that are eligible for a supplement (issued/active but not received).
     */
    public function eligibleRequests(Request $request): JsonResponse
    {
        $perPage = (int) $request->integer('per_page', 15);
        $paginator = $this->service->getEligibleRequests($request->user(), $perPage);

        return response()->json($paginator);
    }

    /**
     * List supplements for a specific Purchase Request.
     */
    public function index(Request $request, int $id): JsonResponse
    {
        $pr = PurchaseRequest::findOrFail($id);

        $supplements = $pr->supplements()
            ->with(['items.item', 'requester', 'reviewer', 'procurementManager', 'supplier', 'purchaseOrder'])
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => $supplements,
            'can_accept_supplement' => $pr->canAcceptSupplement(),
        ]);
    }

    /**
     * Create a supplement on the purchase request.
     */
    public function store(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'items.*.item_description' => ['required', 'string', 'max:255'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.uom' => ['nullable', 'string', 'max:30'],
            'items.*.estimated_unit_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.item_reference' => ['nullable', 'string', 'max:100'],
            'items.*.region' => ['nullable', 'string', 'max:100'],
            'items.*.specifications' => ['nullable', 'string', 'max:1000'],
            'items.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $pr = PurchaseRequest::findOrFail($id);

        $supplement = $this->service->createSupplement(
            $pr,
            $request->user(),
            $validated['items'],
            $validated['notes'] ?? null
        );

        return response()->json([
            'message' => 'تم إنشاء طلب الكمالة بنجاح.',
            'data' => $supplement,
        ], 201);
    }

    /**
     * Reviewer approves the supplement.
     */
    public function approveReviewer(Request $request, int $supplementId): JsonResponse
    {
        $validated = $request->validate([
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $supplement = PurchaseRequestSupplement::with('purchaseRequest')->findOrFail($supplementId);

        $user = $request->user();
        if (! $user->hasAnyRole(['admin', 'reviewer', 'general_manager'])) {
            return response()->json(['message' => 'غير مصرح لك باعتماد طلبات كمالة الأقسام.'], 403);
        }

        $result = $this->service->approveByReviewer(
            $supplement,
            $user,
            $validated['notes'] ?? null
        );

        return response()->json([
            'message' => 'تم اعتماد طلب الكمالة من قِبل مراجع القسم وتوجيهه للمشتريات.',
            'data' => $result,
        ]);
    }

    /**
     * Procurement Manager processes the supplement:
     * Assigns supplier (same or different) and prices items.
     */
    public function processProcurement(Request $request, int $supplementId): JsonResponse
    {
        $validated = $request->validate([
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'merge_to_existing_po' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items_pricing' => ['nullable', 'array'],
            'items_pricing.*.pr_item_id' => ['required', 'integer', 'exists:purchase_request_items,id'],
            'items_pricing.*.unit_price' => ['required', 'numeric', 'min:0'],
        ]);

        $supplement = PurchaseRequestSupplement::with('purchaseRequest')->findOrFail($supplementId);

        $user = $request->user();
        if (! $user->hasAnyRole(['admin', 'procurement_manager'])) {
            return response()->json(['message' => 'غير مصرح لك بمعالجة وتوجيه المشتريات للكمالة.'], 403);
        }

        $result = $this->service->processByProcurement(
            $supplement,
            $user,
            (int) $validated['supplier_id'],
            $validated['items_pricing'] ?? [],
            $validated['notes'] ?? null,
            (bool) ($validated['merge_to_existing_po'] ?? true)
        );

        return response()->json([
            'message' => 'تمت معالجة وإصدار أمر الشراء التكميلي بنجاح وإرساله للاستلام والحسابات.',
            'data' => $result,
        ]);
    }
}
