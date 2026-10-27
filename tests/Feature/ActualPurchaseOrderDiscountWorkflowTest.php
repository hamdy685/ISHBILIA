<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use App\Services\PurchaseOrderService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ActualPurchaseOrderDiscountWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected User $procurementManager;
    protected User $accountant;
    protected Supplier $supplier;
    protected Department $dept;
    protected PurchaseOrderService $poService;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->dept = Department::create(['name' => 'إدارة التنفيذ', 'code' => 'EXEC-01']);
        $this->procurementManager = $this->createUserWithRole('procurement_manager', $this->dept->id, null, 'مدير المشتريات');
        $this->accountant = $this->createUserWithRole('accountant', $this->dept->id, null, 'محاسب الموقع');

        $this->supplier = Supplier::create([
            'company_name' => 'شركة الأهرام للتوريدات والمقاولات',
            'is_active' => true,
        ]);

        $this->poService = app(PurchaseOrderService::class);
    }

    protected function createUserWithRole(string $roleSlug, ?int $departmentId = null, ?int $managerId = null, string $name = 'User'): User
    {
        $user = User::create([
            'name' => $name,
            'email' => uniqid('test_') . '@ashbiliya.com',
            'password' => Hash::make('password123'),
            'department_id' => $departmentId,
            'manager_id' => $managerId,
            'is_active' => true,
        ]);
        $role = Role::where('slug', $roleSlug)->first();
        if ($role) {
            $user->roles()->attach($role->id);
        }
        return $user;
    }

    protected function createPendingActualPo(array $itemsData): PurchaseOrder
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-' . uniqid(),
            'user_id' => $this->procurementManager->id,
            'requester_user_id' => $this->procurementManager->id,
            'department_id' => $this->dept->id,
            'status' => 'PENDING_ACTUAL_PO',
            'procurement_route' => 'DIRECT',
            'parcel_reference' => '101',
            'region' => 'المنطقة الأولى',
            'date_needed' => now()->toDateString(),
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-' . uniqid(),
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'PENDING_ACTUAL_PO',
            'subtotal' => 0,
            'discount_amount' => 0,
            'tax_amount' => 0,
            'grand_total' => 0,
            'discount_type' => 'NONE',
            'discount_percentage' => 0,
        ]);

        foreach ($itemsData as $data) {
            $po->items()->create([
                'item_description' => $data['item_description'],
                'quantity' => $data['quantity'],
                'unit_price' => $data['unit_price'],
                'line_total' => round($data['quantity'] * $data['unit_price'], 2),
                'uom' => $data['uom'] ?? 'PCS',
                'item_reference' => '101',
                'region' => 'المنطقة الأولى',
                'supplier_id' => $this->supplier->id,
                'is_discount_applied' => $data['is_discount_applied'] ?? false,
            ]);
        }

        $this->poService->recalculateTotals($po);
        return $po->fresh(['items']);
    }

    /**
     * 1. أمر شراء بدون خصم
     */
    public function test_actual_po_no_discount(): void
    {
        $po = $this->createPendingActualPo([
            ['item_description' => 'بند 1', 'quantity' => 10, 'unit_price' => 10000],
        ]);

        $payload = [
            'supplier_id' => $this->supplier->id,
            'discount_type' => 'NONE',
            'discount_percentage' => 0,
            'items' => [
                [
                    'id' => $po->items[0]->id,
                    'item_description' => 'بند 1',
                    'quantity' => 10,
                    'unit_price' => 10000,
                    'item_reference' => '101',
                    'region' => 'المنطقة الأولى',
                ],
            ],
        ];

        $response = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/finalize", $payload);

        $response->assertStatus(200);

        $po->refresh();
        $this->assertEquals('ISSUED', $po->status);
        $this->assertEquals(100000.00, (float) $po->subtotal);
        $this->assertEquals(0.00, (float) $po->discount_amount);
        $this->assertEquals(100000.00, (float) $po->grand_total);
        $this->assertEquals('NONE', $po->discount_type);
        $this->assertEquals(0.00, (float) $po->discount_percentage);
    }

    /**
     * 2. خصم 10% على إجمالي أمر قيمته 100,000؛ قيمة الخصم 10,000 والإجمالي 90,000
     */
    public function test_actual_po_total_order_discount_10_percent(): void
    {
        $po = $this->createPendingActualPo([
            ['item_description' => 'بند أ', 'quantity' => 5, 'unit_price' => 10000],
            ['item_description' => 'بند ب', 'quantity' => 5, 'unit_price' => 10000],
        ]);

        $payload = [
            'supplier_id' => $this->supplier->id,
            'discount_type' => 'TOTAL',
            'discount_percentage' => 10.00,
            'items' => [
                [
                    'id' => $po->items[0]->id,
                    'item_description' => 'بند أ',
                    'quantity' => 5,
                    'unit_price' => 10000,
                    'item_reference' => '101',
                    'region' => 'المنطقة الأولى',
                ],
                [
                    'id' => $po->items[1]->id,
                    'item_description' => 'بند ب',
                    'quantity' => 5,
                    'unit_price' => 10000,
                    'item_reference' => '101',
                    'region' => 'المنطقة الأولى',
                ],
            ],
        ];

        $response = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/finalize", $payload);

        $response->assertStatus(200);

        $po->refresh();
        $this->assertEquals(100000.00, (float) $po->subtotal);
        $this->assertEquals(10000.00, (float) $po->discount_amount);
        $this->assertEquals(90000.00, (float) $po->grand_total);
        $this->assertEquals('TOTAL', $po->discount_type);
        $this->assertEquals(10.00, (float) $po->discount_percentage);
    }

    /**
     * 3. أمر بقيمة 100,000، منها بندان بقيمتي 20,000 و30,000 مستهدفان بخصم 10%؛ قيمة الخصم 5,000 والإجمالي 95,000
     */
    public function test_actual_po_selected_items_discount_10_percent(): void
    {
        $po = $this->createPendingActualPo([
            ['item_description' => 'بند 1 (مستهدف)', 'quantity' => 2, 'unit_price' => 10000], // 20,000
            ['item_description' => 'بند 2 (مستهدف)', 'quantity' => 3, 'unit_price' => 10000], // 30,000
            ['item_description' => 'بند 3 (غير مستهدف)', 'quantity' => 5, 'unit_price' => 10000], // 50,000
        ]);

        $item1 = $po->items[0];
        $item2 = $po->items[1];
        $item3 = $po->items[2];

        $payload = [
            'supplier_id' => $this->supplier->id,
            'discount_type' => 'SELECTED_ITEMS',
            'discount_percentage' => 10.00,
            'discount_item_ids' => [$item1->id, $item2->id],
            'items' => [
                [
                    'id' => $item1->id,
                    'item_description' => $item1->item_description,
                    'quantity' => 2,
                    'unit_price' => 10000,
                    'item_reference' => '101',
                    'region' => 'المنطقة الأولى',
                    'is_discount_applied' => true,
                ],
                [
                    'id' => $item2->id,
                    'item_description' => $item2->item_description,
                    'quantity' => 3,
                    'unit_price' => 10000,
                    'item_reference' => '101',
                    'region' => 'المنطقة الأولى',
                    'is_discount_applied' => true,
                ],
                [
                    'id' => $item3->id,
                    'item_description' => $item3->item_description,
                    'quantity' => 5,
                    'unit_price' => 10000,
                    'item_reference' => '101',
                    'region' => 'المنطقة الأولى',
                    'is_discount_applied' => false,
                ],
            ],
        ];

        $response = $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/finalize", $payload);

        $response->assertStatus(200);

        $po->refresh();
        $this->assertEquals(100000.00, (float) $po->subtotal);
        $this->assertEquals(5000.00, (float) $po->discount_amount);
        $this->assertEquals(95000.00, (float) $po->grand_total);
        $this->assertEquals('SELECTED_ITEMS', $po->discount_type);
        $this->assertEquals(10.00, (float) $po->discount_percentage);

        // 4. التأكد أن البنود غير المحددة لا تتأثر بالخصم
        $item1->refresh();
        $item2->refresh();
        $item3->refresh();

        $this->assertTrue((bool) $item1->is_discount_applied);
        $this->assertEquals(2000.00, (float) $item1->discount_amount);
        $this->assertEquals(20000.00, (float) $item1->line_total);

        $this->assertTrue((bool) $item2->is_discount_applied);
        $this->assertEquals(3000.00, (float) $item2->discount_amount);
        $this->assertEquals(30000.00, (float) $item2->line_total);

        $this->assertFalse((bool) $item3->is_discount_applied);
        $this->assertEquals(0.00, (float) $item3->discount_amount);
        $this->assertEquals(50000.00, (float) $item3->line_total);
    }

    /**
     * 5. تعديل الكميات والأسعار بعد تحديد الخصم يعيد احتساب الإجماليات بدقة
     */
    public function test_modifying_quantities_and_prices_recalculates_discount_and_totals(): void
    {
        $po = $this->createPendingActualPo([
            ['item_description' => 'بند أ', 'quantity' => 2, 'unit_price' => 10000, 'is_discount_applied' => true], // 20,000 -> 10% = 2,000
            ['item_description' => 'بند ب', 'quantity' => 1, 'unit_price' => 10000, 'is_discount_applied' => false], // 10,000 -> 0% = 0
        ]);

        $this->poService->recalculateTotals($po, 'SELECTED_ITEMS', 10.00, [$po->items[0]->id]);
        $po->refresh();
        $this->assertEquals(30000.00, (float) $po->subtotal);
        $this->assertEquals(2000.00, (float) $po->discount_amount);
        $this->assertEquals(28000.00, (float) $po->grand_total);

        // Now modify quantity of discounted item from 2 to 4 (value becomes 40,000 -> discount 4,000)
        $discountedItem = $po->items[0];
        $this->poService->updateItem($this->procurementManager, $po, $discountedItem, [
            'quantity' => 4,
            'unit_price' => 10000,
            'item_reference' => '101',
            'region' => 'المنطقة الأولى',
        ]);

        $po->refresh();
        $this->assertEquals(50000.00, (float) $po->subtotal);
        $this->assertEquals(4000.00, (float) $po->discount_amount);
        $this->assertEquals(46000.00, (float) $po->grand_total);
    }

    /**
     * 6. حفظ الأمر وإعادة فتحه والتأكد من ثبات الحسابات وعدم الخصم مرتين
     */
    public function test_saving_and_reopening_po_does_not_double_deduct_discount(): void
    {
        $po = $this->createPendingActualPo([
            ['item_description' => 'بند 1', 'quantity' => 10, 'unit_price' => 10000],
        ]);

        // First recalculation: 10% total discount
        $this->poService->recalculateTotals($po, 'TOTAL', 10.00);
        $po->refresh();
        $this->assertEquals(100000.00, (float) $po->subtotal);
        $this->assertEquals(10000.00, (float) $po->discount_amount);
        $this->assertEquals(90000.00, (float) $po->grand_total);

        // Second recalculation without changing params: must not double-deduct
        $this->poService->recalculateTotals($po);
        $po->refresh();
        $this->assertEquals(100000.00, (float) $po->subtotal);
        $this->assertEquals(10000.00, (float) $po->discount_amount);
        $this->assertEquals(90000.00, (float) $po->grand_total);

        // Third recalculation
        $this->poService->recalculateTotals($po);
        $po->refresh();
        $this->assertEquals(100000.00, (float) $po->subtotal);
        $this->assertEquals(10000.00, (float) $po->discount_amount);
        $this->assertEquals(90000.00, (float) $po->grand_total);
    }

    /**
     * 7. إرسال الأمر إلى الحسابات والتأكد من تطابق الإجماليات في الـ API
     */
    public function test_accounting_endpoint_receives_identical_discount_and_totals(): void
    {
        $po = $this->createPendingActualPo([
            ['item_description' => 'بند 1', 'quantity' => 4, 'unit_price' => 25000],
        ]);

        $payload = [
            'supplier_id' => $this->supplier->id,
            'discount_type' => 'TOTAL',
            'discount_percentage' => 15.00,
            'items' => [
                [
                    'id' => $po->items[0]->id,
                    'item_description' => 'بند 1',
                    'quantity' => 4,
                    'unit_price' => 25000,
                    'item_reference' => '101',
                    'region' => 'المنطقة الأولى',
                ],
            ],
        ];

        $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po->id}/finalize", $payload)
            ->assertStatus(200);

        // Fetch as accountant
        $response = $this->actingAs($this->accountant, 'sanctum')
            ->getJson("/api/v1/accounting/purchase-orders/{$po->id}");

        $response->assertStatus(200);
        $data = $response->json('data');

        $this->assertEquals('100000.00', $data['subtotal']);
        $this->assertEquals('TOTAL', $data['discount_type']);
        $this->assertEquals('15', $data['discount_percentage']);
        $this->assertEquals('15000.00', $data['discount_amount']);
        $this->assertEquals('85000.00', $data['grand_total']);
    }

    /**
     * 8. Validation يمنع نسب الخصم غير الصحيحة أو تحديد بنود لا تنتمي إلى أمر الشراء
     */
    public function test_discount_validation_rejects_invalid_percentage_and_foreign_items(): void
    {
        $po1 = $this->createPendingActualPo([
            ['item_description' => 'بند أمر 1', 'quantity' => 1, 'unit_price' => 1000],
        ]);
        $po2 = $this->createPendingActualPo([
            ['item_description' => 'بند أمر 2', 'quantity' => 1, 'unit_price' => 1000],
        ]);

        // A. Percentage > 100 rejected
        $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po1->id}/finalize", [
                'discount_type' => 'TOTAL',
                'discount_percentage' => 105,
                'items' => [
                    [
                        'id' => $po1->items[0]->id,
                        'item_description' => 'بند أمر 1',
                        'quantity' => 1,
                        'unit_price' => 1000,
                    ],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['discount_percentage']);

        // B. Discount item ID from foreign PO rejected
        $foreignItemId = $po2->items[0]->id;
        $this->actingAs($this->procurementManager, 'sanctum')
            ->postJson("/api/v1/procurement/purchase-orders/{$po1->id}/finalize", [
                'discount_type' => 'SELECTED_ITEMS',
                'discount_percentage' => 10,
                'discount_item_ids' => [$foreignItemId],
                'items' => [
                    [
                        'id' => $po1->items[0]->id,
                        'item_description' => 'بند أمر 1',
                        'quantity' => 1,
                        'unit_price' => 1000,
                    ],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['discount_item_ids']);
    }

    /**
     * 9. اختبار الأوامر القديمة والتأكد من عدم تغيير بياناتها
     */
    public function test_legacy_purchase_orders_remain_unchanged(): void
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-' . uniqid(),
            'user_id' => $this->procurementManager->id,
            'requester_user_id' => $this->procurementManager->id,
            'department_id' => $this->dept->id,
            'status' => 'ISSUED',
            'procurement_route' => 'DIRECT',
            'date_needed' => now()->toDateString(),
        ]);

        $po = PurchaseOrder::create([
            'po_number' => 'PO-LEGACY-001',
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'ISSUED',
            'subtotal' => 50000.00,
            'discount_amount' => 0.00,
            'tax_amount' => 0.00,
            'grand_total' => 50000.00,
            'discount_type' => 'NONE',
            'discount_percentage' => 0.00,
        ]);

        $item = $po->items()->create([
            'item_description' => 'بند تاريخي',
            'quantity' => 5,
            'unit_price' => 10000.00,
            'line_total' => 50000.00,
            'is_discount_applied' => false,
            'discount_amount' => 0.00,
        ]);

        // Run recalculate totals on legacy PO without discount params
        $this->poService->recalculateTotals($po);

        $po->refresh();
        $this->assertEquals(50000.00, (float) $po->subtotal);
        $this->assertEquals(0.00, (float) $po->discount_amount);
        $this->assertEquals(50000.00, (float) $po->grand_total);
        $this->assertEquals('NONE', $po->discount_type);
        $this->assertEquals(0.00, (float) $po->discount_percentage);
    }
}
