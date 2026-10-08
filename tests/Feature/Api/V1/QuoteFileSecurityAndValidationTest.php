<?php

namespace Tests\Feature\Api\V1;

use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\PurchaseRequestQuote;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class QuoteFileSecurityAndValidationTest extends TestCase
{
    use RefreshDatabase;

    private Department $dept;
    private User $employeeOwner;
    private User $employeeOther;
    private User $reviewer;
    private User $procurementManager;
    private User $warehouseKeeper;
    private Supplier $supplier;
    private PurchaseRequest $purchaseRequest;
    private PurchaseRequestQuote $quote;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);

        $this->dept = Department::create(['name' => 'Department Execution', 'code' => 'EXECUTION']);

        $this->employeeOwner = $this->createUser('owner@ashbiliya.com', 'Employee Owner', 'employee');
        $this->employeeOther = $this->createUser('other@ashbiliya.com', 'Employee Other', 'employee');
        $this->reviewer = $this->createUser('reviewer@ashbiliya.com', 'Reviewer User', 'reviewer');
        $this->procurementManager = $this->createUser('pm@ashbiliya.com', 'Procurement Mgr', 'procurement_manager');
        $this->warehouseKeeper = $this->createUser('warehouse@ashbiliya.com', 'Warehouse Keeper', 'warehouse_keeper');

        $this->supplier = Supplier::create([
            'company_name' => 'Al-Amal Supplies',
            'contact_name' => 'Amal Contact',
            'phone' => '01000000000',
            'is_active' => true,
        ]);

        $this->purchaseRequest = PurchaseRequest::create([
            'request_number' => 'PR-SEC-001',
            'department_id' => $this->dept->id,
            'user_id' => $this->employeeOwner->id,
            'reviewer_user_id' => $this->reviewer->id,
            'status' => 'PENDING_QUOTE_RECOMMENDATIONS',
            'procurement_route' => 'THREE_QUOTES',
        ]);

        $fileName = 'secure_quote_101.pdf';
        $filePath = 'quotes/' . $fileName;

        $this->quote = PurchaseRequestQuote::create([
            'purchase_request_id' => $this->purchaseRequest->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'unit_price' => 1500,
            'total_amount' => 1500,
            'file_name' => $fileName,
            'file_path' => $filePath,
            'mime_type' => 'application/pdf',
        ]);
    }

    private function createUser(string $email, string $name, string $roleSlug): User
    {
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => bcrypt('password123'),
            'department_id' => $this->dept->id,
            'is_active' => true,
        ]);

        $role = Role::where('slug', $roleSlug)->first();
        if ($role) {
            $user->roles()->attach($role->id);
        }

        return $user;
    }

    public function test_unauthenticated_request_to_quote_file_returns_401(): void
    {
        $response = $this->getJson('/storage/quotes/secure_quote_101.pdf');
        $response->assertStatus(401);
    }

    public function test_path_traversal_is_blocked_with_400(): void
    {
        $response = $this->actingAs($this->employeeOwner, 'sanctum')
            ->get('/storage/quotes/..%2F..%2Fetc/passwd');

        $response->assertStatus(400);
    }

    public function test_path_traversal_with_dots_in_filename_is_blocked_with_400(): void
    {
        $response = $this->actingAs($this->employeeOwner, 'sanctum')
            ->get('/storage/quotes/foo..bar.pdf');

        $response->assertStatus(400);
    }

    public function test_unauthorized_user_cannot_access_quote_file_idor_blocked_with_403(): void
    {
        $response = $this->actingAs($this->employeeOther, 'sanctum')
            ->get('/storage/quotes/secure_quote_101.pdf');

        $response->assertStatus(403);
    }

    public function test_owner_can_access_quote_file(): void
    {
        $response = $this->actingAs($this->employeeOwner, 'sanctum')
            ->get('/storage/quotes/secure_quote_101.pdf');

        $response->assertStatus(200);
    }

    public function test_reviewer_can_access_quote_file(): void
    {
        $response = $this->actingAs($this->reviewer, 'sanctum')
            ->get('/storage/quotes/secure_quote_101.pdf');

        $response->assertStatus(200);
    }

    public function test_user_with_purchase_quote_view_permission_can_access_quote_file(): void
    {
        $response = $this->actingAs($this->procurementManager, 'sanctum')
            ->get('/storage/quotes/secure_quote_101.pdf');

        $response->assertStatus(200);
    }

    public function test_quote_creation_rejects_unsafe_executable_file(): void
    {
        $supplier2 = Supplier::create([
            'company_name' => 'Supplier Two',
            'is_active' => true,
        ]);

        $fakeExe = UploadedFile::fake()->create('malicious.exe', 50, 'application/x-msdownload');

        $payload = [
            'quotes' => [
                [
                    'supplier_id' => $this->supplier->id,
                    'unit_price' => 100,
                    'total_amount' => 100,
                    'file' => $fakeExe,
                ],
                [
                    'supplier_id' => $supplier2->id,
                    'unit_price' => 120,
                    'total_amount' => 120,
                ],
            ],
        ];

        $response = $this->actingAs($this->procurementManager, 'sanctum')
            ->post("/api/v1/procurement/purchase-requests/{$this->purchaseRequest->id}/quotes", $payload, [
                'Accept' => 'application/json',
            ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['quotes.0.file']);
    }

    public function test_receipt_creation_rejects_unsafe_executable_file(): void
    {
        $po = PurchaseOrder::create([
            'po_number' => 'PO-SEC-001',
            'purchase_request_id' => $this->purchaseRequest->id,
            'supplier_id' => $this->supplier->id,
            'created_by_user_id' => $this->procurementManager->id,
            'status' => 'PENDING_WAREHOUSE',
            'total_amount' => 1500,
        ]);

        $category = Category::create(['name' => 'General', 'code' => 'GEN']);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Test Item',
            'sku' => 'SKU-001',
            'unit' => 'pcs',
            'is_active' => true,
        ]);

        $prItem = PurchaseRequestItem::create([
            'purchase_request_id' => $this->purchaseRequest->id,
            'item_id' => $item->id,
            'item_description' => 'Test Desc',
            'quantity' => 10,
            'estimated_unit_price' => 150,
        ]);

        $poItem = PurchaseOrderItem::create([
            'purchase_order_id' => $po->id,
            'item_id' => $item->id,
            'item_description' => 'Test Item Description',
            'purchase_request_item_id' => $prItem->id,
            'quantity' => 10,
            'unit_price' => 150,
            'total_price' => 1500,
        ]);

        $fakeHtml = UploadedFile::fake()->create('exploit.html', 20, 'text/html');

        $payload = [
            'items' => [
                [
                    'purchase_order_item_id' => $poItem->id,
                    'received_quantity' => 10,
                ],
            ],
            'photo' => $fakeHtml,
        ];

        $response = $this->actingAs($this->warehouseKeeper, 'sanctum')
            ->post("/api/v1/purchase-receipts/purchase-orders/{$po->id}", $payload, [
                'Accept' => 'application/json',
            ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['photo']);
    }
}
