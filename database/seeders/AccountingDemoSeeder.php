<?php

namespace Database\Seeders;

use App\Models\Accounting\Account;
use App\Models\Accounting\CostCenter;
use Illuminate\Database\Seeder;

class AccountingDemoSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // 1. Seed Cost Centers
        $costCenters = [
            ['code' => 'CC-101', 'name' => 'مشروع كمبوند الياسمين - التجمع الخامس', 'is_active' => true],
            ['code' => 'CC-102', 'name' => 'مشروع برج النرجس السكني - القاهرة الجديدة', 'is_active' => true],
            ['code' => 'CC-103', 'name' => 'مشروع كمبوند الأندلس - الشيخ زايد', 'is_active' => true],
            ['code' => 'CC-104', 'name' => 'مشروع مجمع الشروق للأعمال', 'is_active' => true],
            ['code' => 'CC-201', 'name' => 'الإدارة العامة والمقر الرئيسي', 'is_active' => true],
            ['code' => 'CC-202', 'name' => 'إدارة الحركة والمعدات والأسطول', 'is_active' => true],
            ['code' => 'CC-301', 'name' => 'مشروع مول الرحاب التجاري (مكتمل ومسلم)', 'is_active' => false],
        ];

        foreach ($costCenters as $cc) {
            CostCenter::firstOrCreate(['code' => $cc['code']], $cc);
        }

        // 2. Seed Chart of Accounts
        // Level 1: Primary Groups
        $rootAccounts = [
            '1' => ['name' => 'الأصول (Assets)', 'type' => 'asset'],
            '2' => ['name' => 'الخصوم (Liabilities)', 'type' => 'liability'],
            '3' => ['name' => 'حقوق الملكية (Equity)', 'type' => 'equity'],
            '4' => ['name' => 'الإيرادات (Revenue)', 'type' => 'revenue'],
            '5' => ['name' => 'المصروفات (Expenses)', 'type' => 'expense'],
        ];

        $createdRoots = [];
        foreach ($rootAccounts as $code => $data) {
            $createdRoots[$code] = Account::firstOrCreate(
                ['code' => $code],
                [
                    'name' => $data['name'],
                    'type' => $data['type'],
                    'parent_id' => null,
                    'is_active' => true,
                ]
            );
        }

        // Level 2 Sub-Accounts
        $level2Accounts = [
            // Assets
            '11' => ['name' => 'الأصول المتداولة', 'type' => 'asset', 'parent_code' => '1'],
            '12' => ['name' => 'الأصول الثابتة', 'type' => 'asset', 'parent_code' => '1'],

            // Liabilities
            '21' => ['name' => 'الخصوم المتداولة', 'type' => 'liability', 'parent_code' => '2'],
            '22' => ['name' => 'الخصوم طويلة الأجل', 'type' => 'liability', 'parent_code' => '2'],

            // Equity
            '31' => ['name' => 'رأس المال والاحتياطيات', 'type' => 'equity', 'parent_code' => '3'],
            '32' => ['name' => 'الأرباح المحتجزة والمرحلة', 'type' => 'equity', 'parent_code' => '3'],
            '33' => ['name' => 'جاري الشركاء', 'type' => 'equity', 'parent_code' => '3'],

            // Revenue
            '41' => ['name' => 'إيرادات النشاط والمشاريع', 'type' => 'revenue', 'parent_code' => '4'],
            '42' => ['name' => 'إيرادات تشغيلية وأخرى', 'type' => 'revenue', 'parent_code' => '4'],

            // Expenses
            '51' => ['name' => 'تكاليف تشغيل العمليات والمشاريع', 'type' => 'expense', 'parent_code' => '5'],
            '52' => ['name' => 'المصروفات الإدارية والعمومية', 'type' => 'expense', 'parent_code' => '5'],
        ];

        $createdLevel2 = [];
        foreach ($level2Accounts as $code => $data) {
            $parent = $createdRoots[$data['parent_code']] ?? null;
            $createdLevel2[$code] = Account::firstOrCreate(
                ['code' => $code],
                [
                    'name' => $data['name'],
                    'type' => $data['type'],
                    'parent_id' => $parent?->id,
                    'is_active' => true,
                ]
            );
        }

        // Level 3 Sub-Accounts
        $level3Accounts = [
            // Current Assets
            '111' => ['name' => 'النقدية وما في حكمها', 'type' => 'asset', 'parent_code' => '11'],
            '112' => ['name' => 'العملاء وأوراق القبض', 'type' => 'asset', 'parent_code' => '11'],
            '113' => ['name' => 'المخزون السلعي ومواد البناء', 'type' => 'asset', 'parent_code' => '11'],
            '114' => ['name' => 'دفعات مقدمة للموردين', 'type' => 'asset', 'parent_code' => '11'],

            // Fixed Assets
            '121' => ['name' => 'الأراضي والعقارات', 'type' => 'asset', 'parent_code' => '12'],
            '122' => ['name' => 'الآلات والمعدات الثقيلة', 'type' => 'asset', 'parent_code' => '12'],
            '123' => ['name' => 'أسطول السيارات والشاحنات', 'type' => 'asset', 'parent_code' => '12'],

            // Current Liabilities
            '211' => ['name' => 'الموردون وحسابات دائنة', 'type' => 'liability', 'parent_code' => '21'],
            '212' => ['name' => 'أوراق الدفع ومستحقات قصيرة الأجل', 'type' => 'liability', 'parent_code' => '21'],
            '213' => ['name' => 'تأمينات محتجزة وضمانات مقاولين', 'type' => 'liability', 'parent_code' => '21'],

            // Projects Revenue
            '411' => ['name' => 'إيرادات مستخلصات التنفيذ الإنشائي', 'type' => 'revenue', 'parent_code' => '41'],
            '412' => ['name' => 'إيرادات بيع الوحدات السكنية', 'type' => 'revenue', 'parent_code' => '41'],

            // Projects Direct Costs
            '511' => ['name' => 'تكلفة المواد والخامات المستهلكة', 'type' => 'expense', 'parent_code' => '51'],
            '512' => ['name' => 'أجور عمالة مباشرة ومقاولو باطن', 'type' => 'expense', 'parent_code' => '51'],
            '513' => ['name' => 'إيجار معدات وتشوين مواقع', 'type' => 'expense', 'parent_code' => '51'],

            // General & Admin Costs
            '521' => ['name' => 'رواتب وأجور الكادر الإداري', 'type' => 'expense', 'parent_code' => '52'],
            '522' => ['name' => 'مصاريف تراخيص ورسوم حكومية', 'type' => 'expense', 'parent_code' => '52'],
            '523' => ['name' => 'مستلزمات مكتبية وبوفيه وضيافة', 'type' => 'expense', 'parent_code' => '52'],
            '524' => ['name' => 'إيجار المقرات ومرافق وخدمات', 'type' => 'expense', 'parent_code' => '52'],
        ];

        $createdLevel3 = [];
        foreach ($level3Accounts as $code => $data) {
            $parent = $createdLevel2[$data['parent_code']] ?? null;
            $createdLevel3[$code] = Account::firstOrCreate(
                ['code' => $code],
                [
                    'name' => $data['name'],
                    'type' => $data['type'],
                    'parent_id' => $parent?->id,
                    'is_active' => true,
                ]
            );
        }

        // Level 4 Detail Accounts (Leaf nodes)
        $level4Accounts = [
            // Cash
            '1111' => ['name' => 'الخزينة الرئيسية - المقر', 'type' => 'asset', 'parent_code' => '111'],
            '1112' => ['name' => 'حساب البنك الأهلي المصري - جاري', 'type' => 'asset', 'parent_code' => '111'],
            '1113' => ['name' => 'حساب بنك مصر - جاري', 'type' => 'asset', 'parent_code' => '111'],

            // Suppliers
            '2111' => ['name' => 'موردو الإسمنت والخرسانة الجاهزة', 'type' => 'liability', 'parent_code' => '211'],
            '2112' => ['name' => 'موردو حديد التسليح والمعادن', 'type' => 'liability', 'parent_code' => '211'],
            '2113' => ['name' => 'مقاولو التشطيبات وأعمال الكهرباء والسباكة', 'type' => 'liability', 'parent_code' => '211'],
        ];

        foreach ($level4Accounts as $code => $data) {
            $parent = $createdLevel3[$data['parent_code']] ?? null;
            Account::firstOrCreate(
                ['code' => $code],
                [
                    'name' => $data['name'],
                    'type' => $data['type'],
                    'parent_id' => $parent?->id,
                    'is_active' => true,
                ]
            );
        }

        // 3. Seed Sample Contractor Invoices
        $cc1 = CostCenter::where('code', 'CC-101')->first();
        $cc2 = CostCenter::where('code', 'CC-102')->first();
        $cc3 = CostCenter::where('code', 'CC-103')->first();

        if ($cc1) {
            \App\Models\Accounting\ContractorInvoice::firstOrCreate(
                ['invoice_number' => 'INV-CTR-2026-001'],
                [
                    'cost_center_id' => $cc1->id,
                    'contractor_name' => 'شركة النيل للخرسانات والمقاولات',
                    'date' => '2026-09-18',
                    'amount' => 85000.00,
                    'description' => 'مستخلص رقم 1 - صب أعمدة وسقف الدور الأرضي فيلا 12',
                    'status' => 'DRAFT',
                ]
            );
        }

        if ($cc2) {
            \App\Models\Accounting\ContractorInvoice::firstOrCreate(
                ['invoice_number' => 'INV-CTR-2026-002'],
                [
                    'cost_center_id' => $cc2->id,
                    'contractor_name' => 'مؤسسة الفجر للتشطيبات وأعمال البياض',
                    'date' => '2026-09-19',
                    'amount' => 45000.00,
                    'description' => 'مستخلص رقم 2 - أعمال محارة الواجهة الغربية لبرج النرجس',
                    'status' => 'PENDING_APPROVAL',
                ]
            );
        }

        // 4. Seed Sample Petty Cash Settlements
        if ($cc1) {
            \App\Models\Accounting\PettyCashSettlement::firstOrCreate(
                ['settlement_number' => 'PC-2026-001'],
                [
                    'cost_center_id' => $cc1->id,
                    'employee_name' => 'م. أحمد مهدي (مهندس الموقع)',
                    'date' => '2026-09-18',
                    'amount' => 3250.00,
                    'description' => 'شراء وصلات سباكة وكابلات طوارئ وخراطيم مياه للموقع',
                    'status' => 'DRAFT',
                ]
            );
        }

        if ($cc3) {
            \App\Models\Accounting\PettyCashSettlement::firstOrCreate(
                ['settlement_number' => 'PC-2026-002'],
                [
                    'cost_center_id' => $cc3->id,
                    'employee_name' => 'أ/ محمود عثمان (أمين الموقع)',
                    'date' => '2026-09-19',
                    'amount' => 1850.00,
                    'description' => 'مصاريف وقود مولدات وضيافة استشاري المشروع',
                    'status' => 'PENDING_APPROVAL',
                ]
            );
        }

        // 5. Seed Approved Sample Invoices & Settlements with Balanced Journal Entries
        $expense512 = Account::where('code', '512')->first();
        $expense513 = Account::where('code', '513')->first();
        $payable2113 = Account::where('code', '2113')->first();
        $asset112 = Account::where('code', '112')->first();

        if ($cc1 && $expense512 && $payable2113) {
            $je1 = \App\Models\Accounting\JournalEntry::firstOrCreate(
                ['reference_number' => 'CONT-INV-DEMO-001'],
                [
                    'date' => '2026-09-17',
                    'description' => 'مستخلص مقاول: شركة الإسكندرية للإنشاءات - فيلا 14',
                    'status' => 'POSTED',
                ]
            );

            if ($je1->wasRecentlyCreated) {
                \App\Models\Accounting\JournalEntryLine::create([
                    'journal_entry_id' => $je1->id,
                    'account_id' => $expense512->id,
                    'cost_center_id' => $cc1->id,
                    'debit' => 125000.00,
                    'credit' => 0,
                    'description' => 'مصروفات حفر وهيكل خرساني - فيلا 14',
                ]);
                \App\Models\Accounting\JournalEntryLine::create([
                    'journal_entry_id' => $je1->id,
                    'account_id' => $payable2113->id,
                    'cost_center_id' => null,
                    'debit' => 0,
                    'credit' => 125000.00,
                    'description' => 'استحقاق شركة الإسكندرية للإنشاءات',
                ]);
            }

            \App\Models\Accounting\ContractorInvoice::firstOrCreate(
                ['invoice_number' => 'INV-CTR-2026-003'],
                [
                    'cost_center_id' => $cc1->id,
                    'contractor_name' => 'شركة الإسكندرية للإنشاءات',
                    'date' => '2026-09-17',
                    'amount' => 125000.00,
                    'description' => 'مستخلص رقم 3 - أعمال الهيكل الخرساني والأساسات فيلا 14',
                    'status' => 'APPROVED',
                    'journal_entry_id' => $je1->id,
                ]
            );
        }

        if ($cc2 && $expense512 && $payable2113) {
            $je2 = \App\Models\Accounting\JournalEntry::firstOrCreate(
                ['reference_number' => 'CONT-INV-DEMO-002'],
                [
                    'date' => '2026-09-18',
                    'description' => 'مستخلص مقاول: مكتب الأهرام للتكييف المركزي',
                    'status' => 'POSTED',
                ]
            );

            if ($je2->wasRecentlyCreated) {
                \App\Models\Accounting\JournalEntryLine::create([
                    'journal_entry_id' => $je2->id,
                    'account_id' => $expense512->id,
                    'cost_center_id' => $cc2->id,
                    'debit' => 68000.00,
                    'credit' => 0,
                    'description' => 'تمديدات مجاري الهواء والتكييف برج النرجس',
                ]);
                \App\Models\Accounting\JournalEntryLine::create([
                    'journal_entry_id' => $je2->id,
                    'account_id' => $payable2113->id,
                    'cost_center_id' => null,
                    'debit' => 0,
                    'credit' => 68000.00,
                    'description' => 'استحقاق مكتب الأهرام للتكييف المركزي',
                ]);
            }

            \App\Models\Accounting\ContractorInvoice::firstOrCreate(
                ['invoice_number' => 'INV-CTR-2026-004'],
                [
                    'cost_center_id' => $cc2->id,
                    'contractor_name' => 'مكتب الأهرام للتكييف المركزي',
                    'date' => '2026-09-18',
                    'amount' => 68000.00,
                    'description' => 'مستخلص رقم 1 - تمديدات مجاري التكييف المركزي برج النرجس',
                    'status' => 'APPROVED',
                    'journal_entry_id' => $je2->id,
                ]
            );
        }

        if ($cc1 && $expense513 && $asset112) {
            $je3 = \App\Models\Accounting\JournalEntry::firstOrCreate(
                ['reference_number' => 'PC-SETTLE-DEMO-001'],
                [
                    'date' => '2026-09-19',
                    'description' => 'تسوية عهدة: م. خالد مصطفى - موقع الياسمين',
                    'status' => 'POSTED',
                ]
            );

            if ($je3->wasRecentlyCreated) {
                \App\Models\Accounting\JournalEntryLine::create([
                    'journal_entry_id' => $je3->id,
                    'account_id' => $expense513->id,
                    'cost_center_id' => $cc1->id,
                    'debit' => 6400.00,
                    'credit' => 0,
                    'description' => 'مصروفات تشغيل ومعدات نثرية بموقع الياسمين',
                ]);
                \App\Models\Accounting\JournalEntryLine::create([
                    'journal_entry_id' => $je3->id,
                    'account_id' => $asset112->id,
                    'cost_center_id' => null,
                    'debit' => 0,
                    'credit' => 6400.00,
                    'description' => 'تسوية عهدة نقدية',
                ]);
            }

            \App\Models\Accounting\PettyCashSettlement::firstOrCreate(
                ['settlement_number' => 'PC-2026-003'],
                [
                    'cost_center_id' => $cc1->id,
                    'employee_name' => 'م. خالد مصطفى (مدير الموقع)',
                    'date' => '2026-09-19',
                    'amount' => 6400.00,
                    'description' => 'مصروفات إصلاح مضخة مياه وتشوين مواد عاجلة',
                    'status' => 'APPROVED',
                    'journal_entry_id' => $je3->id,
                ]
            );
        }
    }
}
