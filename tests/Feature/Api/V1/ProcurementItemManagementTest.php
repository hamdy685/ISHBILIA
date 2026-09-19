<?php

namespace Tests\Feature\Api\V1;

use App\Models\Department;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProcurementItemManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function migrateFreshUsing()
    {
        return [
            '--force' => true,
        ];
    }

    private Department $dept;
    private User $procurementManager;
    private User $employee;
    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->dept = Department::create([
            'name' => 'Procurement & Logistics',
            'code' => 'DEPT-PROC',
        ]);

        $procRole = Role::where('slug', 'procurement_manager')->first();
        $empRole = Role::where('slug', 'employee')->first();

        $this->procurementManager = User::create([
            'department_id' => $this->dept->id,
            'name' => 'Procurement Officer',
            'email' => 'proc_officer@ashbiliya.com',
            'password' => Hash::make('Password123!'),
            'is_active' => true,
        ]);
        $this->procurementManager->roles()->attach($procRole->id);

        $this->employee = User::create([
            'department_id' => $this->dept->id,
            'name' => 'Requester Emp',
            'email' => 'requester_emp@ashbiliya.com',
            'password' => Hash::make('Password123!'),
            'is_active' => true,
        ]);
        $this->employee->roles()->attach($empRole->id);

        $this->supplier = Supplier::create([
            'company_name' => 'Test Steel Co',
            'contact_person' => 'Test Supplier',
            'email' => 'steel@test.com',
            'phone' => '01011122233',
            'is_active' => true,
        ]);
    }

    private function createPr(string $status, string $route = 'DIRECT'): PurchaseRequest
    {
        $pr = PurchaseRequest::create([
            'request_number' => 'PR-' . strtoupper(uniqid()),
            'request_type' => 'PROJECT',
            'parcel_reference' => 'PARCEL-101',
            'region' => 'Riyadh North',
            'user_id' => $this->employee->id,
            'department_id' => $this->dept->id,
            'status' => $status,
            'procurement_route' => $route,
            'direct_supplier_id' => $this->supplier->id,
            'total_estimated_cost' => 500.00,
        ]);

        PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'Initial Item 1',
            'item_reference' => 'PARCEL-101',
            'region' => 'Riyadh North',
            'quantity' => 10,
            'uom' => 'PCS',
            'estimated_unit_price' => 50.00,
            'estimated_line_total' => 500.00,
            'supplier_id' => $this->supplier->id,
        ]);

        return $pr;
    }

    public function test_procurement_can_add_item_in_pending_procurement_approval(): void
    {
        $pr = $this->createPr('PENDING_PROCUREMENT_APPROVAL');

        Sanctum::actingAs($this->procurementManager);

        $payload = [
            'item_description' => 'Cement Bag 50kg',
            'item_reference' => 'PARCEL-101',
            'region' => 'Riyadh North',
            'quantity' => 20,
            'uom' => 'BAG',
            'estimated_unit_price' => 25.00,
            'supplier_id' => $this->supplier->id,
            'specifications' => 'Portland Cement Grade 42.5',
        ];

        $response = $this->postJson("/api/v1/purchase-requests/{$pr->id}/items", $payload);

        $response->assertStatus(201);
        $this->assertDatabaseHas('purchase_request_items', [
            'purchase_request_id' => $pr->id,
            'item_description' => 'Cement Bag 50kg',
            'quantity' => 20,
            'estimated_unit_price' => 25.00,
            'estimated_line_total' => 500.00,
        ]);

        // PR total cost should be updated: 500 + 500 = 1000
        $pr->refresh();
        $this->assertEquals(1000.00, (float) $pr->total_estimated_cost);

        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $this->procurementManager->id,
            'action' => 'ITEM_ADDED',
            'new_value' => 'Cement Bag 50kg',
        ]);
    }

    public function test_procurement_can_update_item_in_pending_quote_recommendations(): void
    {
        $pr = $this->createPr('PENDING_QUOTE_RECOMMENDATIONS', 'QUOTES');
        $item = $pr->items->first();

        Sanctum::actingAs($this->procurementManager);

        $payload = [
            'item_description' => 'Updated Description Item',
            'quantity' => 15,
            'estimated_unit_price' => 60.00,
        ];

        $response = $this->putJson("/api/v1/purchase-requests/{$pr->id}/items/{$item->id}", $payload);

        $response->assertStatus(200);
        $item->refresh();
        $this->assertEquals('Updated Description Item', $item->item_description);
        $this->assertEquals(15.00, (float) $item->quantity);
        $this->assertEquals(60.00, (float) $item->estimated_unit_price);
        $this->assertEquals(900.00, (float) $item->estimated_line_total);

        // PR total cost should be recalculated: 15 * 60 = 900
        $pr->refresh();
        $this->assertEquals(900.00, (float) $pr->total_estimated_cost);

        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $this->procurementManager->id,
            'action' => 'ITEM_UPDATED',
            'old_value' => 'Initial Item 1',
            'new_value' => 'Updated Description Item',
        ]);
    }

    public function test_procurement_can_delete_item_in_approved_by_accounting_and_cascade_cleans(): void
    {
        $pr = $this->createPr('APPROVED_BY_ACCOUNTING');
        
        // Add a second item
        $secondItem = PurchaseRequestItem::create([
            'purchase_request_id' => $pr->id,
            'item_description' => 'Second Item To Delete',
            'item_reference' => 'PARCEL-101',
            'region' => 'Riyadh North',
            'quantity' => 5,
            'uom' => 'PCS',
            'estimated_unit_price' => 100.00,
            'estimated_line_total' => 500.00,
        ]);
        $pr->update(['total_estimated_cost' => 1000.00]);

        // Create a draft PO and PO item linked to this second item
        $po = PurchaseOrder::create([
            'po_number' => 'PO-' . strtoupper(uniqid()),
            'purchase_request_id' => $pr->id,
            'supplier_id' => $this->supplier->id,
            'department_id' => $this->dept->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'DRAFT',
            'total_amount' => 500.00,
        ]);
        PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'pr_item_id' => $secondItem->id,
            'item_description' => 'Second Item To Delete',
            'quantity' => 5,
            'unit_price' => 100.00,
            'line_total' => 500.00,
        ]);

        Sanctum::actingAs($this->procurementManager);

        $response = $this->deleteJson("/api/v1/purchase-requests/{$pr->id}/items/{$secondItem->id}");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('purchase_request_items', ['id' => $secondItem->id]);

        // Linked PO item should be removed
        $this->assertDatabaseMissing('purchase_order_items', ['pr_item_id' => $secondItem->id]);

        // PR total cost should be updated to 500.00
        $pr->refresh();
        $this->assertEquals(500.00, (float) $pr->total_estimated_cost);

        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $this->procurementManager->id,
            'action' => 'ITEM_REMOVED',
            'old_value' => 'Second Item To Delete',
        ]);
    }

    public function test_unauthorized_role_rejected_from_managing_items(): void
    {
        $pr = $this->createPr('PENDING_PROCUREMENT_APPROVAL');
        $item = $pr->items->first();

        // Acting as regular employee
        Sanctum::actingAs($this->employee);

        $response = $this->deleteJson("/api/v1/purchase-requests/{$pr->id}/items/{$item->id}");
        $response->assertStatus(403);
    }

    public function test_procurement_cannot_modify_items_in_completed_status(): void
    {
        $pr = $this->createPr('COMPLETED');
        $item = $pr->items->first();

        Sanctum::actingAs($this->procurementManager);

        $response = $this->deleteJson("/api/v1/purchase-requests/{$pr->id}/items/{$item->id}");
        $response->assertStatus(403);
    }
}
