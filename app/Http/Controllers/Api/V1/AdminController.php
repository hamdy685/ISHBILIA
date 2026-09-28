<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    // =========================================================================
    // USERS MANAGEMENT
    // =========================================================================

    public function indexUsers(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('per_page', 200), 1), 200);
        $paginator = User::with(['department', 'roles', 'siteEngineerDepartments'])
            ->orderByDesc('id')
            ->paginate($perPage);

        $users = $paginator->getCollection()->map(function ($u) {
            return [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'phone' => $u->phone,
                'is_active' => (bool) $u->is_active,
                'department' => $u->department ? [
                    'id' => $u->department->id,
                    'name' => $u->department->name,
                    'code' => $u->department->code,
                ] : null,
                'roles' => $u->roles->map(fn($r) => [
                    'id' => $r->id,
                    'name' => $r->name,
                    'slug' => $r->slug,
                ])->values(),
                'site_engineer_departments' => $u->siteEngineerDepartments->map(fn($department) => [
                    'id' => $department->id,
                    'name' => $department->name,
                    'code' => $department->code,
                ])->values(),
                'created_at' => $u->created_at ? $u->created_at->toIso8601String() : null,
            ];
        })->values();

        return response()->json([
            'data' => $users,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function storeUser(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:6',
            'phone' => 'nullable|string|max:50',
            'department_id' => 'nullable|exists:departments,id',
            'role_ids' => 'nullable|array',
            'role_ids.*' => 'exists:roles,id',
            'is_active' => 'boolean',
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'phone' => $validated['phone'] ?? null,
            'department_id' => $validated['department_id'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        if (!empty($validated['role_ids'])) {
            $user->roles()->sync($validated['role_ids']);
        }

        return response()->json([
            'message' => 'User created successfully',
            'data' => $user->load(['department', 'roles', 'siteEngineerDepartments']),
        ], 201);
    }

    public function updateUser(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => ['sometimes', 'required', 'email', Rule::unique('users')->ignore($user->id)],
            'password' => 'nullable|string|min:6',
            'phone' => 'nullable|string|max:50',
            'department_id' => 'nullable|exists:departments,id',
            'role_ids' => 'nullable|array',
            'role_ids.*' => 'exists:roles,id',
            'is_active' => 'sometimes|boolean',
        ]);

        if (isset($validated['name'])) $user->name = $validated['name'];
        if (isset($validated['email'])) $user->email = $validated['email'];
        if (!empty($validated['password'])) $user->password = Hash::make($validated['password']);
        if (array_key_exists('phone', $validated)) $user->phone = $validated['phone'];
        if (array_key_exists('department_id', $validated)) $user->department_id = $validated['department_id'];
        if (isset($validated['is_active'])) $user->is_active = $validated['is_active'];

        $user->save();

        if (isset($validated['role_ids'])) {
            $user->roles()->sync($validated['role_ids']);
        }

        return response()->json([
            'message' => 'User updated successfully',
            'data' => $user->load(['department', 'roles', 'siteEngineerDepartments']),
        ]);
    }

    public function destroyUser(int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $user->is_active = !$user->is_active;
        $user->save();

        return response()->json([
            'message' => 'User status updated successfully',
            'is_active' => (bool) $user->is_active,
        ]);
    }

    // =========================================================================
    // ROLES & PERMISSIONS MANAGEMENT
    // =========================================================================

    public function indexRoles(): JsonResponse
    {
        $roles = Role::with('permissions')->get()->map(function ($r) {
            return [
                'id' => $r->id,
                'name' => $r->name,
                'slug' => $r->slug,
                'description' => $r->description,
                'permissions' => $r->permissions->map(fn($p) => [
                    'id' => $p->id,
                    'name' => $p->name,
                    'slug' => $p->slug,
                ]),
            ];
        });

        return response()->json(['data' => $roles]);
    }

    public function indexPermissions(): JsonResponse
    {
        $permissions = Permission::all()->map(fn($p) => [
            'id' => $p->id,
            'name' => $p->name,
            'slug' => $p->slug,
            'description' => $p->description,
        ]);

        return response()->json(['data' => $permissions]);
    }

    public function updateRolePermissions(Request $request, int $id): JsonResponse
    {
        $role = Role::findOrFail($id);
        $validated = $request->validate([
            'permission_ids' => 'required|array',
            'permission_ids.*' => 'exists:permissions,id',
        ]);

        $role->permissions()->sync($validated['permission_ids']);

        return response()->json([
            'message' => 'Role permissions updated successfully',
            'data' => $role->load('permissions'),
        ]);
    }

    // =========================================================================
    // DEPARTMENTS MANAGEMENT
    // =========================================================================

    public function indexDepartments(): JsonResponse
    {
        $departments = Department::with(['manager', 'siteEngineer'])->withCount('users')->get()->map(function ($d) {
            return [
                'id' => $d->id,
                'name' => $d->name,
                'code' => $d->code,
                'description' => $d->description,
                'manager' => $d->manager ? [
                    'id' => $d->manager->id,
                    'name' => $d->manager->name,
                ] : null,
                'site_engineer' => $d->siteEngineer ? [
                    'id' => $d->siteEngineer->id,
                    'name' => $d->siteEngineer->name,
                ] : null,
                'users_count' => (int) $d->users_count,
            ];
        });

        return response()->json(['data' => $departments]);
    }

    public function storeDepartment(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:50|unique:departments,code',
            'description' => 'nullable|string',
            'manager_user_id' => 'nullable|exists:users,id',
            'site_engineer_user_id' => 'nullable|exists:users,id',
        ]);

        $validationError = $this->validateDepartmentAssignments($validated, null);
        if ($validationError) return $validationError;

        $dept = Department::create($validated);

        return response()->json([
            'message' => 'Department created successfully',
            'data' => $dept->load(['manager', 'siteEngineer']),
        ], 201);
    }

    public function updateDepartment(Request $request, int $id): JsonResponse
    {
        $dept = Department::findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'code' => ['sometimes', 'required', 'string', 'max:50', Rule::unique('departments')->ignore($dept->id)],
            'description' => 'nullable|string',
            'manager_user_id' => 'nullable|exists:users,id',
            'site_engineer_user_id' => 'nullable|exists:users,id',
        ]);

        $validationError = $this->validateDepartmentAssignments($validated, $dept->id);
        if ($validationError) return $validationError;

        $dept->update($validated);

        return response()->json([
            'message' => 'Department updated successfully',
            'data' => $dept->load(['manager', 'siteEngineer']),
        ]);
    }

    private function validateDepartmentAssignments(array $validated, ?int $departmentId): ?JsonResponse
    {
        if (!empty($validated['manager_user_id'])) {
            $manager = User::findOrFail($validated['manager_user_id']);
            if ($departmentId !== null && (int) $manager->department_id !== $departmentId) {
                return response()->json(['message' => 'مدير القسم المختار يجب أن يكون تابعًا لنفس القسم.'], 422);
            }
            if (!$manager->is_active) {
                return response()->json(['message' => 'مدير القسم المختار يجب أن يكون مستخدمًا نشطًا.'], 422);
            }
        }

        if (!empty($validated['site_engineer_user_id'])) {
            $engineer = User::findOrFail($validated['site_engineer_user_id']);
            if (!$engineer->is_active) {
                return response()->json(['message' => 'مهندس الموقع المختار يجب أن يكون مستخدمًا نشطًا.'], 422);
            }
            if (!$engineer->hasRole('site_engineer')) {
                return response()->json(['message' => 'المسؤول الميداني للقسم يجب أن يحمل دور مهندس موقع.'], 422);
            }
        }

        return null;
    }

    public function destroyDepartment(int $id): JsonResponse
    {
        $dept = Department::findOrFail($id);
        $dept->delete();

        return response()->json(['message' => 'Department deleted successfully']);
    }

    // =========================================================================
    // CATEGORIES MANAGEMENT
    // =========================================================================

    public function indexCategories(): JsonResponse
    {
        $categories = Category::all()->map(function ($c) {
            return [
                'id' => $c->id,
                'name' => $c->name,
                'code' => $c->code,
                'description' => $c->description,
                'items_count' => Item::where('category_id', $c->id)->count(),
            ];
        });

        return response()->json(['data' => $categories]);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:50|unique:categories,code',
            'description' => 'nullable|string',
        ]);

        $cat = Category::create($validated);

        return response()->json([
            'message' => 'Category created successfully',
            'data' => $cat,
        ], 201);
    }

    public function updateCategory(Request $request, int $id): JsonResponse
    {
        $cat = Category::findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'code' => ['sometimes', 'required', 'string', 'max:50', Rule::unique('categories')->ignore($cat->id)],
            'description' => 'nullable|string',
        ]);

        $cat->update($validated);

        return response()->json([
            'message' => 'Category updated successfully',
            'data' => $cat,
        ]);
    }

    public function destroyCategory(int $id): JsonResponse
    {
        $cat = Category::findOrFail($id);
        $cat->delete();

        return response()->json(['message' => 'Category deleted successfully']);
    }

    // =========================================================================
    // ITEMS / CATALOG MANAGEMENT
    // =========================================================================

    public function indexItems(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('per_page', 50), 1), 200);
        $paginator = Item::with('category')->orderBy('id', 'desc')->paginate($perPage);
        $items = $paginator->getCollection()->map(function ($item) {
            return [
                'id' => $item->id,
                'sku' => $item->sku,
                'name' => $item->name,
                'uom' => $item->uom,
                'description' => $item->description,
                'is_active' => (bool) $item->is_active,
                'category' => $item->category ? [
                    'id' => $item->category->id,
                    'name' => $item->category->name,
                    'code' => $item->category->code,
                ] : null,
            ];
        });

        return response()->json([
            'data' => $items->values(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
        ]);
    }

    public function storeItem(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'sku' => 'required|string|max:50|unique:items,sku',
            'category_id' => 'nullable|exists:categories,id',
            'uom' => 'required|string|max:50',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        $item = Item::create([
            'name' => $validated['name'],
            'sku' => $validated['sku'],
            'category_id' => $validated['category_id'] ?? null,
            'uom' => $validated['uom'],
            'description' => $validated['description'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json([
            'message' => 'Item created successfully',
            'data' => $item->load('category'),
        ], 201);
    }

    public function updateItem(Request $request, int $id): JsonResponse
    {
        $item = Item::findOrFail($id);
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'sku' => ['sometimes', 'required', 'string', 'max:50', Rule::unique('items')->ignore($item->id)],
            'category_id' => 'nullable|exists:categories,id',
            'uom' => 'sometimes|required|string|max:50',
            'description' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
        ]);

        $item->update($validated);

        return response()->json([
            'message' => 'Item updated successfully',
            'data' => $item->load('category'),
        ]);
    }

    public function destroyItem(int $id): JsonResponse
    {
        $item = Item::findOrFail($id);
        $item->is_active = !$item->is_active;
        $item->save();

        return response()->json([
            'message' => 'Item status toggled successfully',
            'is_active' => (bool) $item->is_active,
        ]);
    }

    /**
     * Fix historical rebar items across PRs, POs, and financial totals.
     */
    public function fixHistoricalRebar(): JsonResponse
    {
        $updatedPrItems = [];
        $updatedPoItems = [];
        $updatedReceiptItems = [];
        $recalculatedPrs = [];
        $recalculatedPos = [];

        DB::transaction(function () use (&$updatedPrItems, &$updatedPoItems, &$updatedReceiptItems, &$recalculatedPrs, &$recalculatedPos) {
            // 1. Fix PR #6 Item 11: حديد 4 لنيه (133 bars -> 1.383 TON)
            $prItem11 = DB::table('purchase_request_items')->where('id', 11)->first();
            if ($prItem11 && ($prItem11->uom === 'BAR' || (float)$prItem11->quantity > 10)) {
                $tons = 1.383;
                $lineTotal = round(1.3832 * 41000, 2); // 56711.20
                DB::table('purchase_request_items')->where('id', 11)->update([
                    'quantity' => $tons,
                    'uom' => 'TON',
                    'specifications' => '133 سيخ 4 لينية',
                    'estimated_unit_price' => 41000.00,
                    'estimated_line_total' => $lineTotal,
                ]);
                $updatedPrItems[] = 11;
                $recalculatedPrs[6] = true;
            }

            // 2. Fix PR #8 Item 18: حديد 4 لنيه (40 bars -> 0.416 TON)
            $prItem18 = DB::table('purchase_request_items')->where('id', 18)->first();
            if ($prItem18 && ($prItem18->uom === 'BAR' || (float)$prItem18->quantity > 10)) {
                $tons = 0.416;
                $lineTotal = round($tons * 41000, 2); // 17056.00
                DB::table('purchase_request_items')->where('id', 18)->update([
                    'quantity' => $tons,
                    'uom' => 'TON',
                    'specifications' => '40 سيخ 4 لينية',
                    'estimated_unit_price' => 41000.00,
                    'estimated_line_total' => $lineTotal,
                ]);
                $updatedPrItems[] = 18;
                $recalculatedPrs[8] = true;
            }

            // 3. Fix PR #8 Item 19: حديد 5 لنيه (35 bars -> 0.665 TON)
            $prItem19 = DB::table('purchase_request_items')->where('id', 19)->first();
            if ($prItem19 && ($prItem19->uom === 'BAR' || (float)$prItem19->quantity > 10)) {
                $tons = 0.665;
                $lineTotal = round($tons * 42000, 2); // 27930.00
                DB::table('purchase_request_items')->where('id', 19)->update([
                    'quantity' => $tons,
                    'uom' => 'TON',
                    'specifications' => '35 سيخ 5 لينية',
                    'estimated_unit_price' => 42000.00,
                    'estimated_line_total' => $lineTotal,
                ]);
                $updatedPrItems[] = 19;
                $recalculatedPrs[8] = true;
            }

            // 4. Fix PR #11 Item 28: حديد ١٠ مم (40 bars -> 0.296 TON)
            $prItem28 = DB::table('purchase_request_items')->where('id', 28)->first();
            if ($prItem28 && ($prItem28->uom === 'BAR' || (float)$prItem28->quantity > 10)) {
                $tons = 0.296;
                DB::table('purchase_request_items')->where('id', 28)->update([
                    'quantity' => $tons,
                    'uom' => 'TON',
                    'specifications' => '40 سيخ 3 لينية (10 مم)',
                ]);
                $updatedPrItems[] = 28;
                $recalculatedPrs[11] = true;
            }

            // 5. Fix PO #6 Item 9: حديد 4 لنيه (133 bars -> 1.383 TON)
            $poItem9 = DB::table('purchase_order_items')->where('id', 9)->first();
            if ($poItem9 && ($poItem9->uom === 'BAR' || (float)$poItem9->quantity > 10)) {
                $tons = 1.383;
                $lineTotal = round(1.3832 * 41000, 2); // 56711.20
                DB::table('purchase_order_items')->where('id', 9)->update([
                    'quantity' => $tons,
                    'uom' => 'TON',
                    'specifications' => '133 سيخ 4 لينية',
                    'unit_price' => 41000.00,
                    'line_total' => $lineTotal,
                ]);
                $updatedPoItems[] = 9;
                $recalculatedPos[6] = true;
            }

            // 6. Fix PO #7 Item 11: حديد 4 لنيه (40 bars -> 0.416 TON)
            $poItem11 = DB::table('purchase_order_items')->where('id', 11)->first();
            if ($poItem11 && ($poItem11->uom === 'BAR' || (float)$poItem11->quantity > 10)) {
                $tons = 0.416;
                $lineTotal = round($tons * 41000, 2); // 17056.00
                DB::table('purchase_order_items')->where('id', 11)->update([
                    'quantity' => $tons,
                    'uom' => 'TON',
                    'specifications' => '40 سيخ 4 لينية',
                    'unit_price' => 41000.00,
                    'line_total' => $lineTotal,
                ]);
                $updatedPoItems[] = 11;
                $recalculatedPos[7] = true;
            }

            // 7. Fix PO #7 Item 12: حديد 5 لنيه (35 bars -> 0.665 TON)
            $poItem12 = DB::table('purchase_order_items')->where('id', 12)->first();
            if ($poItem12 && ($poItem12->uom === 'BAR' || (float)$poItem12->quantity > 10)) {
                $tons = 0.665;
                $lineTotal = round($tons * 42000, 2); // 27930.00
                DB::table('purchase_order_items')->where('id', 12)->update([
                    'quantity' => $tons,
                    'uom' => 'TON',
                    'specifications' => '35 سيخ 5 لينية',
                    'unit_price' => 42000.00,
                    'line_total' => $lineTotal,
                ]);
                $updatedPoItems[] = 12;
                $recalculatedPos[7] = true;
            }

            // 8. Fix Receipt #7 items:
            // Item 11: حديد 4 لنيه (was 40.000 -> 0.416 TON)
            $rcptItem11 = DB::table('purchase_receipt_items')->where('id', 11)->first();
            if ($rcptItem11 && (float)$rcptItem11->received_quantity > 5) {
                DB::table('purchase_receipt_items')->where('id', 11)->update([
                    'ordered_quantity' => 0.416,
                    'received_quantity' => 0.416,
                ]);
                $updatedReceiptItems[] = 11;
            }

            // Item 12: حديد 5 لنيه (was 35.000 -> 0.665 TON)
            $rcptItem12 = DB::table('purchase_receipt_items')->where('id', 12)->first();
            if ($rcptItem12 && (float)$rcptItem12->received_quantity > 5) {
                DB::table('purchase_receipt_items')->where('id', 12)->update([
                    'ordered_quantity' => 0.665,
                    'received_quantity' => 0.665,
                ]);
                $updatedReceiptItems[] = 12;
            }

            // Safety scan for all other receipt items linked to rebar with TON UOM where bars were entered as received_quantity
            $allRcptItems = DB::table('purchase_receipt_items')
                ->join('purchase_order_items', 'purchase_receipt_items.purchase_order_item_id', '=', 'purchase_order_items.id')
                ->where('purchase_order_items.uom', 'TON')
                ->select('purchase_receipt_items.id', 'purchase_receipt_items.received_quantity', 'purchase_order_items.specifications as po_specs')
                ->get();

            foreach ($allRcptItems as $ri) {
                if ((float)$ri->received_quantity > 10 && !empty($ri->po_specs)) {
                    if (preg_match('/(\d+)\s*سيخ\s*4/u', $ri->po_specs, $m)) {
                        $bars = (float)$m[1];
                        $tons = round($bars * 10.4 / 1000, 3);
                        DB::table('purchase_receipt_items')->where('id', $ri->id)->update([
                            'ordered_quantity' => $tons,
                            'received_quantity' => $tons,
                        ]);
                        $updatedReceiptItems[] = $ri->id;
                    } elseif (preg_match('/(\d+)\s*سيخ\s*5/u', $ri->po_specs, $m)) {
                        $bars = (float)$m[1];
                        $tons = round($bars * 19.0 / 1000, 3);
                        DB::table('purchase_receipt_items')->where('id', $ri->id)->update([
                            'ordered_quantity' => $tons,
                            'received_quantity' => $tons,
                        ]);
                        $updatedReceiptItems[] = $ri->id;
                    } elseif (preg_match('/(\d+)\s*سيخ\s*3/u', $ri->po_specs, $m)) {
                        $bars = (float)$m[1];
                        $tons = round($bars * 7.4 / 1000, 3);
                        DB::table('purchase_receipt_items')->where('id', $ri->id)->update([
                            'ordered_quantity' => $tons,
                            'received_quantity' => $tons,
                        ]);
                        $updatedReceiptItems[] = $ri->id;
                    }
                }
            }

            // Recalculate PR totals
            foreach (array_keys($recalculatedPrs) as $prId) {
                $total = DB::table('purchase_request_items')
                    ->where('purchase_request_id', $prId)
                    ->sum('estimated_line_total');
                DB::table('purchase_requests')->where('id', $prId)->update([
                    'total_estimated_cost' => $total,
                ]);
            }

            // Recalculate PO totals
            foreach (array_keys($recalculatedPos) as $poId) {
                $subtotal = DB::table('purchase_order_items')
                    ->where('purchase_order_id', $poId)
                    ->sum('line_total');
                $po = DB::table('purchase_orders')->where('id', $poId)->first();
                $discount = (float)($po->discount_amount ?? 0);
                $tax = (float)($po->tax_amount ?? 0);
                $grandTotal = max(0, $subtotal - $discount + $tax);
                
                $updateData = [
                    'subtotal' => $subtotal,
                    'grand_total' => $grandTotal,
                ];
                if (DB::getSchemaBuilder()->hasColumn('purchase_orders', 'total_amount')) {
                    $updateData['total_amount'] = $grandTotal;
                }
                DB::table('purchase_orders')->where('id', $poId)->update($updateData);
            }

            // 9. Wipe demo land parcels as requested by user
            DB::table('supplier_invoice_land_allocations')->delete();
            DB::table('land_parcel_transactions')->delete();
            DB::table('land_parcels')->delete();
        });

        return response()->json([
            'message' => 'تم تصحيح وتحديث كافة طلبات وأوامر وأذونات استلام الحديد وحذف كافة قطع الأراضي التجريبية بنجاح.',
            'updated_pr_items' => $updatedPrItems,
            'updated_po_items' => $updatedPoItems,
            'updated_receipt_items' => array_values(array_unique($updatedReceiptItems)),
            'recalculated_prs' => array_keys($recalculatedPrs),
            'recalculated_pos' => array_keys($recalculatedPos),
        ]);
    }
}
