<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Services\SystemPurgeService;
use Illuminate\Database\Seeder;

final class ClearPurchaseCycleDemoDataSeeder extends Seeder
{
    /**
     * يحذف بيانات دورة الشراء التشغيلية فقط، ولا يلمس المستخدمين أو الموردين
     * أو الأصناف أو الأقسام أو الصلاحيات أو الأدوار.
     */
    public function run(SystemPurgeService $purgeService): void
    {
        $result = $purgeService->purgeOperationalPurchasingData();

        $this->command?->info('تم حذف بيانات دورة الشراء التجريبية فقط بنجاح.');
        $this->command?->line(json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        $this->command?->line('تم الحفاظ على المستخدمين والموردين والأصناف والأقسام والأدوار والصلاحيات.');
    }
}
