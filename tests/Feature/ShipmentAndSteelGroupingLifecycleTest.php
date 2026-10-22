<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\ShipmentGroup;
use App\Models\Supplier;
use App\Models\User;
use App\Models\WeighingGroup;
use App\Services\SharedShipmentGroupService;
use App\Services\SteelWeighingGroupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ShipmentAndSteelGroupingLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private User $procurementManager;
    private User $siteEngineer;
    private Supplier $supplier;
    private Department $dept;
    private PurchaseRequest $purchaseRequest;
    private PurchaseOrder $purchaseOrder;

    protected function setUp(): void
    {
        parent::setUp();

        $pmRole = Role::firstOrCreate(['slug' => 'procurement_manager'], [
            'name' => 'Procurement Manager',
            'is_active' => true,
        ]);
        $seRole = Role::firstOrCreate(['slug' => 'site_engineer'], [
            'name' => 'Site Engineer',
            'is_active' => true,
        ]);

        $this->dept = Department::create(['name' => 'إدارة التنفيذ', 'code' => 'EXEC-01']);

        $this->procurementManager = User::create([
            'name' => 'مدير المشتريات التجريبي',
            'email' => 'pm_lifecycle@alashbiliya.com',
            'password' => Hash::make('secret123'),
            'department_id' => $this->dept->id,
            'is_active' => true,
        ]);
        $this->procurementManager->roles()->attach($pmRole->id);

        $this->siteEngineer = User::create([
            'name' => 'مهندس الموقع التجريبي',
            'email' => 'se_lifecycle@alashbiliya.com',
            'password' => Hash::make('secret123'),
            'department_id' => $this->dept->id,
            'is_active' => true,
        ]);
        $this->siteEngineer->roles()->attach($seRole->id);

        $this->supplier = Supplier::create([
            'company_name' => 'شركة توريدات متحدة',
            'contact_person' => 'مسؤول المبيعات',
            'is_active' => true,
        ]);

        $this->purchaseRequest = PurchaseRequest::create([
            'request_number' => 'PR-' . uniqid(),
            'user_id' => $this->procurementManager->id,
            'requester_user_id' => $this->procurementManager->id,
            'department_id' => $this->dept->id,
            'status' => 'APPROVED',
            'date_needed' => now()->toDateString(),
        ]);

        $this->purchaseOrder = PurchaseOrder::create([
            'po_number' => 'PO-' . uniqid(),
            'purchase_request_id' => $this->purchaseRequest->id,
            'department_id' => $this->dept->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'APPROVED',
            'total_amount' => 500000,
            'grand_total' => 500000,
        ]);
    }

    /**
     * 1. دورة حياة مجموعة الشحنة المشتركة:
     * إنشاء الشحنة، ترقيمها المتسلسل، تحديث حالتها عند الاستلام، وفك الدمج
     */
    public function test_shared_shipment_group_full_lifecycle(): void
    {
        $service = app(SharedShipmentGroupService::class);

        // إنشاء بندين مختلفين (رمل + سن) على نفس أمر الشراء
        $sand = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'رمل حرش مباني',
            'quantity' => 20,
            'uom' => 'M3',
            'unit_price' => 180,
            'line_total' => 3600,
            'supplier_id' => $this->supplier->id,
        ]);

        $gravel = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'سن 1 خرسانة',
            'quantity' => 15,
            'uom' => 'M3',
            'unit_price' => 220,
            'line_total' => 3300,
            'supplier_id' => $this->supplier->id,
        ]);

        // 1. تجميع البندين كشحنة مشتركة واحدة
        $group = $service->createShipmentGroup(
            $this->procurementManager,
            $this->purchaseOrder->id,
            [$sand->id, $gravel->id],
            'نقلة مواد رديم وخليط خرسانة',
            'شحنة تريلا مشتركة',
            'أ ب ج 1234'
        );

        $this->assertInstanceOf(ShipmentGroup::class, $group);
        $this->assertEquals('PENDING_DELIVERY', $group->status);
        $this->assertStringStartsWith('SHP-', $group->group_number);

        // التأكد من ربط البنود بالشحنة في قاعدة البيانات
        $sand->refresh();
        $gravel->refresh();
        $this->assertEquals($group->id, $sand->shipment_group_id);
        $this->assertEquals($group->id, $gravel->shipment_group_id);

        // 2. محاكاة استلام جزئي للبند الأول (10 م3 من 20 م3)
        $receipt = PurchaseReceipt::create([
            'receipt_number' => 'REC-' . uniqid(),
            'purchase_order_id' => $this->purchaseOrder->id,
            'status' => 'APPROVED',
        ]);
        \App\Models\PurchaseReceiptItem::create([
            'purchase_receipt_id' => $receipt->id,
            'purchase_order_item_id' => $sand->id,
            'received_quantity' => 10,
            'ordered_quantity' => 20,
        ]);

        $status = $service->updateShipmentStatus($group);
        $group->refresh();
        $this->assertEquals('PARTIALLY_RECEIVED', $status);
        $this->assertEquals('PARTIALLY_RECEIVED', $group->status);

        // لا يمكن فك الدمج بعد بدء الاستلام
        $this->expectException(ValidationException::class);
        $service->ungroupShipmentGroup($this->procurementManager, $group->id, 'محاولة فك بعد الاستلام');
    }

    /**
     * فك دمج الشحنة بنجاح قبل الاستلام
     */
    public function test_shared_shipment_ungroup_before_receipt(): void
    {
        $service = app(SharedShipmentGroupService::class);

        $item1 = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'أسمنت بورتلاندي عادي',
            'quantity' => 10,
            'uom' => 'TON',
            'unit_price' => 2400,
            'line_total' => 24000,
            'supplier_id' => $this->supplier->id,
        ]);

        $item2 = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'جبس بياض',
            'quantity' => 5,
            'uom' => 'TON',
            'unit_price' => 1500,
            'line_total' => 7500,
            'supplier_id' => $this->supplier->id,
        ]);

        $group = $service->createShipmentGroup(
            $this->procurementManager,
            $this->purchaseOrder->id,
            [$item1->id, $item2->id],
            'شحنة لوازم بياض ومحارة'
        );

        $this->assertEquals('PENDING_DELIVERY', $group->status);

        // فك الدمج
        $result = $service->ungroupShipmentGroup($this->procurementManager, $group->id, 'إلغاء التنسيق المشترك بناء على رغبة المورد');

        $this->assertInstanceOf(ShipmentGroup::class, $result);
        $this->assertEquals('CANCELLED', $result->status);

        $item1->refresh();
        $item2->refresh();
        $this->assertNull($item1->shipment_group_id);
        $this->assertNull($item2->shipment_group_id);

        $group->refresh();
        $this->assertEquals('CANCELLED', $group->status);
    }

    /**
     * 2. دورة حياة وزنة حديد التسليح:
     * التحقق من عدم قبول أصناف غير حديدية، اشتراط توحيد سعر الطن، تجميع الوزن، وفك الدمج
     */
    public function test_steel_weighing_group_lifecycle_and_constraints(): void
    {
        $steelService = app(SteelWeighingGroupService::class);

        $rebar12 = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'حديد تسليح 12 مم أطوال',
            'quantity' => 3.5,
            'uom' => 'TON',
            'unit_price' => 38000,
            'line_total' => 133000,
            'supplier_id' => $this->supplier->id,
        ]);

        $rebar16 = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'حديد تسليح 16 مم أطوال',
            'quantity' => 4.5,
            'uom' => 'TON',
            'unit_price' => 38000, // نفس السعر الموحد للطن
            'line_total' => 171000,
            'supplier_id' => $this->supplier->id,
        ]);

        $cement = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'أسمنت معبأ',
            'quantity' => 10,
            'uom' => 'TON',
            'unit_price' => 38000,
            'line_total' => 380000,
            'supplier_id' => $this->supplier->id,
        ]);

        // أ) التحقق من رفض دمج بنود غير حديدية
        $this->expectException(ValidationException::class);
        $steelService->createWeighingGroup(
            $this->procurementManager,
            $this->purchaseOrder->id,
            [$rebar12->id, $cement->id]
        );
    }

    public function test_steel_weighing_group_creation_and_ungroup(): void
    {
        $steelService = app(SteelWeighingGroupService::class);

        $rebar10 = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'حديد تسليح 10 مم 3 لينيا',
            'quantity' => 2.0,
            'uom' => 'TON',
            'unit_price' => 38500,
            'line_total' => 77000,
            'supplier_id' => $this->supplier->id,
        ]);

        $rebar12 = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'حديد تسليح 12 مم 4 لينيا',
            'quantity' => 3.0,
            'uom' => 'TON',
            'unit_price' => 38500, // نفس السعر الموحد للطن
            'line_total' => 115500,
            'supplier_id' => $this->supplier->id,
        ]);

        // إنشاء وزنة حديد مجمعة
        $wg = $steelService->createWeighingGroup(
            $this->procurementManager,
            $this->purchaseOrder->id,
            [$rebar10->id, $rebar12->id]
        );

        $this->assertInstanceOf(WeighingGroup::class, $wg);
        $this->assertEquals(5.0, (float) $wg->total_ordered_weight);
        $this->assertEquals(38500, (float) $wg->unit_price);
        $this->assertEquals('PENDING_RECEIPT', $wg->status);

        // فك دمج وزنة الحديد بنجاح
        $result = $steelService->ungroupWeighingGroup($this->procurementManager, $wg->id, 'تعديل قطاعات الحديد المطلوبة');
        $this->assertInstanceOf(WeighingGroup::class, $result);
        $this->assertEquals('CANCELLED', $result->status);

        $wg->refresh();
        $this->assertEquals('CANCELLED', $wg->status);
    }

    /**
     * 3. التحقق من منع التضارب بين الخاصيتين:
     * لا يمكن ضم بند في وزنة حديد إلى شحنة مشتركة، والعكس صحيح
     */
    public function test_cross_feature_conflict_prevention(): void
    {
        $shipmentService = app(SharedShipmentGroupService::class);
        $steelService = app(SteelWeighingGroupService::class);

        $item1 = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'حديد تسليح 14 مم',
            'quantity' => 4.0,
            'uom' => 'TON',
            'unit_price' => 39000,
            'line_total' => 156000,
            'supplier_id' => $this->supplier->id,
        ]);

        $item2 = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'حديد تسليح 16 مم',
            'quantity' => 6.0,
            'uom' => 'TON',
            'unit_price' => 39000,
            'line_total' => 234000,
            'supplier_id' => $this->supplier->id,
        ]);

        // أ) إنشاء وزنة حديد أولاً
        $wg = $steelService->createWeighingGroup(
            $this->procurementManager,
            $this->purchaseOrder->id,
            [$item1->id, $item2->id]
        );

        $this->assertNotNull($wg);

        // محاولة إضافة نفس البند إلى شحنة مشتركة يجب أن تُرفض
        $this->expectException(ValidationException::class);
        $shipmentService->createShipmentGroup(
            $this->procurementManager,
            $this->purchaseOrder->id,
            [$item1->id],
            'محاولة دمج بند حديد مجمع في شحنة'
        );
    }

    /**
     * التحقق من منع ضم بند في شحنة مشتركة إلى وزنة حديد
     */
    public function test_cross_feature_conflict_shipment_to_weighing(): void
    {
        $shipmentService = app(SharedShipmentGroupService::class);
        $steelService = app(SteelWeighingGroupService::class);

        $item1 = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'حديد تسليح 18 مم',
            'quantity' => 5.0,
            'uom' => 'TON',
            'unit_price' => 39000,
            'line_total' => 195000,
            'supplier_id' => $this->supplier->id,
        ]);

        $item2 = PurchaseOrderItem::create([
            'purchase_order_id' => $this->purchaseOrder->id,
            'item_description' => 'حديد تسليح 22 مم',
            'quantity' => 5.0,
            'uom' => 'TON',
            'unit_price' => 39000,
            'line_total' => 195000,
            'supplier_id' => $this->supplier->id,
        ]);

        // ضم البند أولاً في شحنة مشتركة
        $sg = $shipmentService->createShipmentGroup(
            $this->procurementManager,
            $this->purchaseOrder->id,
            [$item1->id],
            'شحنة حديد مشتركة'
        );

        $this->assertNotNull($sg);

        // محاولة دمج البند في وزنة حديد يجب أن تُرفض بـ ValidationException
        $this->expectException(ValidationException::class);
        $steelService->createWeighingGroup(
            $this->procurementManager,
            $this->purchaseOrder->id,
            [$item1->id, $item2->id]
        );
    }
}
