<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PurchaseRequestResource;
use App\Http\Resources\SupplierResource;
use App\Models\PurchaseRequest;
use App\Services\AccountingPurchaseRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AccountingPurchaseRequestController extends Controller
{
    public function __construct(
        protected AccountingPurchaseRequestService $service
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->query('per_page', 50), 100);
        return PurchaseRequestResource::collection($this->service->getPendingRequests($perPage, $request->user()));
    }

    public function suppliers(): AnonymousResourceCollection
    {
        return SupplierResource::collection($this->service->getActiveSuppliers());
    }

    public function approve(Request $request, string|int $id): JsonResponse
    {
        $validated = $request->validate([
            'comment' => ['nullable', 'string', 'max:2000'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'financial_data' => ['sometimes', 'nullable', 'array'],
        ]);

        $comment = $validated['comment']
            ?? $validated['notes']
            ?? ($validated['financial_data']['notes'] ?? null);

        $purchaseRequest = PurchaseRequest::findOrFail((int) $id);

        try {
            $approved = $this->service->approveRequest(
                $request->user(),
                $purchaseRequest,
                [],
                $comment,
            );
        } catch (\RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 409);
        }

        return response()->json([
            'message' => 'وافقت الإدارة المالية على الطلب وأعادته إلى مدير المشتريات لإنشاء أمر الشراء.',
            'data' => new PurchaseRequestResource($approved),
        ]);
    }

    public function reject(Request $request, string|int $id): JsonResponse
    {
        $validated = $request->validate([
            'comment' => ['required', 'string', 'min:3', 'max:2000'],
        ]);
        $purchaseRequest = PurchaseRequest::findOrFail((int) $id);

        try {
            $rejected = $this->service->rejectRequest(
                $request->user(),
                $purchaseRequest,
                $validated['comment'],
            );
        } catch (\RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 409);
        }

        return response()->json([
            'message' => 'رفضت الحسابات الطلب المالي المباشر.',
            'data' => new PurchaseRequestResource($rejected),
        ]);
    }
}
