<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\SystemPurgeService;
use Illuminate\Console\Command;

class ResetSystemTransactions extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'system:reset-transactions {--force : Force operation without confirmation}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Zero out all transactional data (PRs, POs, Receipts, Quotes, Supplements, Invoices, Payments, Notifications) while preserving users, roles, permissions, departments, suppliers, and catalog items.';

    /**
     * Execute the console command.
     */
    public function handle(SystemPurgeService $purgeService): int
    {
        if (! $this->option('force') && ! $this->confirm('هل أنت متأكد من رغبتك في تصفير جميع حركات المعاملات والطلبات والفواتير والإشعارات في النظام والبدء من الصفر للإنتاج؟ (لن يتم المساس بالمستخدمين أو الموردين أو الأصناف أو الأقسام)')) {
            $this->warn('تم إلغاء العملية.');
            return self::SUCCESS;
        }

        $this->info('جاري تصفير معاملات النظام للإنتاج بأمان...');

        try {
            $result = $purgeService->purgeOperationalPurchasingData();

            foreach ($result['purged_counts'] as $table => $count) {
                $this->line(" - تم تفريغ جدول: {$table} ({$count} سجل)");
            }

            if ($result['supplier_balances_reset'] > 0) {
                $this->line(' - تم تصفير أرصدة الموردين مع الحفاظ التام على بيانات الموردين.');
            }

            $this->info('🛡️ التحقق من سلامة الجداول المحمية:');
            foreach ($result['preserved_counts'] as $table => $count) {
                $this->line(" + جدول {$table}: {$count} سجل (محفوظ 100%)");
            }

            $this->info('✅ تم تصفير السيستم بنجاح تام! النظام الآن نظيف 100% للإنتاج، مع بقاء كافة المستخدمين والأدوار والموردين والأصناف والبيانات الأساسية.');

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('حدث خطأ أثناء تصفير النظام: ' . $e->getMessage());
            return self::FAILURE;
        }
    }
}
