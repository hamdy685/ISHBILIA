<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use App\Models\ShipmentGroup;
use App\Services\SharedShipmentGroupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SharedShipmentGroupController extends Controller
{
    public function __construct(
        protected SharedShipmentGroupService $shipmentService
    ) {}

    /**
     * List eligible items in a PO that can be added to a shared shipment.
     */
    public function eligibleItems(Request $request, int $poId): JsonResponse
    {
        $po = PurchaseOrder::findOrFail($poId);
        $eligible = $this->shipmentService->getEligibleShipmentItems($po, $request->user());

        return response()->json([
            'purchase_order_id' => $po->id,
            'po_number'         => $po->po_number,
            'supplier_id'       => $po->supplier_id,
            'items'             => $eligible,
            'count'             => count($eligible),
        ]);
    }

    /**
     * List all shipment groups for a Purchase Order.
     */
    public function byPurchaseOrder(int $poId): JsonResponse
    {
        $groups = ShipmentGroup::with([
            'items',
            'supplier',
            'createdBy',
        ])
            ->where('purchase_order_id', $poId)
            ->orderBy('id', 'desc')
            ->get();

        return response()->json([
            'data' => $groups,
        ]);
    }

    /**
     * Show details of a specific shipment group.
     */
    public function show(int $id): JsonResponse
    {
        $group = ShipmentGroup::with([
            'items',
            'supplier',
            'purchaseOrder.purchaseRequest',
            'createdBy',
        ])->findOrFail($id);

        return response()->json([
            'data' => $group,
        ]);
    }

    /**
     * Create a new shared shipment group.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'purchase_order_id'    => 'required|integer|exists:purchase_orders,id',
            'item_ids'             => 'required|array|min:1',
            'item_ids.*'           => 'required|integer|exists:purchase_order_items,id',
            'group_name'           => 'nullable|string|max:255',
            'vehicle_plate_number' => 'nullable|string|max:50',
            'notes'                => 'nullable|string|max:1000',
        ]);

        $group = $this->shipmentService->createShipmentGroup(
            $request->user(),
            (int) $validated['purchase_order_id'],
            $validated['item_ids'],
            $validated['group_name'] ?? null,
            $validated['notes'] ?? null,
            $validated['vehicle_plate_number'] ?? null
        );

        return response()->json([
            'message' => 'تم إنشاء مجموعة الشحنة المشتركة بنجاح وجاهزة للتوريد والاستلام كشحنة واحدة.',
            'data'    => $group,
        ], 201);
    }

    /**
     * Safely un-group a shipment group and detach items.
     */
    public function ungroup(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $group = $this->shipmentService->ungroupShipmentGroup(
            $request->user(),
            $id,
            $validated['reason'] ?? null
        );

        return response()->json([
            'message' => 'تم فك دمج الشحنة المشتركة بنجاح وإعادة البنود كبنود مستقلة.',
            'data'    => $group,
        ]);
    }
}
