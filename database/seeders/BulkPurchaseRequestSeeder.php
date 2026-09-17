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
        $allItems = Item::with('category')->get();
        $itemsByCategory = $allItems->groupBy(fn ($i) => $i->category_id);
        $categoryIds = $itemsByCategory->keys()->toArray();
        $users = User::with(['roles', 'department'])->get();

        // Department managers mapping
        $deptManagers = [
            1 => 1, // التنفيذ -> م. أيمن ماهر
            2 => 2, // المباني -> المهندس حاتم
            3 => 3, // التشطيبات -> المهندس مصطفى الخشن
            4 => 4, // التراخيص -> م. مصطفى
            5 => 5, // البوفيه -> أ. عمرو
        ];

        // Site engineers
        $siteEngineerIds = [11, 12, 13, 14];

        // If database is already seeded with at least 90 PRs, skip re-seeding to keep startup fast
        $existingCount = PurchaseRequest::count();
        if ($existingCount >= 90) {
            $this->command->info("Database already contains {$existingCount} purchase requests. Skipping seeder.");
            return;
        }

        DB::beginTransaction();

        try {
            // Find all PR IDs that are protected (referenced by orders, receipts, supplements, quotes)
            $protectedPrIds = array_unique(array_filter(array_merge(
                DB::table('purchase_orders')->whereNotNull('purchase_request_id')->pluck('purchase_request_id')->toArray(),
                DB::table('purchase_receipts')->whereNotNull('purchase_request_id')->pluck('purchase_request_id')->toArray(),
                DB::table('purchase_request_supplements')->pluck('purchase_request_id')->toArray(),
                DB::table('purchase_request_quotes')->pluck('purchase_request_id')->toArray(),
                [18]
            )));

            $deletablePrIds = PurchaseRequest::whereNotIn('id', $protectedPrIds)->pluck('id')->toArray();
            if (!empty($deletablePrIds)) {
                $driver = DB::getDriverName();
                if ($driver === 'mysql') {
                    DB::statement('SET FOREIGN_KEY_CHECKS=0;');
                } elseif ($driver === 'sqlite') {
                    DB::statement('PRAGMA foreign_keys = OFF;');
                }

                PurchaseRequestItem::whereIn('purchase_request_id', $deletablePrIds)->delete();
                ApprovalHistory::where('target_type', PurchaseRequest::class)
                    ->whereIn('target_id', $deletablePrIds)
                    ->delete();
                AuditLog::where('entity_type', PurchaseRequest::class)
                    ->whereIn('entity_id', $deletablePrIds)
                    ->delete();
                PurchaseRequest::whereIn('id', $deletablePrIds)->forceDelete();

                if ($driver === 'mysql') {
                    DB::statement('SET FOREIGN_KEY_CHECKS=1;');
                } elseif ($driver === 'sqlite') {
                    DB::statement('PRAGMA foreign_keys = ON;');
                }
            }

            // Ensure any protected PRs have 0 estimated cost
            PurchaseRequest::whereIn('id', $protectedPrIds)->update(['total_estimated_cost' => 0]);
            PurchaseRequestItem::whereIn('purchase_request_id', $protectedPrIds)->update([
                'estimated_unit_price' => 0,
                'estimated_line_total' => 0,
            ]);

            $prCounter = 1;
            $totalCreated = 0;
            $totalItems = 0;

            // Define the 5 request profiles for each user
            $requestProfiles = [
                [
                    'status' => 'DRAFT',
                    'priority' => 'normal',
                    'target_dept' => 1, // التنفيذ
                    'days_ahead' => 7,
                    'num_items' => 8,
                    'num_cats' => 4,
                ],
                [
                    'status' => 'SUBMITTED',
                    'priority' => 'urgent',
                    'target_dept' => 2, // المباني
                    'days_ahead' => 12,
                    'num_items' => 10,
                    'num_cats' => 4,
                ],
                [
                    'status' => 'UNDER_REVIEW',
                    'priority' => 'normal',
                    'target_dept' => 3, // التشطيبات
                    'days_ahead' => 15,
                    'num_items' => 9,
                    'num_cats' => 3,
                ],
                [
                    'status' => 'APPROVED_BY_REVIEWER',
                    'priority' => 'critical',
                    'target_dept' => 1, // التنفيذ
                    'days_ahead' => 18,
                    'num_items' => 11,
                    'num_cats' => 5,
                ],
                [
                    'status' => 'APPROVED_BY_GM',
                    'priority' => 'urgent',
                    'target_dept' => 4, // التراخيص
                    'days_ahead' => 22,
                    'num_items' => 8,
                    'num_cats' => 3,
                ],
            ];

            foreach ($users as $user) {
                foreach ($requestProfiles as $pIdx => $profile) {
                    $loc = $this->pick($this->regions);
                    $parcel = $loc['parcel'];
                    $region = $loc['region'];

                    $targetDeptId = $profile['target_dept'];
                    $targetManagerId = $deptManagers[$targetDeptId] ?? 1;

                    // If user is GM, no reviewer
                    $reviewerUserId = $user->hasRole('general_manager') ? null : $targetManagerId;
                    $siteEngId = $this->pick($siteEngineerIds);

                    $dateNeeded = now()->addDays($profile['days_ahead'])->format('Y-m-d');
                    $notes = $this->pick($this->noteTemplates);

                    $prNumber = sprintf('PR-2026-%05d', $prCounter);
                    $prCounter++;

                    $status = $profile['status'];
                    $submittedAt = in_array($status, ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED_BY_REVIEWER', 'APPROVED_BY_GM'])
                        ? now()->subDays(mt_rand(1, 5))
                        : null;

                    $pr = PurchaseRequest::create([
                        'request_number' => $prNumber,
                        'request_type' => 'purchase',
                        'parcel_reference' => $parcel,
                        'region' => $region,
                        'user_id' => $user->id,
                        'department_id' => $user->department_id ?? 1,
                        'target_department_id' => $targetDeptId,
                        'reviewer_user_id' => $reviewerUserId,
                        'site_engineer_user_id' => $siteEngId,
                        'priority' => $profile['priority'],
                        'status' => $status,
                        'total_estimated_cost' => 0, // STRICTLY ZERO
                        'date_needed' => $dateNeeded,
                        'notes' => $notes,
                        'submitted_at' => $submittedAt,
                        'requires_warehouse_receipt' => true,
                    ]);

                    // Pick diverse categories for this request
                    $shuffledCats = $categoryIds;
                    shuffle($shuffledCats);
                    $selectedCats = array_slice($shuffledCats, 0, $profile['num_cats']);

                    // Distribute items across selected categories
                    for ($itemIdx = 0; $itemIdx < $profile['num_items']; $itemIdx++) {
                        $catId = $selectedCats[$itemIdx % count($selectedCats)];
                        $catItems = $itemsByCategory->get($catId);
                        if (!$catItems || $catItems->isEmpty()) {
                            $item = $allItems->random();
                        } else {
                            $item = $catItems->random();
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

                    // Create AuditLog & ApprovalHistory according to status
                    AuditLog::create([
                        'user_id' => $user->id,
                        'action' => 'CREATED',
                        'entity_type' => PurchaseRequest::class,
                        'entity_id' => $pr->id,
                        'new_value' => json_encode([
                            'request_number' => $pr->request_number,
                            'status' => 'DRAFT',
                            'items_count' => $profile['num_items'],
                        ], JSON_UNESCAPED_UNICODE),
                    ]);

                    if ($status === 'SUBMITTED' || $status === 'UNDER_REVIEW' || $status === 'APPROVED_BY_REVIEWER' || $status === 'APPROVED_BY_GM') {
                        ApprovalHistory::create([
                            'target_type' => PurchaseRequest::class,
                            'target_id' => $pr->id,
                            'actor_user_id' => $user->id,
                            'action' => 'SUBMITTED',
                            'from_state' => 'DRAFT',
                            'to_state' => 'SUBMITTED',
                            'comments' => 'تم تقديم طلب الشراء وإحالته لمراجع القسم المختص.',
                        ]);
                    }

                    if ($status === 'UNDER_REVIEW' || $status === 'APPROVED_BY_REVIEWER' || $status === 'APPROVED_BY_GM') {
                        ApprovalHistory::create([
                            'target_type' => PurchaseRequest::class,
                            'target_id' => $pr->id,
                            'actor_user_id' => $reviewerUserId ?? 1,
                            'action' => 'START_REVIEW',
                            'from_state' => 'SUBMITTED',
                            'to_state' => 'UNDER_REVIEW',
                            'comments' => 'بدأ مراجع القسم بمراجعة البنود والمواصفات الفنية للطلب.',
                        ]);
                    }

                    if ($status === 'APPROVED_BY_REVIEWER' || $status === 'APPROVED_BY_GM') {
                        ApprovalHistory::create([
                            'target_type' => PurchaseRequest::class,
                            'target_id' => $pr->id,
                            'actor_user_id' => $reviewerUserId ?? 1,
                            'action' => 'APPROVED_BY_REVIEWER',
                            'from_state' => 'UNDER_REVIEW',
                            'to_state' => 'PENDING_EXECUTIVE_APPROVAL',
                            'comments' => 'اعتمد مراجع القسم بنود وكميات الطلب وتم رفعه للإدارة العامة للموافقة والتوجيه.',
                        ]);
                    }

                    if ($status === 'APPROVED_BY_GM') {
                        ApprovalHistory::create([
                            'target_type' => PurchaseRequest::class,
                            'target_id' => $pr->id,
                            'actor_user_id' => 8, // المهندس محمد عبدالكريم (المدير العام)
                            'action' => 'APPROVED_BY_GM',
                            'from_state' => 'PENDING_EXECUTIVE_APPROVAL',
                            'to_state' => 'PENDING_PROCUREMENT_APPROVAL',
                            'comments' => 'وافق المدير العام على الطلب وأحاله لإدارة المشتريات للبدء في إجراءات الشراء والتسعير.',
                        ]);
                    }

                    $totalCreated++;
                }

                $this->command->info("✅ {$user->name}: 5 PRs created with diverse categories & 8-11 items each.");
            }

            DB::commit();
            $this->command->info("============================================");
            $this->command->info("SUCCESS: Created {$totalCreated} Purchase Requests with {$totalItems} total items across 18 users!");
            $this->command->info("============================================");

        } catch (\Exception $e) {
            DB::rollBack();
            $this->command->error("ERROR: {$e->getMessage()} in {$e->getFile()}:{$e->getLine()}");
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
