<?php

namespace Tests\Feature;

use App\Http\Resources\PurchaseOrderItemResource;
use App\Http\Resources\PurchaseRequestItemResource;
use App\Models\Department;
use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseReceiptItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Services\PurchaseReceiptService;
use App\Support\DecimalHelper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DecimalPrecisionAcrossWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $warehouseKeeper;
    protected User $siteEngineer;
    protected Department $department;
    protected Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();

        $adminRole = Role::firstOrCreate(['slug' => 'admin'], ['name' => 'Admin']);
        $warehouseRole = Role::firstOrCreate(['slug' => 'warehouse_keeper'], ['name' => 'Warehouse Keeper']);
        $engineerRole = Role::firstOrCreate(['slug' => 'site_engineer'], ['name' => 'Site Engineer']);

        $this->department = Department::create([
            'name' => 'التنفيذ',
            'code' => 'EXEC',
            'is_active' => true,
        ]);

        $this->admin = User::create([
            'name' => 'Admin Test',
            'email' => 'admin_prec@example.com',
            'password' => bcrypt('password'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->admin->roles()->sync([$adminRole->id]);

        $this->siteEngineer = User::create([
            'name' => 'Site Engineer Test',
            'email' => 'engineer_prec@example.com',
            'password' => bcrypt('password'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->siteEngineer->roles()->sync([$engineerRole->id]);

        $this->warehouseKeeper = User::create([
            'name' => 'Warehouse Keeper Test',
            'email' => 'keeper_prec@example.com',
            'password' => bcrypt('password'),
            'department_id' => $this->department->id,
            'is_active' => true,
        ]);
        $this->warehouseKeeper->roles()->sync([$warehouseRole->id]);

        $this->supplier = Supplier::create([
            'company_name' => 'شركة التوريدات الدقيقة',
            'contact_name' => 'مسؤول التوريد',
            'phone' => '01000000000',
            'is_active' => true,
        ]);
    }

    /**
     * Test DecimalHelper formatting rules for all mandatory test values:
     * 1.165, 1.164, 1.155, 1.125, 10.005, 0.001, 100.000
     */
    public function test_decimal_helper_formats_exact_values_without_rounding_or_trailing_zeros(): void
    {
        $cases = [
            ['1.165',   '1.165'],
            ['1.164',   '1.164'],
            ['1.155',   '1.155'],
            ['1.125',   '1.125'],
            ['10.005',  '10.005'],
            ['0.001',   '0.001'],
            ['100.000', '100'],
            [1.165,     '1.165'],
            [1.164,     '1.164'],
            [1.155,     '1.155'],
            [1.125,     '1.125'],
            [10.005,    '10.005'],
            [0.001,     '0.001'],
            [100.000,   '100'],
        ];

        foreach ($cases as [$input, $expected]) {
            $formatted = DecimalHelper::formatCleanDecimal($input, 4);
            $this->assertSame($expected, $formatted, "Failed for value: {$input}");
        }
    }

    /**
     * Test storing and retrieving exact decimal quantities and prices in PurchaseOrderItem
     */
    public function test_purchase_order_item_preserves_exact_decimal_precision_in_db_and_model(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-PREC-01',
            'department_id' => $this->department->id,
            'user_id' => $this->admin->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'status' => 'APPROVED',
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-PREC-01',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->admin->id,
            'status' => 'ISSUED',
        ]);

        $testQuantities = ['1.165', '1.164', '1.155', '1.125', '10.005', '0.001', '100.000'];

        foreach ($testQuantities as $idx => $val) {
            $item = PurchaseOrderItem::create([
                'purchase_order_id' => $po->id,
                'item_description' => "بند تجربة {$idx}",
                'quantity' => $val,
                'unit_price' => '10.005',
                'uom' => 'TON',
            ]);

            // Refresh fresh from database
            $item->refresh();

            // Verify the model accessor returns exact string without rounding to 1.17
            $expectedDisplay = DecimalHelper::formatCleanDecimal($val, 4);
            $this->assertSame($expectedDisplay, (string) $item->quantity, "Model attribute quantity failed for {$val}");
            $this->assertSame('10.005', (string) $item->unit_price, "Model attribute unit_price failed");

            // Verify calculation: line_total = round(qty * unit_price, 2)
            $expectedLineTotal = round(((float) $val) * 10.005, 2);
            $this->assertEquals($expectedLineTotal, (float) $item->line_total, "Line total calculation failed for {$val}");

            // Verify API Resource formatting
            $resource = (new PurchaseOrderItemResource($item))->toArray(request());
            $this->assertSame($expectedDisplay, $resource['quantity'], "Resource quantity failed for {$val}");
            $this->assertSame('10.005', $resource['unit_price'], "Resource unit_price failed");
        }
    }

    /**
     * Test full receipt lifecycle preserving exact 1.165 precision
     */
    public function test_purchase_receipt_preserves_exact_decimal_precision(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-PREC-02',
            'department_id' => $this->department->id,
            'user_id' => $this->admin->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'status' => 'APPROVED',
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-PREC-02',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->admin->id,
            'status' => 'ISSUED',
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'حديد تسليح عالي المقاومة',
            'quantity' => '1.165',
            'unit_price' => '42150.25',
            'uom' => 'TON',
        ]);

        $service = app(PurchaseReceiptService::class);
        $receipt = $service->createByWarehouse(
            $this->warehouseKeeper,
            $po,
            [
                [
                    'purchase_order_item_id' => $poItem->id,
                    'received_quantity' => 1.165,
                    'notes' => 'استلام كامل بدقة 1.165 طن',
                ]
            ],
            now()->toDateString(),
            'ملاحظات إذن الاستلام'
        );

        $receiptItem = $receipt->items()->first();
        $this->assertNotNull($receiptItem);

        // Verify fresh from DB
        $receiptItem->refresh();
        $this->assertSame('1.165', (string) $receiptItem->ordered_quantity, 'Receipt ordered_quantity must be exactly 1.165');
        $this->assertSame('1.165', (string) $receiptItem->received_quantity, 'Receipt received_quantity must be exactly 1.165');

        // Test API response via endpoint
        $response = $this->actingAs($this->admin)->getJson("/api/v1/purchase-receipts/{$receipt->id}");
        $response->assertStatus(200);

        $jsonItems = $response->json('data.items');
        $this->assertNotEmpty($jsonItems);
        $this->assertSame('1.165', (string) $jsonItems[0]['ordered_quantity']);
        $this->assertSame('1.165', (string) $jsonItems[0]['received_quantity']);
    }

    /**
     * Test partial receiving and remaining quantity with fractional decimals
     */
    public function test_partial_receiving_and_remaining_calculation(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-PREC-03',
            'department_id' => $this->department->id,
            'user_id' => $this->admin->id,
            'site_engineer_user_id' => $this->siteEngineer->id,
            'status' => 'APPROVED',
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-PREC-03',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->admin->id,
            'status' => 'ISSUED',
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_description' => 'أسمنت مقاوم للملوحة',
            'quantity' => '1.165',
            'unit_price' => '2500.00',
            'uom' => 'TON',
        ]);

        // Receive partial quantity 0.001
        $receiptItem = PurchaseReceiptItem::create([
            'purchase_receipt_id' => PurchaseReceipt::create([
                'purchase_order_id' => $po->id,
                'receipt_number' => 'REC-PREC-PARTIAL',
                'status' => 'APPROVED',
            ])->id,
            'purchase_order_item_id' => $poItem->id,
            'ordered_quantity' => '1.165',
            'received_quantity' => '0.001',
        ]);

        $receiptItem->refresh();
        $this->assertSame('0.001', (string) $receiptItem->received_quantity);

        // Remaining = 1.165 - 0.001 = 1.164
        $remaining = (float) $poItem->quantity - (float) $receiptItem->received_quantity;
        $this->assertEquals(1.164, round($remaining, 4));
        $this->assertSame('1.164', DecimalHelper::formatCleanDecimal($remaining, 4));
    }
}
