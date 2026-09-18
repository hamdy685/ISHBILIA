<?php

namespace Database\Seeders;

use App\Models\ApprovalHistory;
use App\Models\Department;
use App\Models\Item;
use App\Models\Category;
use App\Models\LandParcel;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseReceipt;
use App\Models\PurchaseReceiptItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\PurchaseRequestSupplement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BulkPurchaseRequestSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('testing')) {
            return;
        }

        // If already 36 PRs and 18 users with 2 PRs each, skip to avoid duplicate runs if not forced
        $existingCount = PurchaseRequest::count();
        if ($existingCount === 36) {
            $userCounts = PurchaseRequest::select('user_id', DB::raw('count(*) as c'))->groupBy('user_id')->pluck('c')->all();
            if (count($userCounts) === 18 && min($userCounts) === 2 && max($userCounts) === 2) {
                $this->command?->info("Database already contains exactly 36 purchase requests (2 per user). Skipping seeder.");
                return;
            }
        }

        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS=0;');
        } elseif ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF;');
        }

        try {
            $tablesToClear = [
                'supplier_invoice_land_allocations',
                'land_parcel_transactions',
                'supplier_payment_allocations',
                'supplier_payments',
                'supplier_invoices',
                'purchase_receipt_items',
                'purchase_receipts',
                'purchase_order_items',
                'purchase_orders',
                'purchase_request_quote_recommendations',
                'purchase_quote_recommendations',
                'purchase_request_quotes',
                'purchase_request_supplements',
                'purchase_request_items',
                'purchase_requests',
                'approval_history',
                'audit_logs',
                'system_events',
                'notifications',
            ];

            foreach ($tablesToClear as $table) {
                if (Schema::hasTable($table)) {
                    DB::table($table)->truncate();
                }
            }

            if (Schema::hasTable('supplier_balances')) {
                DB::table('supplier_balances')->update([
                    'total_invoiced' => 0,
                    'total_paid' => 0,
                    'balance' => 0,
                    'last_activity_at' => null,
                    'updated_at' => now(),
                ]);
            }
        } finally {
            if ($driver === 'mysql') {
                DB::statement('SET FOREIGN_KEY_CHECKS=1;');
            } elseif ($driver === 'sqlite') {
                DB::statement('PRAGMA foreign_keys = ON;');
            }
        }

        $parcelDefs = [
            ['ref' => 'قطعة 105 - حي النرجس', 'region' => 'القاهرة الجديدة'],
            ['ref' => 'قطعة B-24 - الحي المالي', 'region' => 'العاصمة الإدارية'],
            ['ref' => 'قطعة 412 - بيت الوطن', 'region' => 'التجمع الخامس'],
            ['ref' => 'قطعة C-18 - حي الياسمين', 'region' => 'الشيخ زايد'],
            ['ref' => 'قطعة 56 - منطقة المستثمرين', 'region' => '6 أكتوبر'],
            ['ref' => 'قطعة 89 - المنطقة الصناعية', 'region' => 'العبور'],
            ['ref' => 'قطعة 204 - كمبوند سراي', 'region' => 'القاهرة الجديدة'],
            ['ref' => 'قطعة A-31 - منطقة الفيلات', 'region' => 'الشروق'],
        ];

        $parcels = [];
        foreach ($parcelDefs as $pd) {
            $parcels[] = LandParcel::firstOrCreate(
                ['parcel_reference' => $pd['ref']],
                [
                    'region' => $pd['region'],
                    'opening_balance' => 1000000,
                    'balance' => 1000000,
                    'is_active' => true,
                ]
            );
        }

        $users = User::where('is_active', true)->orderBy('id')->get();
        $departments = Department::with(['manager', 'siteEngineer'])->get()->keyBy('id');
        $suppliers = Supplier::where('is_active', true)->get();
        $catalogItems = Item::where('is_active', true)->get();

        if ($catalogItems->isEmpty()) {
            $cat = Category::firstOrCreate(['name' => 'مواد عامة'], ['code' => 'GEN', 'is_active' => true]);
            $catalogItems = collect([
                Item::create(['name' => 'حديد تسليح 12 مم', 'sku' => 'ITM-STEEL-12', 'category_id' => $cat->id, 'uom' => 'TON', 'is_active' => true]),
                Item::create(['name' => 'خرسانة مسلحة C30', 'sku' => 'ITM-CONC-C30', 'category_id' => $cat->id, 'uom' => 'M3', 'is_active' => true]),
                Item::create(['name' => 'أسمنت بورتلاندي 50 كجم', 'sku' => 'ITM-CEMT-50', 'category_id' => $cat->id, 'uom' => 'BAG', 'is_active' => true]),
                Item::create(['name' => 'طوب أسمنتي مصمت', 'sku' => 'ITM-BRK-SOL', 'category_id' => $cat->id, 'uom' => 'PCS', 'is_active' => true]),
            ]);
        }

        $siteEngineers = User::whereHas('roles', fn($q) => $q->where('slug', 'site_engineer'))->get();
        $warehouseKeepers = User::whereHas('roles', fn($q) => $q->where('slug', 'warehouse_keeper'))->get();

        $prCounter = 1;
        $poCounter = 1;
        $receiptCounter = 1;

        $noteTemplates = [
            'توريد مواد تأسيس وأعمال إنشائية للمرحلة الحالية للمشروع حسب الرسومات الهندسية',
            'استكمال أعمال العزل والصب للخرسانات المسلحة للأساسات والميدات الرابطة',
            'توريد مستلزمات التشطيب ومواد البناء الدورية لموقع العمل لسرعة التنفيذ',
            'أعمال صب الأعمدة وبلاطة السقف للدور المتكرر بمواصفات معتمدة هندسياً',
            'توريد حديد تسليح ومستلزمات نجارة وحدادة مسلحة للشدات الموقعية',
            'خامات ومستلزمات السباكة والكهرباء وتأسيس المرافق الحيوية للقطعة',
            'أعمال محارة وبياض حوائط واجهات وداخلية مع التشوين المنظم في الموقع',
            'توريد كمالة مواد عاجلة لاستكمال الأعمال دون تعطيل طاقم العمل',
        ];

        $specTemplates = [
            'مطابق للمواصفات القياسية المصرية والكود المصري ECP 203، مع تسليم شهادات الاختبار الفني المعتمدة.',
            'توريد نخب أول معتمد خالي من الشوائب ومطابق للمخططات التنفيذية المعتمدة.',
            'صنف قياسي مطابق لاشتراطات الجودة والمواصفات المعتمدة من الاستشاري الهندسي.',
            'عالي الجودة معتمد من المورد المباشر ومطابق لاشتراطات الأمن والمتانة.',
        ];

        foreach ($users as $userIndex => $user) {
            for ($reqIndex = 1; $reqIndex <= 2; $reqIndex++) {
                $prNum = sprintf('PR-2026-%04d', $prCounter++);

                $userDeptId = $user->department_id ?: 1;
                $targetDeptId = (($userIndex + $reqIndex) % 3) + 1;
                $targetDept = $departments->get($targetDeptId) ?? $departments->first();

                $reviewer = $targetDept?->manager ?: User::where('department_id', $targetDeptId)->whereHas('roles', fn($q) => $q->where('slug', 'reviewer'))->first();
                if (! $reviewer) {
                    $reviewer = User::whereHas('roles', fn($q) => $q->where('slug', 'reviewer'))->first();
                }

                $siteEng = $siteEngineers->get(($userIndex + $reqIndex) % max(1, $siteEngineers->count()));
                $warehouseKeeper = $warehouseKeepers->first();

                $parcel = $parcels[($userIndex * 2 + $reqIndex) % count($parcels)];

                if ($reqIndex === 1) {
                    $statusOptions = ['SUBMITTED', 'UNDER_REVIEW', 'PENDING_EXECUTIVE_APPROVAL', 'DRAFT'];
                    $status = $statusOptions[$userIndex % count($statusOptions)];
                } else {
                    $statusOptions = ['PENDING_PROCUREMENT_APPROVAL', 'APPROVED_BY_REVIEWER', 'PO_ISSUED', 'PO_ISSUED'];
                    $status = $statusOptions[$userIndex % count($statusOptions)];
                }

                if ($user->hasRole('general_manager') && in_array($status, ['SUBMITTED', 'UNDER_REVIEW'])) {
                    $status = 'PENDING_PROCUREMENT_APPROVAL';
                }
                if ($user->hasRole('reviewer') && (int) $userDeptId === (int) $targetDeptId && $status === 'SUBMITTED') {
                    $status = 'PENDING_EXECUTIVE_APPROVAL';
                }

                $note = $noteTemplates[($userIndex * 2 + $reqIndex) % count($noteTemplates)];
                $spec = $specTemplates[($userIndex + $reqIndex) % count($specTemplates)];

                $pr = PurchaseRequest::create([
                    'request_number' => $prNum,
                    'request_type' => 'PROJECT',
                    'parcel_reference' => $parcel->parcel_reference,
                    'region' => $parcel->region,
                    'land_parcel_id' => $parcel->id,
                    'user_id' => $user->id,
                    'department_id' => $userDeptId,
                    'target_department_id' => $targetDeptId,
                    'reviewer_user_id' => $user->hasRole('general_manager') ? null : $reviewer?->id,
                    'site_engineer_user_id' => $siteEng?->id,
                    'priority' => ($userIndex + $reqIndex) % 3 === 0 ? 'URGENT' : (($userIndex + $reqIndex) % 2 === 0 ? 'HIGH' : 'NORMAL'),
                    'status' => $status,
                    'requires_warehouse_receipt' => true,
                    'date_needed' => now()->addDays(5 + ($reqIndex * 3))->toDateString(),
                    'notes' => $note,
                    'submitted_at' => $status !== 'DRAFT' ? now()->subDays(2) : null,
                    'total_estimated_cost' => 0,
                    'created_at' => now()->subDays(2),
                    'updated_at' => now(),
                ]);

                $itemCount = ($userIndex + $reqIndex) % 2 === 0 ? 3 : 2;
                $prTotal = 0;
                $createdPrItems = [];

                for ($it = 0; $it < $itemCount; $it++) {
                    $catItem = $catalogItems[($userIndex * 4 + $reqIndex * 2 + $it) % $catalogItems->count()];
                    $qty = 5 + (($userIndex + $it + 1) * 3);
                    $estUnitPrice = 150 + (($it + 1) * 200);
                    $lineTotal = $qty * $estUnitPrice;
                    $prTotal += $lineTotal;

                    $prItem = PurchaseRequestItem::create([
                        'purchase_request_id' => $pr->id,
                        'item_id' => $catItem->id,
                        'item_description' => $catItem->name,
                        'item_reference' => $parcel->parcel_reference,
                        'region' => $parcel->region,
                        'quantity' => $qty,
                        'uom' => $catItem->uom ?: 'PCS',
                        'estimated_unit_price' => $estUnitPrice,
                        'estimated_line_total' => $lineTotal,
                        'specifications' => $spec,
                        'notes' => "بند توريد رقم " . ($it + 1),
                    ]);
                    $createdPrItems[] = $prItem;
                }

                $pr->update(['total_estimated_cost' => $prTotal]);

                ApprovalHistory::create([
                    'target_type' => PurchaseRequest::class,
                    'target_id' => $pr->id,
                    'actor_user_id' => $user->id,
                    'action' => 'CREATED',
                    'from_state' => null,
                    'to_state' => $status,
                    'comments' => "تم إنشاء طلب الشراء {$prNum} بواسطة {$user->name}",
                    'created_at' => now()->subDays(2),
                ]);

                if ($status === 'PO_ISSUED') {
                    $poNum = sprintf('PO-2026-%04d', $poCounter++);
                    $supplier = $suppliers[($userIndex + $reqIndex) % max(1, $suppliers->count())];

                    $po = PurchaseOrder::create([
                        'po_number' => $poNum,
                        'purchase_request_id' => $pr->id,
                        'supplier_id' => $supplier->id,
                        'created_by_user_id' => 6,
                        'status' => 'ISSUED',
                        'subtotal' => $prTotal,
                        'grand_total' => $prTotal,
                        'payment_terms' => 'نقداً عند التوريد والاستلام المعتمد',
                        'notes' => "أمر شراء صادر للمورد {$supplier->company_name} على الطلب {$prNum}",
                        'created_at' => now()->subDay(),
                        'updated_at' => now(),
                    ]);

                    $createdPoItems = [];
                    foreach ($createdPrItems as $pri) {
                        $createdPoItems[] = PurchaseOrderItem::create([
                            'purchase_order_id' => $po->id,
                            'pr_item_id' => $pri->id,
                            'item_id' => $pri->item_id,
                            'item_description' => $pri->item_description,
                            'item_reference' => $pri->item_reference,
                            'region' => $pri->region,
                            'quantity' => $pri->quantity,
                            'uom' => $pri->uom,
                            'unit_price' => $pri->estimated_unit_price,
                            'line_total' => $pri->estimated_line_total,
                            'specifications' => $pri->specifications,
                        ]);
                    }

                    if ($userIndex % 2 === 0) {
                        $grnNum = sprintf('GRN-2026-%04d', $receiptCounter++);
                        $receiptStatus = ($userIndex % 4 === 0) ? 'APPROVED' : 'PENDING_SITE_ENGINEER';

                        $receipt = PurchaseReceipt::create([
                            'purchase_order_id' => $po->id,
                            'purchase_request_id' => $pr->id,
                            'receipt_number' => $grnNum,
                            'receipt_type' => 'WAREHOUSE',
                            'status' => $receiptStatus,
                            'warehouse_keeper_user_id' => $warehouseKeeper?->id ?: 10,
                            'site_engineer_user_id' => $siteEng?->id ?: 11,
                            'received_at' => now()->subHours(6),
                            'warehouse_submitted_at' => now()->subHours(6),
                            'warehouse_notes' => 'تم استلام وتفريغ الشحنة في المخزن بحالة ممتازة ومطابقة للأختام.',
                            'site_engineer_notes' => $receiptStatus === 'APPROVED' ? 'تم الفحص الهندسي والمطابقة والاعتماد بالموقع.' : null,
                            'created_at' => now()->subHours(6),
                        ]);

                        foreach ($createdPoItems as $poi) {
                            PurchaseReceiptItem::create([
                                'purchase_receipt_id' => $receipt->id,
                                'purchase_order_item_id' => $poi->id,
                                'ordered_quantity' => $poi->quantity,
                                'received_quantity' => $poi->quantity,
                                'notes' => 'مطابق للمواصفات',
                            ]);
                        }
                    }

                    if ($userIndex % 3 === 0) {
                        $suppItem = $createdPrItems[0];
                        $supplement = PurchaseRequestSupplement::create([
                            'purchase_request_id' => $pr->id,
                            'batch_number' => 1,
                            'requested_by_user_id' => $user->id,
                            'reviewer_user_id' => $reviewer?->id,
                            'reviewed_at' => now(),
                            'status' => 'PENDING_PROCUREMENT_APPROVAL',
                            'notes' => 'طلب كمالة إضافية لاستكمال صب باقي المساحة المطلوبة',
                        ]);

                        PurchaseRequestItem::create([
                            'purchase_request_id' => $pr->id,
                            'is_supplementary' => true,
                            'supplement_id' => $supplement->id,
                            'supplement_batch' => 1,
                            'item_id' => $suppItem->item_id,
                            'item_description' => $suppItem->item_description . ' (كمالة إضافية)',
                            'item_reference' => $parcel->parcel_reference,
                            'region' => $parcel->region,
                            'quantity' => 5,
                            'uom' => $suppItem->uom,
                            'estimated_unit_price' => $suppItem->estimated_unit_price,
                            'estimated_line_total' => 5 * $suppItem->estimated_unit_price,
                            'specifications' => $suppItem->specifications,
                            'notes' => 'كمالة إضافية تابعة لنفس المشروع',
                        ]);

                        $pr->increment('total_estimated_cost', 5 * $suppItem->estimated_unit_price);
                    }
                }
            }
        }

        $this->command?->info("Successfully seeded exactly 2 PRs per active user (Total 36 PRs)!");
    }
}
