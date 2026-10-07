<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Services\SystemPurgeService;
use Illuminate\Database\Seeder;

final class CleanProductionPurgeSeeder extends Seeder
{
    /**
     * تصفير وحذف دورة المشتريات والطلبات والحركات التشغيلية تمهيداً للإطلاق في بيئة الإنتاج.
     * مع الحفاظ التام والصارم على المستخدمين، الأدوار، الصلاحيات، الأقسام، الأصناف، والموردين.
     */
    public function run(SystemPurgeService $purgeService): void
    {
        $this->command?->info('جاري تصفير طلبات الشراء والحركات التشغيلية للإنتاج...');

        $result = $purgeService->purgeOperationalPurchasingData();

        $this->command?->newLine();
        $this->command?->info('📊 ملخص الجداول التشغيلية المفرغة:');
        if ($this->command) {
            $purgedRows = [];
            foreach ($result['purged_counts'] as $table => $count) {
                $purgedRows[] = [$table, $count, 'تم الحذف والتفريغ'];
            }
            $this->command->table(['الجدول', 'السجلات المحذوفة', 'الحالة'], $purgedRows);

            $this->command->newLine();
            $this->command->info('🛡️ تأكيد حماية الجداول الأساسية:');
            $preservedRows = [];
            foreach ($result['preserved_counts'] as $table => $count) {
                $preservedRows[] = [$table, $count, 'محفوظ 100%'];
            }
            $this->command->table(['الجدول الأساسي', 'السجلات المحفوظة', 'الحالة'], $preservedRows);
        }

        $this->command?->newLine();
        $this->command?->info('✅ تم تفريغ وتصفير دورة المشتريات بنجاح تام، والنظام جاهز لبدء العمليات الفعلية.');
    }
}
