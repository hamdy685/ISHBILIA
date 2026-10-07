<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\SystemPurgeService;
use Illuminate\Console\Command;

class PurgeOperationalPurchasingData extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'purchasing:purge-operational-data {--force : تنفيذ العملية مباشرة دون طلب تأكيد}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'تصفير وحذف جميع طلبات الشراء وأوامر الشراء والاستلامات وعروض الأسعار والفواتير التشغيلية مع الحفاظ الصارم على المستخدمين، الأدوار، الصلاحيات، الأقسام، الأصناف، والموردين.';

    public function handle(SystemPurgeService $purgeService): int
    {
        $this->newLine();
        $this->alert('🚀 Al-Ashbiliya Procurement System — Production Data Purge');
        $this->line('<fg=yellow;options=bold>أمر تصفير طلبات الشراء والحركات التشغيلية تمهيداً للإطلاق الفعلي</>');
        $this->newLine();

        $this->info('قائمة الجداول المحمية نهائياً (لن يتم مسحها أو تصفيرها):');
        $this->line(' • جدول المستخدمين (users)');
        $this->line(' • جدول الأدوار والصلاحيات (roles, permissions, role_user, permission_role)');
        $this->line(' • جدول الأقسام (departments)');
        $this->line(' • جدول الأصناف الأساسية (items, categories)');
        $this->line(' • جدول الموردين (suppliers) — الحفاظ الكامل على الموردين وأرصدتهم الافتتاحية');
        $this->line(' • جدول شجرة الحسابات ومراكز التكلفة والمشاريع (accounts, cost_centers, land_parcels)');
        $this->newLine();

        $this->warn('الجداول التشغيلية التي سيتم تصفيرها:');
        $this->line(' • طلبات الشراء والملحقات والكمالات (purchase_requests, purchase_request_supplements, purchase_request_items)');
        $this->line(' • عروض الأسعار والترشيحات (purchase_request_quotes, purchase_request_quote_recommendations)');
        $this->line(' • أوامر الشراء وبنودها (purchase_orders, purchase_order_items)');
        $this->line(' • أذون الاستلام وبنودها ومرفقاتها (purchase_receipts, purchase_receipt_items)');
        $this->line(' • فواتير الموردين والدفعات والتسويات (supplier_invoices, supplier_payments, allocations)');
        $this->line(' • سجلات الاعتماد والتدقيق والأحداث والإشعارات والمرفقات التشغيلية');
        $this->newLine();

        if (! $this->option('force')) {
            $confirmed = $this->confirm(
                'هل أنت متأكد من رغبتك في تصفير جميع طلبات الشراء والعمليات التشغيلية لبدء التشغيل الفعلي (Production)؟',
                false
            );

            if (! $confirmed) {
                $this->comment('تم إلغاء العملية بأمان ولم يتم تعديل أي بيانات.');
                return self::SUCCESS;
            }
        }

        $this->info('جاري تنفيذ التصفير الآمن وتعطيل المفاتيح الأجنبية مؤقتاً...');

        try {
            $result = $purgeService->purgeOperationalPurchasingData();

            $this->newLine();
            $this->info('📊 نتيجة تصفير الجداول التشغيلية:');
            
            $purgedRows = [];
            foreach ($result['purged_counts'] as $table => $count) {
                $purgedRows[] = [$table, $count, 'تم التفريغ بنجاح (0 سجل)'];
            }
            $this->table(['اسم الجدول التشغيلي', 'عدد السجلات المحذوفة', 'الحالة الحالية'], $purgedRows);

            $this->newLine();
            $this->info('🛡️ تأكيد سلامة الجداول الأساسية المحمية:');
            
            $preservedRows = [];
            foreach ($result['preserved_counts'] as $table => $count) {
                $status = $count > 0 ? "<fg=green>محفوظ تماماً ({$count} سجل)</>" : "<fg=yellow>سليم (0 سجل)</>";
                $preservedRows[] = [$table, $count, $status];
            }
            $this->table(['الجدول الأساسي المحمي', 'عدد السجلات الحالية', 'حالة الحماية'], $preservedRows);

            $this->newLine();
            $this->info('✅ تمت إعادة تفعيل فحص المفاتيح الأجنبية (Schema::enableForeignKeyConstraints()).');
            if ($result['supplier_balances_reset'] > 0) {
                $this->info("✅ تم تصفير إجماليات الفواتير والدفعات في أرصدة الموردين مع بقاء سجلاتهم وأرصدتهم الافتتاحية دون حذف.");
            }
            $this->newLine();
            $this->alert('🎉 النظام الآن نظيف 100% وجاهز للإطلاق والتشغيل الفعلي في بيئة الإنتاج!');

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('حدث خطأ أثناء تنفيذ عملية التصفير: ' . $e->getMessage());
            return self::FAILURE;
        }
    }
}
