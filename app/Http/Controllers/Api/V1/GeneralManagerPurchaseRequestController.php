<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\GeneralManager\UpdatePurchaseRequestRequest;
use App\Http\Resources\PurchaseRequestResource;
use App\Services\GeneralManagerPurchaseRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class GeneralManagerPurchaseRequestController extends Controller
{
    public function __construct(
        protected GeneralManagerPurchaseRequestService $service
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->query('per_page', 30), 100);
        return PurchaseRequestResource::collection($this->service->getPendingRequests($perPage));
    }

    public function show(Request $request, string|int $id): PurchaseRequestResource
    {
        return new PurchaseRequestResource($this->service->getPendingRequest((int) $id));
    }

    public function update(UpdatePurchaseRequestRequest $request, string|int $id): PurchaseRequestResource
    {
        $validated = $request->validated();

        return new PurchaseRequestResource(
            $this->service->updateRequest($request->user(), $this->service->getPendingRequest((int) $id), $validated)
        );
    }

    public function approve(Request $request, string|int $id): PurchaseRequestResource
    {
        $validated = $request->validate([
            'comment' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        return new PurchaseRequestResource(
            $this->service->approveRequest(
                $request->user(),
                $this->service->getPendingRequest((int) $id),
                $validated['comment'] ?? null
            )
        );
    }

    public function reject(Request $request, string|int $id): PurchaseRequestResource
    {
        $validated = $request->validate([
            'comment' => ['required', 'string', 'min:2', 'max:2000'],
        ]);

        return new PurchaseRequestResource(
            $this->service->rejectRequest(
                $request->user(),
                $this->service->getPendingRequest((int) $id),
                $validated['comment']
            )
        );
    }
}
