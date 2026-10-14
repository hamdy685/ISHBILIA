<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Models\WeighingGroup;
use App\Services\PurchaseReceiptService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class BundleUnmergedSteelPosTest extends TestCase
{
    use RefreshDatabase;

    private User $warehouseKeeper;
    private Supplier $supplierAbboud;
    private Supplier $supplierHassan;
    private Department $dept;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'warehouse_keeper'], [
            'name' => 'Warehouse Keeper',
            'department_id' => null,
            'is_active' => true,
        ]);

        $this->dept = Department::create(['name' => 'إدارة التنفيذ', 'code' => 'EXEC-01']);

        $this->warehouseKeeper = User::create([
            'name' => 'أمين المخزن التجريبي',
            'email' => 'wh_test@alashbiliya.com',
            'password' => Hash::make('password123'),
            'department_id' => $this->dept->id,
            'is_active' => true,
        ]);
        $this->warehouseKeeper->roles()->attach($role->id);

        $this->supplierAbboud = Supplier::create([
            'company_name' => 'عبود',
            'contact_person' => 'عبود',
            'is_active' => true,
        ]);

        $this->supplierHassan = Supplier::create([
            'company_name' => 'حسان',
            'contact_person' => 'حسان',
            'is_active' => true,
        ]);
    }

    public function test_merges_split_orders_into_unified_weighing_groups(): void
    {
        // 1. Setup PR-63 and PO-99, PO-100 (Supplier: عبود)
        $pr63 = PurchaseRequest::create([
            'request_number' => 'PR-63',
            'user_id' => $this->warehouseKeeper->id,
            'requester_user_id' => $this->warehouseKeeper->id,
            'department_id' => $this->dept->id,
            'status' => 'APPROVED',
            'parcel_reference' => 'سقف الارضى ٣٤٩',
            'region' => 'الروضه',
            'date_needed' => now()->toDateString(),
        ]);

        $po99 = PurchaseOrder::create([
            'po_number' => 'PO-99',
            'purchase_request_id' => $pr63->id,
            'department_id' => $this->dept->id,
            'supplier_id' => $this->supplierAbboud->id,
            'created_by_user_id' => $this->warehouseKeeper->id,
            'status' => 'APPROVED',
            'total_amount' => 21580,
            'grand_total' => 21580,
            'is_actual' => true,
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po99->id,
            'item_description' => 'حديد ١٢ مم',
            'specifications' => '50 سيخ 4 لينية',
            'quantity' => 0.52,
            'uom' => 'TON',
            'unit_price' => 41500,
            'line_total' => 0.52 * 41500,
            'supplier_id' => $this->supplierAbboud->id,
            'item_reference' => 'سقف الارضى ٣٤٩',
            'region' => 'الروضه',
        ]);

        $po100 = PurchaseOrder::create([
            'po_number' => 'PO-100',
            'purchase_request_id' => $pr63->id,
            'department_id' => $this->dept->id,
            'supplier_id' => $this->supplierAbboud->id,
            'created_by_user_id' => $this->warehouseKeeper->id,
            'status' => 'APPROVED',
            'total_amount' => 161020,
            'grand_total' => 161020,
            'is_actual' => true,
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po100->id,
            'item_description' => 'حديد ١٠ مم',
            'specifications' => '2 سيخ طرد (1.940 طن)',
            'quantity' => 3.88,
            'uom' => 'TON',
            'unit_price' => 41500,
            'line_total' => 3.88 * 41500,
            'supplier_id' => $this->supplierAbboud->id,
            'item_reference' => 'سقف الارضى ٣٤٩',
            'region' => 'الروضه',
        ]);

        // 2. Setup PR-57 and PO-105, PO-106 (Supplier: حسان)
        $pr57 = PurchaseRequest::create([
            'request_number' => 'PR-57',
            'user_id' => $this->warehouseKeeper->id,
            'requester_user_id' => $this->warehouseKeeper->id,
            'department_id' => $this->dept->id,
            'status' => 'APPROVED',
            'parcel_reference' => 'سقف الاول علوى ٨١٨',
            'region' => 'م ٢٦',
            'date_needed' => now()->toDateString(),
        ]);

        $po105 = PurchaseOrder::create([
            'po_number' => 'PO-105',
            'purchase_request_id' => $pr57->id,
            'department_id' => $this->dept->id,
            'supplier_id' => $this->supplierHassan->id,
            'created_by_user_id' => $this->warehouseKeeper->id,
            'status' => 'APPROVED',
            'total_amount' => 21580,
            'grand_total' => 21580,
            'is_actual' => true,
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po105->id,
            'item_description' => 'حديد ١٢ مم',
            'specifications' => '50 سيخ 4 لينية',
            'quantity' => 0.52,
            'uom' => 'TON',
            'unit_price' => 41500,
            'line_total' => 0.52 * 41500,
            'supplier_id' => $this->supplierHassan->id,
            'item_reference' => 'سقف الاول علوى ٨١٨',
            'region' => 'م ٢٦',
        ]);

        $po106 = PurchaseOrder::create([
            'po_number' => 'PO-106',
            'purchase_request_id' => $pr57->id,
            'department_id' => $this->dept->id,
            'supplier_id' => $this->supplierHassan->id,
            'created_by_user_id' => $this->warehouseKeeper->id,
            'status' => 'APPROVED',
            'total_amount' => 38595,
            'grand_total' => 38595,
            'is_actual' => true,
        ]);

        PurchaseOrderItem::create([
            'purchase_order_id' => $po106->id,
            'item_description' => 'حديد ١٠ مم',
            'specifications' => '125 سيخ 3 لينية',
            'quantity' => 0.93,
            'uom' => 'TON',
            'unit_price' => 41500,
            'line_total' => 0.93 * 41500,
            'supplier_id' => $this->supplierHassan->id,
            'item_reference' => 'سقف الاول علوى ٨١٨',
            'region' => 'م ٢٦',
        ]);

        // 3. Execute Migration
        $migration = require database_path('migrations/2026_10_14_200000_bundle_unmerged_steel_pos_into_weighing_groups.php');
        $migration->up();

        // 4. Verify PO-100 and PO-106 are VOIDED
        $po100->refresh();
        $this->assertEquals('VOIDED', $po100->status);

        $po106->refresh();
        $this->assertEquals('VOIDED', $po106->status);

        // 5. Verify PO-99 has WeighingGroup of 4.40 tons
        $po99->refresh();
        $wg99 = WeighingGroup::where('purchase_order_id', $po99->id)->first();
        $this->assertNotNull($wg99);
        $this->assertEquals(4.40, (float) $wg99->total_ordered_weight);
        $this->assertEquals(2, $wg99->items->count());
        $this->assertEquals(41500.0, (float) $wg99->unit_price);
        $this->assertEquals(182600.0, (float) $wg99->total_amount); // 4.40 * 41500

        // 6. Verify PO-105 has WeighingGroup of 1.45 tons
        $po105->refresh();
        $wg105 = WeighingGroup::where('purchase_order_id', $po105->id)->first();
        $this->assertNotNull($wg105);
        $this->assertEquals(1.45, (float) $wg105->total_ordered_weight);
        $this->assertEquals(2, $wg105->items->count());
        $this->assertEquals(41500.0, (float) $wg105->unit_price);
        $this->assertEquals(60175.0, (float) $wg105->total_amount); // 1.45 * 41500

        // 7. Verify Warehouse Queue
        $queue = app(PurchaseReceiptService::class)->warehouseQueue($this->warehouseKeeper);
        $queuePoNumbers = $queue->pluck('po_number')->all();

        // Must contain PO-99 and PO-105
        $this->assertContains('PO-99', $queuePoNumbers);
        $this->assertContains('PO-105', $queuePoNumbers);

        // Must NOT contain VOIDED PO-100 or PO-106
        $this->assertNotContains('PO-100', $queuePoNumbers);
        $this->assertNotContains('PO-106', $queuePoNumbers);
    }
}
