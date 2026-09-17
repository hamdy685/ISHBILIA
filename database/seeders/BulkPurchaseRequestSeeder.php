<?php

namespace Database\Seeders;

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
        'القاهرة الجديدة', 'الشيخ زايد', '6 أكتوبر', 'المعادي', 'العاصمة الإدارية',
        'العبور', 'الشروق', 'بدر', 'المستقبل سيتي', 'هليوبوليس الجديدة',
        'الرحاب', 'مدينتي', 'حدائق أكتوبر', 'جاردن سيتي',
    ];

    private array $parcelRefs = [
        'قطعة A-101', 'قطعة A-102', 'قطعة A-103', 'قطعة B-201', 'قطعة B-202',
        'قطعة B-203', 'قطعة C-301', 'قطعة C-302', 'قطعة D-401', 'قطعة D-402',
        'قطعة E-501', 'قطعة E-502', 'قطعة F-601', 'قطعة F-602', 'قطعة G-701',
        'قطعة H-801', 'قطعة I-901', 'قطعة J-1001', 'قطعة K-1101', 'قطعة L-1201',
    ];

    private array $noteTemplates = [
        'مطلوب بشكل عاجل للدور %d — الأعمال الإنشائية',
        'توريد مواد الأساسات والميدات — قطعة %s',
        'استكمال أعمال الشدات والقوالب للبلاطات',
        'تجهيز مواد الأعمدة والكمرات — المرحلة الثانية',
        'مواد تشطيبات داخلية وخارجية للفيلا',
        'استكمال مواد العزل والسباكة والكهرباء',
        'طلب مواد بناء متنوعة لأعمال المباني',
        'مواد التسليح والحديد — الأعمدة والأسقف',
        'متطلبات موقع %s — مرحلة الإنشاء',
        'توريد أخشاب شدات وسقالات',
        'أعمال صب خرسانة — القواعد المسلحة',
        'مواد البناء الأساسية للمشروع',
        'طلب مستلزمات إنشائية — الدور الأرضي',
        'توريد مواد تأسيس كهرباء وسباكة',
        'مواد عزل وحماية الأساسات',
    ];

    private array $specTemplates = [
        'وفقاً للمواصفات الفنية المعتمدة',
        'مطابق للكود المصري — ECP',
        'يجب أن يكون من إنتاج محلي معتمد',
        'ماركة محلية معتمدة أو مستوردة بشرط الجودة',
        'حسب المواصفات المرفقة بالمخطط التنفيذي',
        'يفضل نفس المورد السابق لضمان التجانس',
        'يجب توفير شهادة جودة مع التوريد',
        'مقاسات حسب اللوحات التنفيذية',
        'يراعى مطابقة العينة المعتمدة',
        null, null, null,
    ];

    public function run(): void
    {
        $allItems = Item::with('category')->get();
        $itemsByCategory = $allItems->groupBy(fn ($i) => $i->category_id);
        $categoryIds = $itemsByCategory->keys()->toArray();
        $deptIds = Department::pluck('id')->toArray();
        $users = User::with(['roles', 'department'])->get();

        $existingNumbers = PurchaseRequest::pluck('request_number')->toArray();
        $prCounter = count($existingNumbers) + 1;
        $totalCreated = 0;
        $totalItems = 0;

        DB::beginTransaction();

        try {
            foreach ($users as $user) {
                for ($prIdx = 1; $prIdx <= 5; $prIdx++) {
                    $region = $this->pick($this->regions);
                    $parcel = $this->pick($this->parcelRefs);
                    $priority = $this->weightedPriority();
                    $notes = sprintf($this->pick($this->noteTemplates), mt_rand(1, 8), $parcel, $region);
                    $targetDeptId = mt_rand(1, 100) > 60 ? $this->pick($deptIds) : ($user->department_id ?? 1);
                    $numItems = mt_rand(4, 10);

                    $shuffledCats = $categoryIds;
                    shuffle($shuffledCats);
                    $selectedCatIds = array_slice($shuffledCats, 0, min(mt_rand(2, 5), count($shuffledCats)));

                    $statuses = ['SUBMITTED', 'SUBMITTED', 'SUBMITTED', 'SUBMITTED', 'APPROVED_BY_REVIEWER', 'APPROVED_BY_REVIEWER', 'APPROVED_BY_GM'];
                    $status = $this->pick($statuses);
                    $dateNeeded = now()->addDays(mt_rand(3, 30))->format('Y-m-d');

                    $prNumber = $this->generatePrNumber($prCounter);
                    while (in_array($prNumber, $existingNumbers)) {
                        $prNumber = $this->generatePrNumber($prCounter);
                    }
                    $existingNumbers[] = $prNumber;

                    $pr = PurchaseRequest::create([
                        'request_number' => $prNumber,
                        'request_type' => 'purchase',
                        'parcel_reference' => $parcel,
                        'region' => $region,
                        'user_id' => $user->id,
                        'department_id' => $user->department_id ?? 1,
                        'target_department_id' => $targetDeptId,
                        'priority' => $priority,
                        'status' => $status,
                        'total_estimated_cost' => 0,
                        'date_needed' => $dateNeeded,
                        'notes' => $notes,
                        'submitted_at' => now()->subDays(mt_rand(0, 14)),
                    ]);

                    $totalCost = 0;

                    for ($i = 0; $i < $numItems; $i++) {
                        $catId = $this->pick($selectedCatIds);
                        $catItems = $itemsByCategory->get($catId);
                        if (! $catItems || $catItems->isEmpty()) {
                            continue;
                        }

                        $item = $catItems->random();
                        $qty = $this->qtyForUom($item->uom);
                        $unitPrice = $this->priceForUom($item->uom);
                        $lineTotal = round($qty * $unitPrice, 2);
                        $totalCost += $lineTotal;

                        PurchaseRequestItem::create([
                            'purchase_request_id' => $pr->id,
                            'item_id' => $item->id,
                            'item_description' => $item->name,
                            'item_reference' => $parcel,
                            'region' => $region,
                            'quantity' => $qty,
                            'uom' => $item->uom,
                            'estimated_unit_price' => $unitPrice,
                            'estimated_line_total' => $lineTotal,
                            'specifications' => $this->pick($this->specTemplates),
                            'notes' => null,
                        ]);
                        $totalItems++;
                    }

                    $pr->update(['total_estimated_cost' => $totalCost]);
                    $totalCreated++;
                }

                $this->command->info("✅ {$user->name}: 5 PRs created");
            }

            DB::commit();
            $this->command->info("============================================");
            $this->command->info("Total PRs: {$totalCreated} | Total items: {$totalItems}");
            $this->command->info("============================================");

        } catch (\Exception $e) {
            DB::rollBack();
            $this->command->error("ERROR: {$e->getMessage()}");
        }
    }

    private function pick(array $arr): mixed
    {
        return $arr[array_rand($arr)];
    }

    private function weightedPriority(): string
    {
        $r = mt_rand(1, 100);
        if ($r <= 60) return 'normal';
        if ($r <= 90) return 'urgent';
        return 'critical';
    }

    private function generatePrNumber(int &$counter): string
    {
        $num = str_pad($counter, 4, '0', STR_PAD_LEFT);
        $counter++;
        return "PR-2026-{$num}";
    }

    private function qtyForUom(string $uom): float
    {
        return match ($uom) {
            'M3' => round(mt_rand(5, 200) + mt_rand(0, 99) / 100, 2),
            'BAG' => mt_rand(20, 500),
            'TON' => round(mt_rand(1, 50) + mt_rand(0, 99) / 100, 2),
            'KG' => mt_rand(50, 2000),
            'M2' => round(mt_rand(10, 500) + mt_rand(0, 99) / 100, 2),
            'ML' => round(mt_rand(5, 200) + mt_rand(0, 99) / 100, 2),
            'PCS' => mt_rand(10, 300),
            'SET' => mt_rand(1, 20),
            'ROLL' => mt_rand(2, 50),
            'DRUM' => mt_rand(1, 20),
            'LITER' => mt_rand(5, 100),
            default => mt_rand(5, 100),
        };
    }

    private function priceForUom(string $uom): float
    {
        return match ($uom) {
            'M3' => round(mt_rand(300, 3000) + mt_rand(0, 99) / 100, 2),
            'BAG' => round(mt_rand(30, 200) + mt_rand(0, 99) / 100, 2),
            'TON' => round(mt_rand(8000, 30000) + mt_rand(0, 99) / 100, 2),
            'KG' => round(mt_rand(5, 80) + mt_rand(0, 99) / 100, 2),
            'M2' => round(mt_rand(50, 500) + mt_rand(0, 99) / 100, 2),
            'ML' => round(mt_rand(20, 300) + mt_rand(0, 99) / 100, 2),
            'PCS' => round(mt_rand(10, 500) + mt_rand(0, 99) / 100, 2),
            'SET' => round(mt_rand(200, 5000) + mt_rand(0, 99) / 100, 2),
            'ROLL' => round(mt_rand(100, 2000) + mt_rand(0, 99) / 100, 2),
            'DRUM' => round(mt_rand(500, 5000) + mt_rand(0, 99) / 100, 2),
            'LITER' => round(mt_rand(15, 200) + mt_rand(0, 99) / 100, 2),
            default => round(mt_rand(20, 1000) + mt_rand(0, 99) / 100, 2),
        };
    }
}
