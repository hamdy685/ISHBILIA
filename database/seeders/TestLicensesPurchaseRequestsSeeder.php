<?php

namespace Database\Seeders;

use App\Models\ApprovalHistory;
use App\Models\Department;
use App\Models\Notification;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Supplier;
use App\Models\User;
use App\Services\PurchaseRequestService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class TestLicensesPurchaseRequestsSeeder extends Seeder
{
    /**
     * Run the database seeds to create 5 test purchase requests for Licenses department.
     */
    public function run(): void
    {
        $this->command?->info('🚀 بدء إنشاء 5 طلبات شراء تجريبية لقسم التراخيص...');

        // 1. استخراج الموظف صاحب الحساب (emp)
        $employee = User::where(function ($q) {
            $q->where('email', 'like', '%emp%')
              ->orWhere('name', 'like', '%emp%');
        })->first();

        if (! $employee) {
            $employee = User::whereHas('roles', fn ($q) => $q->where('slug', 'employee'))->first()
                ?? User::first();
        }

        if (! $employee) {
            $this->command?->error('❌ لم يتم العثور على أي حساب موظف في النظام.');
            return;
        }

        // 2. استخراج قسم التراخيص (Licenses) ومراجع القسم
        $department = Department::where(function ($q) {
            $q->where('name', 'like', '%تراخيص%')
              ->orWhere('code', 'LICENSES');
        })->first();

        if (! $department) {
            $department = Department::firstOrCreate(
                ['code' => 'LICENSES'],
                ['name' => 'التراخيص']
            );
        }

        $reviewer = User::whereHas('roles', fn ($q) => $q->where('slug', 'reviewer'))
            ->where('department_id', $department->id)
            ->first();

        if (! $reviewer && $department->manager_user_id) {
            $reviewer = User::find($department->manager_user_id);
        }

        if (! $reviewer) {
            $reviewer = User::whereHas('roles', fn ($q) => $q->where('slug', 'reviewer'))->first()
                ?? User::where('name', 'like', '%مصطفى%')->first()
                ?? $employee;
        }

        // 3. المسؤولون عن مسار الاعتماد الإداري والمالي وإدارة المشتريات
        $gm = User::whereHas('roles', fn ($q) => $q->where('slug', 'general_manager'))->first()
            ?? User::where('email', 'like', '%mohamed%')->first()
            ?? $reviewer;

        $accountant = User::whereHas('roles', fn ($q) => $q->where('slug', 'accountant'))->first()
            ?? User::where('email', 'like', '%hasan%')->first()
            ?? $reviewer;

        $procurementManager = User::whereHas('roles', fn ($q) => $q->where('slug', 'procurement_manager'))->first()
            ?? User::where('email', 'like', '%ahmed%')->first()
            ?? $reviewer;

        $storekeeper = User::whereHas('roles', fn ($q) => $q->where('slug', 'storekeeper'))
            ->orWhere('name', 'like', '%سلامة%')
            ->first();

        $supplier = Supplier::where('is_active', true)->first();
        if (! $supplier) {
            $supplier = Supplier::firstOrCreate(
                ['company_name' => 'مورد التراخيص والمهمات المعتمد'],
                ['contact_name' => 'مسؤول التوريدات', 'is_active' => true, 'opening_balance' => 0]
            );
        }

        $this->command?->info("👤 مقدم الطلب والمستلم الميداني: {$employee->name} ({$employee->email})");
        $this->command?->info("🏢 القسم: {$department->name} (كود: {$department->code})");
        $this->command?->info("🔍 مراجع القسم: {$reviewer->name} ({$reviewer->email})");
        $this->command?->info("📦 أمين المخزن: " . ($storekeeper ? "{$storekeeper->name} ({$storekeeper->email})" : 'غير محدد'));
        $this->command?->info("🛒 مدير المشتريات: {$procurementManager->name} ({$procurementManager->email})");
        $this->command?->info("🚚 المورد الافتراضي: {$supplier->company_name}");

        // 4. بيانات النماذج الـ 5 الوهمية
        $scenarios = [
            [
                'parcel' => 'قطاع أ - قطعة 101',
                'region' => 'بيت الوطن',
                'notes'  => 'طلب توريد مهمات إشغال ترخيص - يتطلب استلام مخزني وفحص ميداني للموقع',
                'items'  => [
                    [
                        'name'     => 'كابلات كهرباء نحاسية معتمدة 4x16 ملم',
                        'qty'      => 120,
                        'uom'      => 'متر',
                        'price'    => 185.00,
                        'specs'    => 'نحاس نقي معزول طبقتين مطابق لاشتراطات كود الحريق والتراخيص',
                    ],
                    [
                        'name'     => 'لوحة قواطع توزيع رئيسية 12 خط شنايدر',
                        'qty'      => 4,
                        'uom'      => 'قطعة',
                        'price'    => 3200.00,
                        'specs'    => 'لوحة صاج معالجة إلكتروستاتيك بالقواطع الأوتوماتيكية',
                    ],
                ],
            ],
            [
                'parcel' => 'قطاع ب - قطعة 204',
                'region' => 'النرجس الجديدة',
                'notes'  => 'توريد مستلزمات شبكة مياه الدفاع المدني للمطابقة مع رخصة البناء',
                'items'  => [
                    [
                        'name'     => 'مواسير مياه ضغط عالي 2 بوصة معتمدة',
                        'qty'      => 60,
                        'uom'      => 'متر',
                        'price'    => 95.00,
                        'specs'    => 'بولي إيثيلين عالي الكثافة ضغط 16 بار',
                    ],
                    [
                        'name'     => 'محابس سكينة برونز 2 بوصة إيطالي أصلي',
                        'qty'      => 8,
                        'uom'      => 'قطعة',
                        'price'    => 850.00,
                        'specs'    => 'محابس برونزية للتحكم في خطوط المياه الرئيسية',
                    ],
                ],
            ],
            [
                'parcel' => 'قطاع ج - قطعة 315',
                'region' => 'شمال الرحاب',
                'notes'  => 'مهمات السلامة ومكافحة الحريق المطلوبة لشهادة إتمام البناء',
                'items'  => [
                    [
                        'name'     => 'طفايات حريق بودرة كيميائية 6 كجم معتمدة',
                        'qty'      => 15,
                        'uom'      => 'قطعة',
                        'price'    => 1100.00,
                        'specs'    => 'معتمدة من الدفاع المدني بمانومتر ضغط وشهادة اختبار',
                    ],
                    [
                        'name'     => 'صناديق حريق ستانلس كاملة بالخرطوم 30 متر',
                        'qty'      => 6,
                        'uom'      => 'قطعة',
                        'price'    => 4500.00,
                        'specs'    => 'صندوق حريق غاطس بالخرطوم والبشبوري النحاس',
                    ],
                ],
            ],
            [
                'parcel' => 'قطاع د - قطعة 420',
                'region' => 'الياسمين',
                'notes'  => 'منظومة الحماية الأرضية ومانعات الصواعق لاشتراطات الترخيص الهندسي',
                'items'  => [
                    [
                        'name'     => 'أسلاك تأريض نحاس مجدول 10 ملم معتمدة',
                        'qty'      => 150,
                        'uom'      => 'متر',
                        'price'    => 75.00,
                        'specs'    => 'سلك نحاس أصفر عاري مجدول لشبكة الأرضي',
                    ],
                    [
                        'name'     => 'أوتاد تأريض نحاسية صلبة 1.5 متر مع المشابك',
                        'qty'      => 10,
                        'uom'      => 'قطعة',
                        'price'    => 480.00,
                        'specs'    => 'حربة إلكترود نحاس صلب لغرف التفتيش الأرضية',
                    ],
                ],
            ],
            [
                'parcel' => 'قطاع هـ - قطعة 550',
                'region' => 'الأندلس',
                'notes'  => 'إنارة الطوارئ ومخارج الهروب استيفاءً لملاحظات جهاز المدينة',
                'items'  => [
                    [
                        'name'     => 'كشافات طوارئ شحن ليد معتمدة لاشتراطات التراخيص',
                        'qty'      => 25,
                        'uom'      => 'قطعة',
                        'price'    => 380.00,
                        'specs'    => 'بطارية ليثيوم تعمل لمدة 3 ساعات أوتوماتيكياً عند انقطاع التيار',
                    ],
                    [
                        'name'     => 'لوحات إرشادية مضيئة لمخارج الطوارئ (Exit)',
                        'qty'      => 20,
                        'uom'      => 'قطعة',
                        'price'    => 290.00,
                        'specs'    => 'لوحة ليد زجاجية بإضاءة مستمرة وطوارئ',
                    ],
                ],
            ],
        ];

        $prService = app(PurchaseRequestService::class);
        $createdRequests = [];

        DB::transaction(function () use ($scenarios, $employee, $department, $reviewer, $gm, $accountant, $procurementManager, $supplier, $prService, &$createdRequests) {
            foreach ($scenarios as $index => $data) {
                $totalCost = 0;
                foreach ($data['items'] as $item) {
                    $totalCost += (float) $item['qty'] * (float) $item['price'];
                }

                $requestNumber = $prService->generateRequestNumber();

                // إنشاء طلب الشراء مع تفعيل الاستلام المخزني والميداني وحالة الاعتماد المالي
                $pr = PurchaseRequest::create([
                    'request_number'             => $requestNumber,
                    'request_type'               => 'PROJECT',
                    'parcel_reference'           => $data['parcel'],
                    'region'                     => $data['region'],
                    'user_id'                    => $employee->id,
                    'department_id'              => $department->id,
                    'target_department_id'       => $department->id,
                    'reviewer_user_id'           => $reviewer->id,
                    'site_engineer_user_id'      => $employee->id,  // الموظف emp هو المستلم الميداني/الفني للعهدة
                    'requires_warehouse_receipt' => true,           // اشتراط الاستلام المخزني الصارم
                    'priority'                   => $index === 0 ? 'URGENT' : 'NORMAL',
                    'status'                     => 'APPROVED_BY_ACCOUNTING', // جاهز كلياً مالياً وإدارياً
                    'procurement_route'          => 'DIRECT',      // مسار الشراء المباشر للبدء فوراً بأمر الشراء
                    'direct_supplier_id'         => $supplier->id,
                    'total_estimated_cost'       => $totalCost,
                    'date_needed'                => now()->addDays(7)->toDateString(),
                    'notes'                      => $data['notes'],
                    'submitted_at'               => now()->subHours(5),
                ]);

                // إنشاء البندين التابعين للطلب
                foreach ($data['items'] as $itemData) {
                    $lineTotal = round((float) $itemData['qty'] * (float) $itemData['price'], 2);
                    PurchaseRequestItem::create([
                        'purchase_request_id'  => $pr->id,
                        'supplier_id'          => $supplier->id,
                        'item_description'     => $itemData['name'],
                        'item_reference'       => $data['parcel'],
                        'region'               => $data['region'],
                        'quantity'             => $itemData['qty'],
                        'uom'                  => $itemData['uom'],
                        'estimated_unit_price' => $itemData['price'],
                        'estimated_line_total' => $lineTotal,
                        'specifications'       => $itemData['specs'],
                    ]);
                }

                // تسجيل سجل الموافقات التراكمي (تجاوز المراحل وصولاً للاعتماد النهائي)
                // 1. التقديم
                ApprovalHistory::create([
                    'target_type'   => PurchaseRequest::class,
                    'target_id'     => $pr->id,
                    'actor_user_id' => $employee->id,
                    'action'        => 'SUBMITTED',
                    'from_state'    => 'DRAFT',
                    'to_state'      => 'SUBMITTED',
                    'comments'      => 'تم تقديم طلب الشراء لقسم التراخيص.',
                    'created_at'    => now()->subHours(4),
                ]);

                // 2. المراجعة الفنية
                ApprovalHistory::create([
                    'target_type'   => PurchaseRequest::class,
                    'target_id'     => $pr->id,
                    'actor_user_id' => $reviewer->id,
                    'action'        => 'REVIEWER_APPROVED',
                    'from_state'    => 'SUBMITTED',
                    'to_state'      => 'PENDING_EXECUTIVE_APPROVAL',
                    'comments'      => 'تمت المراجعة الفنية وتأكيد شرط الاستلام المخزني والميداني.',
                    'created_at'    => now()->subHours(3),
                ]);

                // 3. الاعتماد الإداري والتنفيذي
                ApprovalHistory::create([
                    'target_type'   => PurchaseRequest::class,
                    'target_id'     => $pr->id,
                    'actor_user_id' => $gm->id,
                    'action'        => 'EXECUTIVE_APPROVED_DIRECT',
                    'from_state'    => 'PENDING_EXECUTIVE_APPROVAL',
                    'to_state'      => 'PENDING_ACCOUNTING_APPROVAL',
                    'comments'      => 'اعتمدت الإدارة العامة الطلب كشراء مباشر وأحالته للمطابقة المالية.',
                    'created_at'    => now()->subHours(2),
                ]);

                // 4. الاعتماد المالي
                ApprovalHistory::create([
                    'target_type'   => PurchaseRequest::class,
                    'target_id'     => $pr->id,
                    'actor_user_id' => $accountant->id,
                    'action'        => 'ACCOUNTING_APPROVED_DIRECT',
                    'from_state'    => 'PENDING_ACCOUNTING_APPROVAL',
                    'to_state'      => 'APPROVED_BY_ACCOUNTING',
                    'comments'      => 'وافقت الإدارة المالية على التكلفة والطلب جاهز لدى إدارة المشتريات لإصدار أمر الشراء.',
                    'created_at'    => now()->subHours(1),
                ]);

                // 5. إشعار موجه لمدير المشتريات
                Notification::create([
                    'user_id'         => $procurementManager->id,
                    'type'            => 'purchase_request_pending_procurement_po',
                    'title'           => 'طلب شراء مباشر جاهز للمشتريات',
                    'message'         => "وافقت الإدارة المالية على الطلب {$pr->request_number}. الطلب جاهز لإنشاء أمر الشراء المباشر.",
                    'notifiable_type' => PurchaseRequest::class,
                    'notifiable_id'   => $pr->id,
                ]);

                $createdRequests[] = [
                    'id'             => $pr->id,
                    'number'         => $pr->request_number,
                    'parcel'         => $pr->parcel_reference,
                    'region'         => $pr->region,
                    'total_cost'     => number_format($pr->total_estimated_cost, 2) . ' ج.م',
                    'requester'      => $employee->name,
                    'field_receiver' => $employee->name,
                    'status'         => $pr->status,
                ];
            }
        });

        $this->command?->info('✅ تم إنشاء الـ 5 طلبات بنجاح، وهي الآن جاهزة في صندوق إدارة المشتريات:');
        if ($this->command) {
            $this->command->table(
                ['ID', 'رقم الطلب', 'القطعة', 'المنطقة', 'التكلفة التقديرية', 'مقدم الطلب', 'المستلم الميداني', 'الحالة'],
                $createdRequests
            );
        }
    }
}
