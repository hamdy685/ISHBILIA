<?php

namespace Database\Seeders;

use App\Models\ApprovalHistory;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BulkPurchaseRequestSeeder extends Seeder
{
    private array $regions = [
        ['parcel' => 'قطعة 105 - حي النرجس', 'region' => 'القاهرة الجديدة'],
        ['parcel' => 'قطعة B-24 - الحي المالي', 'region' => 'العاصمة الإدارية'],
        ['parcel' => 'قطعة 412 - بيت الوطن', 'region' => 'التجمع الخامس'],
        ['parcel' => 'قطعة C-18 - حي الياسمين', 'region' => 'الشيخ زايد'],
        ['parcel' => 'قطعة 56 - منطقة المستثمرين', 'region' => '6 أكتوبر'],
        ['parcel' => 'قطعة 89 - المنطقة الصناعية', 'region' => 'العبور'],
        ['parcel' => 'قطعة 204 - كمبوند سراي', 'region' => 'القاهرة الجديدة'],
        ['parcel' => 'قطعة A-31 - منطقة الفيلات', 'region' => 'الشروق'],
        ['parcel' => 'قطعة 715 - المجاورة الثالثة', 'region' => 'الشروق'],
        ['parcel' => 'قطعة 92 - جنوب الأكاديمية', 'region' => 'التجمع الأول'],
        ['parcel' => 'قطعة D-15 - حدائق الأهرام', 'region' => 'الجيزة'],
        ['parcel' => 'قطعة 330 - الامتداد الشرقي', 'region' => 'بدر'],
        ['parcel' => 'قطعة M-45 - المستثمر الصغير', 'region' => 'العاشر من رمضان'],
        ['parcel' => 'قطعة E-12 - منطقة النوادي', 'region' => 'التجمع الخامس'],
    ];

    private array $noteTemplates = [
        'صب خرسانة مسلحة لأعمدة وسقف الدور الأول فوق الأرضي للمبنى الرئيسي',
        'أعمال صب القواعد المسلحة والميدات الرابطة للقطعة والمباني الملحقة',
        'استكمال حوائط المباني الداخلية والخارجية للدور الأرضي مع الشدات الخشبية',
        'عزل رطوبة وحرارة للأسطح والقواعد وميدات الأساسات قبل الردم',
        'تجهيز وتوريد حديد التسليح وشبكات الأرضيات لبلاطة السقف والجراج',
        'توريد سقالات ومستلزمات شدات معدنية لأعمال الواجهات الخارجية',
        'أعمال خرسانة النظافة وتأسيس الميدات الأرضية للمشروع',
        'توريد مواد البناء الأساسية وأسمنت التشطيبات لأعمال الموقع',
        'استكمال عزل الحمامات والمطابخ والسطح واختبار المياه',
        'أعمال شدات وقوالب خشبية للأعمدة الدائرية والحوائط الخرسانية',
        'توريد خامات ومستلزمات تأسيس الأعمال الإنشائية للمرحلة الحالية',
        'تجهيز حديد كمرات وبلاطات السقف مع فواصل التمدد والهبوط',
    ];

    private array $specTemplates = [
        'مطابق للمواصفات القياسية المصرية والكود المصري ECP 203، مع تقديم شهادة الاختبار الفني',
        'حديد تسليح صلب عالي المقاومة رتبة 400/600 B من مصنع معتمد ومطابق للرسومات الإنشائية',
        'خرسانة جاهزة رتبة C30 توريد محطة خلط معتمدة ومطابقة لمواصفات المشروع',
        'أسمنت بورتلاندي عادي معبأ حديثاً ومطابق للمواصفة القياسية المصرية ES 4756-1',
        'طوب أحمر مفرغ نخب أول مطابق للمقاسات الهندسية ومواصفات العزل',
        'لفائف بيتومين مسلحة بالبوليستر سمك 4 مم مع ضمان 10 سنوات ضد التسريب',
        'أخشاب بونتي وموسكي نخب أول مستوردة وخالية من العقد والتشوهات لأعمال القوالب',
        'سقالات معدنية ثقيلة مطابقة لاشتراطات السلامة والصحة المهنية ومعتمدة',
        'رمل مغسول خالي من الأملاح والشوائب الطينية ومطابق للتدرج الحبيبي القياسي',
        'زلط سن 2 متدرج ونظيف مطابق للمواصفات ومعتمد لخلطات الخرسانة المسلحة',
        'ملدنات وإضافات كيميائية معتمدة لزيادة قابلية التشغيل وتقليل نسبة الماء',
        'سلك رباط صلب مجلفن نمرة 16 عالي المرونة والقوة للحدادة المسلحة',
    ];

    public function run(): void
    {
        // Skip if already seeded with at least 85 clean PRs to keep container restarts fast
        $existingCount = PurchaseRequest::count();
        if ($existingCount >= 85) {
            $this->command?->info("Database already contains {$existingCount} purchase requests. Skipping seeder.");
            return;
        }

        try {
            Schema::disableForeignKeyConstraints();
        } catch (\Throwable $e) {}

        // Clean all PR-related tables
        $tablesToClear = [
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
            'notifications',
            'attachments',
        ];

        foreach ($tablesToClear as $table) {
            if (Schema::hasTable($table)) {
                DB::table($table)->delete();
            }
        }

        try {
            Schema::enableForeignKeyConstraints();
        } catch (\Throwable $e) {}

        DB::beginTransaction();

        try {
            $allItems = Item::with('category')->get();
            $itemsByCategory = $allItems->groupBy(fn ($i) => $i->category_id);
            $categoryIds = $itemsByCategory->keys()->toArray();

            // Load real departments dynamically
            $departments = Department::where('is_active', true)->get();
            if ($departments->isEmpty()) {
                $departments = Department::all();
            }

            $deptExecution = $departments->firstWhere('code', 'EXECUTION') ?? $departments->first();
            $deptBuildings = $departments->firstWhere('code', 'BUILDINGS') ?? $departments->skip(1)->first() ?? $deptExecution;
            $deptFinishing = $departments->firstWhere('code', 'FINISHING') ?? $departments->skip(2)->first() ?? $deptExecution;
            $deptLicenses = $departments->firstWhere('code', 'LICENSES') ?? $departments->skip(3)->first() ?? $deptExecution;
            $deptBuffet = $departments->firstWhere('code', 'BUFFET') ?? $departments->skip(4)->first() ?? $deptExecution;

            // Load real site engineers dynamically
            $siteEngineers = User::where('is_active', true)
                ->whereHas('roles', fn ($q) => $q->where('slug', 'site_engineer'))
                ->get();

            if ($siteEngineers->isEmpty()) {
                $siteEngineers = User::where('is_active', true)->get();
            }
            $siteEngineerIds = $siteEngineers->pluck('id')->toArray();

            // Load all real active users
            $users = User::where('is_active', true)->with(['roles', 'department'])->get();
            if ($users->isEmpty()) {
                $users = User::all();
            }

            $prCounter = 1;
            $totalCreated = 0;
            $totalItems = 0;

            foreach ($users as $user) {
                // 5 request profiles per user
                $requestProfiles = [
                    [
                        'status' => 'DRAFT',
                        'priority' => 'NORMAL',
                        'target_dept' => $deptExecution,
                        'days_ahead' => 10,
                        'num_items' => 7,
                        'num_cats' => 4,
                    ],
                    [
                        'status' => 'SUBMITTED',
                        'priority' => 'URGENT',
                        'target_dept' => $deptBuildings,
                        'days_ahead' => 14,
                        'num_items' => 9,
                        'num_cats' => 4,
                    ],
                    [
                        'status' => 'SUBMITTED',
                        'priority' => 'NORMAL',
                        'target_dept' => $deptFinishing,
                        'days_ahead' => 18,
                        'num_items' => 8,
                        'num_cats' => 4,
                    ],
                    [
                        'status' => 'SUBMITTED',
                        'priority' => 'HIGH',
                        'target_dept' => $deptExecution,
                        'days_ahead' => 21,
                        'num_items' => 10,
                        'num_cats' => 5,
                    ],
                    [
                        'status' => 'SUBMITTED',
                        'priority' => 'URGENT',
                        'target_dept' => ($user->id % 2 === 0 ? $deptLicenses : $deptBuffet),
                        'days_ahead' => 25,
                        'num_items' => 7,
                        'num_cats' => 3,
                    ],
                ];

                foreach ($requestProfiles as $pIdx => $profile) {
                    $loc = $this->pick($this->regions);
                    $parcel = $loc['parcel'];
                    $region = $loc['region'];

                    /** @var Department $targetDept */
                    $targetDept = $profile['target_dept'];

                    // Determine manager dynamically
                    $targetManagerId = $targetDept->manager_user_id;
                    if (! $targetManagerId) {
                        $reviewer = User::where('department_id', $targetDept->id)
                            ->whereHas('roles', fn ($q) => $q->where('slug', 'reviewer'))
                            ->first();
                        $targetManagerId = $reviewer?->id;
                    }
                    if (! $targetManagerId) {
                        $reviewer = User::whereHas('roles', fn ($q) => $q->where('slug', 'reviewer'))->first();
                        $targetManagerId = $reviewer?->id ?? $user->id;
                    }

                    $isGM = $user->hasRole('general_manager');
                    $reviewerUserId = $isGM ? null : $targetManagerId;
                    $siteEngId = ! empty($siteEngineerIds) ? $this->pick($siteEngineerIds) : null;

                    $dateNeeded = now()->addDays($profile['days_ahead'])->format('Y-m-d');
                    $notes = $this->pick($this->noteTemplates);

                    $prNumber = sprintf('PR-2026-%05d', $prCounter);
                    $prCounter++;

                    $status = $profile['status'];
                    $submittedAt = ($status === 'SUBMITTED')
                        ? now()->subDays(5 - $pIdx)->subHours(mt_rand(1, 12))
                        : null;

                    $requiresWarehouseReceipt = ($targetDept->code !== 'BUILDINGS');

                    $pr = PurchaseRequest::create([
                        'request_number' => $prNumber,
                        'request_type' => 'PROJECT',
                        'parcel_reference' => $parcel,
                        'region' => $region,
                        'user_id' => $user->id,
                        'department_id' => $user->department_id ?? $targetDept->id,
                        'target_department_id' => $targetDept->id,
                        'reviewer_user_id' => $reviewerUserId,
                        'site_engineer_user_id' => $siteEngId,
                        'priority' => $profile['priority'],
                        'status' => $status,
                        'procurement_route' => 'UNDECIDED',
                        'total_estimated_cost' => 0, // STRICTLY ZERO
                        'date_needed' => $dateNeeded,
                        'notes' => $notes,
                        'submitted_at' => $submittedAt,
                        'requires_warehouse_receipt' => $requiresWarehouseReceipt,
                    ]);

                    // Pick diverse categories for this request
                    $shuffledCats = $categoryIds;
                    shuffle($shuffledCats);
                    $selectedCats = array_slice($shuffledCats, 0, $profile['num_cats']);

                    for ($itemIdx = 0; $itemIdx < $profile['num_items']; $itemIdx++) {
                        $catId = ! empty($selectedCats) ? $selectedCats[$itemIdx % count($selectedCats)] : null;
                        $catItems = $catId ? $itemsByCategory->get($catId) : null;
                        if (! $catItems || $catItems->isEmpty()) {
                            $item = $allItems->isNotEmpty() ? $allItems->random() : null;
                        } else {
                            $item = $catItems->random();
                        }

                        if (! $item) {
                            continue;
                        }

                        $qty = $this->qtyForUom($item->uom);
                        $spec = $this->pick($this->specTemplates);

                        PurchaseRequestItem::create([
                            'purchase_request_id' => $pr->id,
                            'item_id' => $item->id,
                            'item_description' => $item->name,
                            'item_reference' => $parcel,
                            'region' => $region,
                            'quantity' => $qty,
                            'uom' => $item->uom,
                            'estimated_unit_price' => 0, // STRICTLY ZERO
                            'estimated_line_total' => 0, // STRICTLY ZERO
                            'specifications' => $spec,
                            'notes' => null,
                        ]);
                        $totalItems++;
                    }

                    AuditLog::create([
                        'user_id' => $user->id,
                        'action' => 'CREATED',
                        'entity_type' => PurchaseRequest::class,
                        'entity_id' => $pr->id,
                        'new_value' => json_encode([
                            'request_number' => $pr->request_number,
                            'status' => $status,
                            'items_count' => $profile['num_items'],
                        ], JSON_UNESCAPED_UNICODE),
                        'created_at' => $submittedAt ?? now(),
                    ]);

                    if ($status === 'SUBMITTED') {
                        ApprovalHistory::create([
                            'target_type' => PurchaseRequest::class,
                            'target_id' => $pr->id,
                            'actor_user_id' => $user->id,
                            'action' => 'SUBMITTED',
                            'from_state' => 'DRAFT',
                            'to_state' => 'SUBMITTED',
                            'comments' => 'تم تقديم طلب الشراء وإحالته لمراجع القسم المختص.',
                            'created_at' => $submittedAt,
                        ]);
                    }

                    $totalCreated++;
                }

                $this->command?->info("✅ {$user->name}: 5 PRs created successfully.");
            }

            DB::commit();
            $this->command?->info("============================================");
            $this->command?->info("SUCCESS: Created {$totalCreated} Purchase Requests with {$totalItems} total items across {$users->count()} users!");
            $this->command?->info("============================================");

        } catch (\Exception $e) {
            DB::rollBack();
            $this->command?->error("ERROR: {$e->getMessage()} in {$e->getFile()}:{$e->getLine()}");
            throw $e;
        }
    }

    private function pick(array $arr): mixed
    {
        return $arr[array_rand($arr)];
    }

    private function qtyForUom(string $uom): float
    {
        return match ($uom) {
            'M3' => round(mt_rand(15, 120) + mt_rand(0, 99) / 100, 2),
            'BAG' => mt_rand(50, 400),
            'TON' => round(mt_rand(2, 35) + mt_rand(0, 99) / 100, 2),
            'KG' => mt_rand(50, 1500),
            'M2' => round(mt_rand(50, 400) + mt_rand(0, 99) / 100, 2),
            'ML' => round(mt_rand(20, 250) + mt_rand(0, 99) / 100, 2),
            'PCS' => mt_rand(50, 800),
            'SET' => mt_rand(2, 15),
            'ROLL' => mt_rand(5, 40),
            'DRUM' => mt_rand(2, 15),
            'LITER' => mt_rand(20, 150),
            default => mt_rand(10, 100),
        };
    }
}
