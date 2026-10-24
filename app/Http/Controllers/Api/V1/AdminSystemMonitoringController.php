<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Department;
use App\Models\Item;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Supplier;
use App\Models\SystemEvent;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class AdminSystemMonitoringController extends Controller
{
    public function runMigrations(): JsonResponse
    {
        try {
            Artisan::call('migrate', ['--force' => true]);
            $output = Artisan::output();

            return response()->json([
                'success' => true,
                'message' => 'تم تطبيق جميع ترحيلات قاعدة البيانات بنجاح.',
                'output' => $output,
                'snapshot' => $this->snapshot(),
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'فشل تنفيذ ترحيلات قاعدة البيانات: ' . $e->getMessage(),
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->snapshot()]);
    }

    public function healthCheck(): JsonResponse
    {
        $snapshot = $this->snapshot();
        $criticalFailure = ($snapshot['database']['status'] ?? null) !== 'connected'
            || ($snapshot['migrations']['pending_count'] ?? 0) > 0
            || ($snapshot['data_integrity']['missing_reference_fields'] ?? 0) > 0;

        return response()->json([
            'data' => [
                'healthy' => ! $criticalFailure,
                'checked_at' => $snapshot['checked_at'],
                'checks' => [
                    'application' => 'ok',
                    'database' => $snapshot['database'],
                    'migrations' => $snapshot['migrations'],
                    'data_integrity' => $snapshot['data_integrity'],
                    'realtime' => $snapshot['realtime'],
                ],
            ],
        ], $criticalFailure ? 503 : 200);
    }

    public function alerts(): JsonResponse
    {
        $snapshot = $this->snapshot();

        return response()->json([
            'data' => $snapshot['alerts'],
            'meta' => [
                'checked_at' => $snapshot['checked_at'],
                'open_count' => count(array_filter($snapshot['alerts'], fn (array $alert) => $alert['status'] === 'open')),
            ],
        ]);
    }

    public function auditLog(): JsonResponse
    {
        if (! Schema::hasTable('system_events')) {
            return response()->json(['data' => []]);
        }

        $events = SystemEvent::with('actor:id,name')
            ->latest('occurred_at')
            ->limit(100)
            ->get()
            ->map(fn (SystemEvent $event) => [
                'id' => $event->id,
                'event_type' => $event->event_type,
                'action' => $event->action,
                'entity_type' => $event->entity_type,
                'entity_id' => $event->entity_id,
                'entity_label' => $event->entity_label,
                'actor' => $event->actor ? [
                    'id' => $event->actor->id,
                    'name' => $event->actor->name,
                ] : null,
                'occurred_at' => $event->occurred_at?->toIso8601String(),
            ])
            ->values();

        return response()->json(['data' => $events]);
    }

    public function securityEvents(): JsonResponse
    {
        if (! Schema::hasTable('audit_logs')) {
            return response()->json(['data' => []]);
        }

        $events = AuditLog::with('user:id,name')
            ->where('action', 'UNAUTHORIZED_ACCESS_ATTEMPT')
            ->latest('created_at')
            ->limit(100)
            ->get()
            ->map(fn (AuditLog $event) => [
                'id' => $event->id,
                'action' => $event->action,
                'permission' => $event->field_name === 'permission' ? data_get(json_decode((string) $event->new_value, true), 'required') : null,
                'path' => data_get(json_decode((string) $event->new_value, true), 'path'),
                'method' => data_get(json_decode((string) $event->new_value, true), 'method'),
                'user' => $event->user ? ['id' => $event->user->id, 'name' => $event->user->name] : null,
                'ip_address' => $event->ip_address,
                'created_at' => $event->created_at?->toIso8601String(),
            ])
            ->values();

        return response()->json(['data' => $events]);
    }

    public function dataQuality(): JsonResponse
    {
        $sections = [];

        $departments = Department::with(['manager:id,name', 'siteEngineer:id,name'])
            ->where(function ($query) {
                $query->whereNull('manager_user_id')->orWhereNull('site_engineer_user_id');
            })
            ->orderBy('name')
            ->limit(100)
            ->get()
            ->map(fn (Department $department) => [
                'id' => $department->id,
                'name' => $department->name,
                'manager' => $department->manager?->name,
                'site_engineer' => $department->siteEngineer?->name,
            ])
            ->values();
        $sections[] = [
            'key' => 'departments_missing_responsible',
            'title' => 'أقسام بدون مدير قسم أو مهندس موقع',
            'count' => $departments->count(),
            'records' => $departments,
        ];

        $users = User::with(['department:id,name', 'roles:id,name,slug'])
            ->where(function ($query) {
                $query->whereNull('department_id')->orWhereDoesntHave('roles');
            })
            ->orderBy('name')
            ->limit(100)
            ->get()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'department' => $user->department?->name,
                'roles' => $user->roles->pluck('name')->values(),
            ])
            ->values();
        $sections[] = [
            'key' => 'users_missing_assignment',
            'title' => 'مستخدمون بدون قسم أو دور',
            'count' => $users->count(),
            'records' => $users,
        ];

        $requestItems = PurchaseRequestItem::where(function ($query) {
                $query->whereNull('item_reference')
                    ->orWhere('item_reference', '')
                    ->orWhereNull('region')
                    ->orWhere('region', '');
            })
            ->orderByDesc('id')
            ->limit(100)
            ->get(['id', 'purchase_request_id', 'item_description', 'item_reference', 'region'])
            ->map(fn (PurchaseRequestItem $item) => [
                'id' => $item->id,
                'request_id' => $item->purchase_request_id,
                'description' => $item->item_description,
                'item_reference' => $item->item_reference,
                'region' => $item->region,
            ])
            ->values();
        $sections[] = [
            'key' => 'purchase_request_items_missing_tracking',
            'title' => 'بنود طلبات بدون رقم قطعة الأرض أو المنطقة',
            'count' => $requestItems->count(),
            'records' => $requestItems,
        ];

        $orderItems = PurchaseOrderItem::where(function ($query) {
                $query->whereNull('item_reference')
                    ->orWhere('item_reference', '')
                    ->orWhereNull('region')
                    ->orWhere('region', '');
            })
            ->orderByDesc('id')
            ->limit(100)
            ->get(['id', 'purchase_order_id', 'item_description', 'item_reference', 'region'])
            ->map(fn (PurchaseOrderItem $item) => [
                'id' => $item->id,
                'order_id' => $item->purchase_order_id,
                'description' => $item->item_description,
                'item_reference' => $item->item_reference,
                'region' => $item->region,
            ])
            ->values();
        $sections[] = [
            'key' => 'purchase_order_items_missing_tracking',
            'title' => 'بنود أوامر شراء بدون رقم قطعة الأرض أو المنطقة',
            'count' => $orderItems->count(),
            'records' => $orderItems,
        ];

        $suppliers = Supplier::where(function ($query) {
                $query->whereNull('company_name')
                    ->orWhere('company_name', '')
                    ->orWhere(function ($contactQuery) {
                        $contactQuery->whereNull('phone')->whereNull('email');
                    });
            })
            ->orderBy('company_name')
            ->limit(100)
            ->get(['id', 'company_name', 'email', 'phone', 'is_active'])
            ->map(fn (Supplier $supplier) => [
                'id' => $supplier->id,
                'company_name' => $supplier->company_name,
                'email' => $supplier->email,
                'phone' => $supplier->phone,
                'is_active' => (bool) $supplier->is_active,
            ])
            ->values();
        $sections[] = [
            'key' => 'suppliers_missing_contact',
            'title' => 'موردون ببيانات تعريف أو اتصال ناقصة',
            'count' => $suppliers->count(),
            'records' => $suppliers,
        ];

        return response()->json([
            'data' => [
                'checked_at' => now()->toIso8601String(),
                'total_issues' => collect($sections)->sum('count'),
                'sections' => $sections,
            ],
        ]);
    }

    private function snapshot(): array
    {
        $checkedAt = now()->toIso8601String();
        $database = $this->databaseSnapshot();
        $migrations = $this->migrationSnapshot();
        $dataIntegrity = $this->dataIntegritySnapshot();
        $eventsAvailable = Schema::hasTable('system_events');
        $lastEventAt = $eventsAvailable ? SystemEvent::max('occurred_at') : null;
        $failedJobs = Schema::hasTable('failed_jobs') ? DB::table('failed_jobs')->count() : 0;

        $snapshot = [
            'checked_at' => $checkedAt,
            'application' => [
                'status' => 'ok',
                'environment' => app()->environment(),
                'version' => config('deployment.version') ?: 'غير محدد',
                'commit' => config('deployment.commit') ?: 'غير محدد',
            ],
            'database' => $database,
            'migrations' => $migrations,
            'realtime' => [
                'status' => 'configured',
                'endpoint' => '/api/v1/notifications/stream',
                'last_system_event_at' => $lastEventAt,
                'client_connections' => null,
                'client_connections_note' => 'عدد الاتصالات يحتاج Telemetry إضافية من طبقة البث.',
            ],
            'deployment' => [
                'status' => config('deployment.commit') || config('deployment.version') ? 'configured' : 'not_configured',
                'version' => config('deployment.version') ?: 'غير محدد',
                'commit' => config('deployment.commit') ?: 'غير محدد',
                'deployed_at' => config('deployment.deployed_at') ?: null,
                'source' => 'environment',
                'message' => config('deployment.commit') || config('deployment.version')
                    ? 'بيانات الإصدار متاحة من إعدادات البيئة.'
                    : 'لم يتم ربط بيانات Deploy خارجية بعد؛ الحالة ليست فاشلة.',
            ],
            'counts' => [
                'users' => User::count(),
                'active_users' => User::where('is_active', true)->count(),
                'departments' => Department::count(),
                'categories' => Category::count(),
                'items' => Item::count(),
                'active_items' => Item::where('is_active', true)->count(),
                'suppliers' => Supplier::count(),
                'active_suppliers' => Supplier::where('is_active', true)->count(),
                'purchase_requests' => PurchaseRequest::count(),
                'purchase_orders' => PurchaseOrder::count(),
                'system_events' => $eventsAvailable ? SystemEvent::count() : 0,
                'failed_jobs' => $failedJobs,
            ],
            'workflow' => [
                'purchase_requests_by_status' => $this->statusCounts(PurchaseRequest::class),
                'purchase_orders_by_status' => $this->statusCounts(PurchaseOrder::class),
            ],
            'data_integrity' => $dataIntegrity,
        ];

        $snapshot['alerts'] = $this->buildAlerts($snapshot);

        return $snapshot;
    }

    private function databaseSnapshot(): array
    {
        $startedAt = microtime(true);

        try {
            DB::connection()->getPdo();
            DB::select('select 1');

            return [
                'status' => 'connected',
                'driver' => DB::connection()->getDriverName(),
                'latency_ms' => round((microtime(true) - $startedAt) * 1000, 2),
            ];
        } catch (Throwable $exception) {
            return [
                'status' => 'disconnected',
                'driver' => DB::connection()->getDriverName(),
                'latency_ms' => null,
                'error' => 'تعذر الاتصال بقاعدة البيانات.',
            ];
        }
    }

    private function migrationSnapshot(): array
    {
        try {
            $migrator = app('migrator');
            $ran = $migrator->getRepository()->getRan();
            $files = $migrator->getMigrationFiles(database_path('migrations'));
            $all = array_keys($files);
            $pending = array_values(array_diff($all, $ran));

            return [
                'status' => count($pending) === 0 ? 'up_to_date' : 'pending',
                'applied_count' => count($ran),
                'pending_count' => count($pending),
                'pending' => array_slice($pending, 0, 20),
            ];
        } catch (Throwable $exception) {
            return [
                'status' => 'unknown',
                'applied_count' => null,
                'pending_count' => null,
                'pending' => [],
                'error' => 'تعذر قراءة حالة الـMigrations.',
            ];
        }
    }

    private function dataIntegritySnapshot(): array
    {
        $prMissing = 0;
        $poMissing = 0;

        try {
            $prMissing = PurchaseRequestItem::where(function ($query) {
                $query->whereNull('item_reference')
                    ->orWhere('item_reference', '')
                    ->orWhereNull('region')
                    ->orWhere('region', '');
            })->count();

            $poMissing = PurchaseOrderItem::where(function ($query) {
                $query->whereNull('item_reference')
                    ->orWhere('item_reference', '')
                    ->orWhereNull('region')
                    ->orWhere('region', '');
            })->count();
        } catch (Throwable $exception) {
            $prMissing = null;
            $poMissing = null;
        }

        return [
            'purchase_request_items_missing_reference' => $prMissing,
            'purchase_order_items_missing_reference' => $poMissing,
            'missing_reference_fields' => $prMissing === null || $poMissing === null ? null : $prMissing + $poMissing,
        ];
    }

    private function statusCounts(string $modelClass): array
    {
        return $modelClass::query()
            ->select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')
            ->orderBy('status')
            ->get()
            ->mapWithKeys(fn ($row) => [$row->status => (int) $row->total])
            ->toArray();
    }

    private function buildAlerts(array $snapshot): array
    {
        $alerts = [];

        if (($snapshot['database']['status'] ?? null) !== 'connected') {
            $alerts[] = $this->alert('critical', 'قاعدة البيانات غير متصلة', 'تعذر تنفيذ فحص اتصال PostgreSQL/SQLite.', 'open');
        }

        if (($snapshot['migrations']['pending_count'] ?? 0) > 0) {
            $alerts[] = $this->alert('critical', 'توجد Migrations معلقة', 'يجب تطبيق الـMigrations قبل اعتبار الإصدار جاهزًا.', 'open');
        }

        if (($snapshot['data_integrity']['missing_reference_fields'] ?? 0) > 0) {
            $alerts[] = $this->alert('critical', 'بيانات تتبع ناقصة', 'يوجد بند بدون رقم قطعة أو منطقة.', 'open');
        }

        if (($snapshot['counts']['failed_jobs'] ?? 0) > 0) {
            $alerts[] = $this->alert('high', 'مهام فاشلة', 'يوجد Failed Jobs يحتاج إلى مراجعة.', 'open');
        }

        if (($snapshot['deployment']['status'] ?? null) === 'not_configured') {
            $alerts[] = $this->alert('info', 'بيانات الـDeploy غير مربوطة', 'أضف APP_VERSION أو APP_COMMIT أو Webhook لاحقًا لعرض الإصدار الفعلي.', 'open');
        }

        if ($alerts === []) {
            $alerts[] = $this->alert('info', 'النظام سليم', 'لم يتم رصد مؤشرات حرجة في آخر فحص.', 'resolved');
        }

        return $alerts;
    }

    private function alert(string $severity, string $title, string $message, string $status): array
    {
        return [
            'severity' => $severity,
            'title' => $title,
            'message' => $message,
            'status' => $status,
        ];
    }
}
