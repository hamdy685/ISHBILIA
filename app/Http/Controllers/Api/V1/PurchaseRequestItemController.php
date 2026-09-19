<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\PurchaseRequestItem\StorePurchaseRequestItemRequest;
use App\Http\Requests\PurchaseRequestItem\UpdatePurchaseRequestItemRequest;
use App\Http\Resources\PurchaseRequestResource;
use App\Models\AuditLog;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Policies\PurchaseRequestItemPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PurchaseRequestItemController extends Controller
{
    protected PurchaseRequestItemPolicy $policy;

    public function __construct(PurchaseRequestItemPolicy $policy)
    {
        $this->policy = $policy;
    }

    /**
     * Add a line item to a purchase request.
     */
    public function store(StorePurchaseRequestItemRequest $request, string|int $id): JsonResponse
    {
        $user = $request->user();
        $pr = PurchaseRequest::findOrFail((int) $id);

        if (! $this->policy->create($user, $pr)) {
            return response()->json([
                'message' => 'ليس لديك صلاحية لإضافة بنود لهذا الطلب في حالته الحالية.',
            ], 403);
        }

        $validated = $request->validated();
        $quantity = (float) $validated['quantity'];
        $unitPrice = array_key_exists('estimated_unit_price', $validated) && $validated['estimated_unit_price'] !== null
            ? (float) $validated['estimated_unit_price']
            : null;
        $lineTotal = ($unitPrice !== null) ? round($quantity * $unitPrice, 2) : null;

        $pr = DB::transaction(function () use ($user, $pr, $validated, $quantity, $unitPrice, $lineTotal) {
            $lockedPr = PurchaseRequest::where('id', $pr->id)->lockForUpdate()->firstOrFail();

            $item = $lockedPr->items()->create([
                'item_id' => $validated['item_id'] ?? null,
                'supplier_id' => $validated['supplier_id'] ?? null,
                'item_description' => $validated['item_description'],
                'item_reference' => $validated['item_reference'] ?? $lockedPr->parcel_reference,
                'region' => $validated['region'] ?? $lockedPr->region,
                'quantity' => $quantity,
                'uom' => $validated['uom'] ?? 'PCS',
                'estimated_unit_price' => $unitPrice,
                'estimated_line_total' => $lineTotal,
                'specifications' => $validated['specifications'] ?? null,
                'notes' => $validated['notes'] ?? null,
            ]);

            AuditLog::create([
                'user_id' => $user->id,
                'entity_type' => PurchaseRequestItem::class,
                'entity_id' => $item->id,
                'action' => 'ITEM_ADDED',
                'field_name' => 'item_description',
                'old_value' => null,
                'new_value' => $item->item_description,
            ]);

            $this->recalculateTotalCost($lockedPr);

            return $lockedPr;
        });

        $this->loadRelations($pr);

        return (new PurchaseRequestResource($pr))
            ->additional(['message' => 'تمت إضافة البند بنجاح.'])
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Update an existing line item on a purchase request.
     */
    public function update(UpdatePurchaseRequestItemRequest $request, string|int $id, string|int $itemId): JsonResponse
    {
        $user = $request->user();
        $pr = PurchaseRequest::findOrFail((int) $id);
        $item = PurchaseRequestItem::where('purchase_request_id', $pr->id)->findOrFail((int) $itemId);

        if (! $this->policy->update($user, $item)) {
            return response()->json([
                'message' => 'ليس لديك صلاحية لتعديل هذا البند في حالته الحالية.',
            ], 403);
        }

        $validated = $request->validated();

        $pr = DB::transaction(function () use ($user, $pr, $item, $validated) {
            $lockedPr = PurchaseRequest::where('id', $pr->id)->lockForUpdate()->firstOrFail();
            $lockedItem = PurchaseRequestItem::where('id', $item->id)->lockForUpdate()->firstOrFail();

            $oldDesc = $lockedItem->item_description;
            $quantity = array_key_exists('quantity', $validated) ? (float) $validated['quantity'] : (float) $lockedItem->quantity;
            $unitPrice = array_key_exists('estimated_unit_price', $validated)
                ? ($validated['estimated_unit_price'] !== null ? (float) $validated['estimated_unit_price'] : null)
                : ($lockedItem->estimated_unit_price !== null ? (float) $lockedItem->estimated_unit_price : null);
            $lineTotal = ($unitPrice !== null) ? round($quantity * $unitPrice, 2) : null;

            $updateData = [
                'quantity' => $quantity,
                'estimated_unit_price' => $unitPrice,
                'estimated_line_total' => $lineTotal,
            ];

            if (array_key_exists('item_description', $validated)) {
                $updateData['item_description'] = $validated['item_description'];
            }
            if (array_key_exists('item_id', $validated)) {
                $updateData['item_id'] = $validated['item_id'];
            }
            if (array_key_exists('supplier_id', $validated)) {
                $updateData['supplier_id'] = $validated['supplier_id'];
            }
            if (array_key_exists('item_reference', $validated)) {
                $updateData['item_reference'] = $validated['item_reference'];
            }
            if (array_key_exists('region', $validated)) {
                $updateData['region'] = $validated['region'];
            }
            if (array_key_exists('uom', $validated)) {
                $updateData['uom'] = $validated['uom'];
            }
            if (array_key_exists('specifications', $validated)) {
                $updateData['specifications'] = $validated['specifications'];
            }
            if (array_key_exists('notes', $validated)) {
                $updateData['notes'] = $validated['notes'];
            }

            $lockedItem->update($updateData);

            AuditLog::create([
                'user_id' => $user->id,
                'entity_type' => PurchaseRequestItem::class,
                'entity_id' => $lockedItem->id,
                'action' => 'ITEM_UPDATED',
                'field_name' => 'item_description',
                'old_value' => $oldDesc,
                'new_value' => $lockedItem->item_description,
            ]);

            $this->recalculateTotalCost($lockedPr);

            return $lockedPr;
        });

        $this->loadRelations($pr);

        return (new PurchaseRequestResource($pr))
            ->additional(['message' => 'تم تعديل البند بنجاح.'])
            ->response()
            ->setStatusCode(200);
    }

    /**
     * Delete a line item from a purchase request.
     */
    public function destroy(Request $request, string|int $id, string|int $itemId): JsonResponse
    {
        $user = $request->user();
        $pr = PurchaseRequest::findOrFail((int) $id);
        $item = PurchaseRequestItem::where('purchase_request_id', $pr->id)->findOrFail((int) $itemId);

        if (! $this->policy->delete($user, $item)) {
            return response()->json([
                'message' => 'ليس لديك صلاحية لحذف هذا البند في حالته الحالية.',
            ], 403);
        }

        $pr = DB::transaction(function () use ($user, $pr, $item) {
            $lockedPr = PurchaseRequest::where('id', $pr->id)->lockForUpdate()->firstOrFail();
            $lockedItem = PurchaseRequestItem::where('id', $item->id)->lockForUpdate()->firstOrFail();

            // Cascade: delete any purchase order item references
            PurchaseOrderItem::where('pr_item_id', $lockedItem->id)->delete();

            AuditLog::create([
                'user_id' => $user->id,
                'entity_type' => PurchaseRequestItem::class,
                'entity_id' => $lockedItem->id,
                'action' => 'ITEM_REMOVED',
                'field_name' => 'item_description',
                'old_value' => $lockedItem->item_description,
                'new_value' => null,
            ]);

            $lockedItem->delete();

            $this->recalculateTotalCost($lockedPr);

            return $lockedPr;
        });

        $this->loadRelations($pr);

        return (new PurchaseRequestResource($pr))
            ->additional(['message' => 'تم حذف البند بنجاح.'])
            ->response()
            ->setStatusCode(200);
    }

    /**
     * Recalculate total estimated cost for direct procurement or when pricing is present.
     */
    protected function recalculateTotalCost(PurchaseRequest $pr): void
    {
        $totalCost = $pr->items()->sum(DB::raw('COALESCE(estimated_line_total, quantity * estimated_unit_price, 0)'));
        
        if ($pr->procurement_route === 'DIRECT' || $totalCost > 0 || (float) $pr->total_estimated_cost > 0) {
            $pr->total_estimated_cost = round((float) ($totalCost ?? 0), 2);
            $pr->save();
        }
    }

    /**
     * Eager-load relations needed by PurchaseRequestResource.
     */
    protected function loadRelations(PurchaseRequest $pr): void
    {
        $pr->load([
            'requester.roles',
            'department',
            'targetDepartment.manager',
            'targetDepartment.siteEngineer',
            'assignedReviewer',
            'siteEngineer',
            'items.item',
            'items.supplier',
            'approvalHistory.actor',
            'quotes.supplier',
            'quotes.recommendations',
            'directSupplier',
        ]);
    }
}
