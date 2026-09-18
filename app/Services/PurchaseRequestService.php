<?php

namespace App\Services;

use App\Models\AuditLog;
use Carbon\Carbon;
use App\Models\Department;
use App\Models\LandParcel;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PurchaseRequestService
{
    /**
     * Generate sequential unique Purchase Request number (PR-YYYY-XXXXX).
     * Uses MAX extraction from existing numbers to avoid duplicates after record deletions.
     */
    public function generateRequestNumber(): string
    {
        $year = date('Y');
        $prefix = "PR-{$year}-";

        // Extract the highest existing sequence number from the database
        $maxNumber = PurchaseRequest::withTrashed()
            ->where('request_number', 'like', $prefix . '%')
            ->selectRaw("MAX(CAST(SUBSTRING(request_number, ?) AS UNSIGNED)) as max_seq", [strlen($prefix) + 1])
            ->value('max_seq');

        $nextSeq = ($maxNumber ?? 0) + 1;

        // Retry loop to handle rare race conditions
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $candidate = sprintf('PR-%s-%05d', $year, $nextSeq);
            $exists = PurchaseRequest::withTrashed()
                ->where('request_number', $candidate)
                ->exists();

            if (! $exists) {
                return $candidate;
            }
            $nextSeq++;
        }

        // Absolute fallback: use timestamp to guarantee uniqueness
        return sprintf('PR-%s-%05d', $year, $nextSeq);
    }

    /**
     * Normalize request line items without calculating any estimated price.
     * Supplier prices are entered later in the official quote stage.
     */
    public function normalizeItems(array $items, bool $isOffice = false, ?string $defaultParcel = null, ?string $defaultRegion = null): array
    {
        $normalizedItems = [];

        foreach ($items as $index => $item) {
            $itemReference = trim((string) ($item['item_reference'] ?? ''));
            $region = trim((string) ($item['region'] ?? ''));

            if ($itemReference === '' && $defaultParcel !== null && trim($defaultParcel) !== '') {
                $itemReference = trim($defaultParcel);
            }
            if ($region === '' && $defaultRegion !== null && trim($defaultRegion) !== '') {
                $region = trim($defaultRegion);
            }

            if ($isOffice) {
                if ($itemReference === '') {
                    $itemReference = 'مقر الشركة';
                }
                if ($region === '') {
                    $region = 'إداري / المقر الرئيسي';
                }
            } else {
                if ($itemReference === '' || $region === '') {
                    $errors = [];
                    if ($itemReference === '') {
                        $errors["items.{$index}.item_reference"] = ['رقم قطعة الأرض مطلوب ولا يمكن أن يكون فارغًا.'];
                    }
                    if ($region === '') {
                        $errors["items.{$index}.region"] = ['المنطقة مطلوبة ولا يمكن أن تكون فارغة.'];
                    }
                    throw ValidationException::withMessages($errors);
                }
            }

            $quantity = (float) ($item['quantity'] ?? 0);
            if ($quantity <= 0) {
                throw ValidationException::withMessages([
                    "items.{$index}.quantity" => ['الكمية يجب أن تكون أكبر من صفر.'],
                ]);
            }

            $normalizedItems[] = [
                'item_id' => $item['item_id'] ?? null,
                'item_description' => $item['item_description'] ?? '',
                'item_reference' => $itemReference,
                'region' => $region,
                'quantity' => $quantity,
                'uom' => $item['uom'] ?? 'PCS',
                'specifications' => $item['specifications'] ?? null,
                'notes' => $item['notes'] ?? null,
            ];
        }

        return $normalizedItems;
    }

    /**
     * Backward-compatible alias for internal callers; it no longer calculates prices.
     */
    public function calculateFinancials(array $items): array
    {
        return ['items' => $this->normalizeItems($items)];
    }

    /**
     * Create a new draft Purchase Request with line items.
     */
    public function createRequest(User $user, array $data): PurchaseRequest
    {
        return DB::transaction(function () use ($user, $data) {
            $requestType = ($data['request_type'] ?? 'PROJECT') === 'OFFICE_SUPPLIES' ? 'OFFICE_SUPPLIES' : 'PROJECT';
            $isOffice = $requestType === 'OFFICE_SUPPLIES';

            $parcelReference = trim((string) ($data['parcel_reference'] ?? ''));
            $region = trim((string) ($data['region'] ?? ''));
            $landParcelId = !empty($data['land_parcel_id']) ? (int) $data['land_parcel_id'] : null;

            if ($landParcelId && ($parcelReference === '' || $region === '')) {
                $lp = LandParcel::find($landParcelId);
                if ($lp) {
                    if ($parcelReference === '') $parcelReference = $lp->parcel_reference;
                    if ($region === '') $region = $lp->region;
                }
            }

            if ($isOffice) {
                if ($parcelReference === '') {
                    $parcelReference = 'مقر الشركة';
                }
                if ($region === '') {
                    $region = 'إداري / المقر الرئيسي';
                }
            } else {
                if ($parcelReference === '' && !empty($data['items'][0]['item_reference'])) {
                    $parcelReference = trim((string) $data['items'][0]['item_reference']);
                }
                if ($region === '' && !empty($data['items'][0]['region'])) {
                    $region = trim((string) $data['items'][0]['region']);
                }

                if ($parcelReference === '' || $region === '') {
                    $errors = [];
                    if ($parcelReference === '') {
                        $errors['parcel_reference'] = ['رقم قطعة الأرض مطلوب للطلب ولا يمكن أن يكون فارغًا.'];
                    }
                    if ($region === '') {
                        $errors['region'] = ['المنطقة مطلوبة للطلب ولا يمكن أن تكون فارغة.'];
                    }
                    throw ValidationException::withMessages($errors);
                }

                if (! $landParcelId) {
                    $existingLp = LandParcel::where('parcel_reference', $parcelReference)->where('region', $region)->first();
                    if ($existingLp) {
                        $landParcelId = $existingLp->id;
                    }
                }
            }

            $normalizedItems = $this->normalizeItems($data['items'] ?? [], $isOffice, $parcelReference, $region);
            $requestNumber = $this->generateRequestNumber();
            $targetDepartmentId = (int) ($data['target_department_id'] ?? $user->department_id);
            $targetDepartment = Department::with(['manager', 'siteEngineer'])->find($targetDepartmentId);

            if (!$targetDepartment) {
                throw ValidationException::withMessages([
                    'target_department_id' => ['اختر قسمًا مستهدفًا صحيحًا للطلب.'],
                ]);
            }

            $isExecutiveRequester = $user->hasRole('general_manager');
            $assignedManager = $targetDepartment->manager;
            if (!$assignedManager) {
                $assignedManager = User::where('department_id', $targetDepartment->id)
                    ->where('is_active', true)
                    ->whereHas('roles', fn ($q) => $q->where('slug', 'reviewer'))
                    ->first();
            }
            if (!$assignedManager) {
                $emailMap = (array) config('procurement.default_department_reviewers', []);
                if (isset($emailMap[$targetDepartment->code])) {
                    $assignedManager = User::where('email', $emailMap[$targetDepartment->code])->first();
                }
            }
            if ($assignedManager && !$targetDepartment->manager_user_id) {
                $targetDepartment->update(['manager_user_id' => $assignedManager->id]);
            }

            // Backward compatibility for old clients/drafts that still send explicit assignments.
            if (!$assignedManager && !empty($data['reviewer_user_id'])) {
                $assignedManager = User::query()->whereKey((int) $data['reviewer_user_id'])->where('is_active', true)->first();
            }
            $siteEngineer = null;
            if (!empty($data['site_engineer_user_id'])) {
                $siteEngineer = User::query()->whereKey((int) $data['site_engineer_user_id'])->where('is_active', true)->first();
            }
            if (!$siteEngineer && !$isOffice && $targetDepartment->site_engineer_user_id) {
                $siteEngineer = $targetDepartment->siteEngineer;
            }

            if (!$assignedManager && !$user->hasRole('general_manager')) {
                throw ValidationException::withMessages([
                    'target_department_id' => ['لا يمكن إرسال الطلب قبل تعيين مراجع أو مدير للقسم المستهدف.'],
                ]);
            }

            $pr = PurchaseRequest::create([
                'request_number' => $requestNumber,
                'request_type' => $requestType,
                'parcel_reference' => $parcelReference,
                'region' => $region,
                'land_parcel_id' => $landParcelId,
                'user_id' => $user->id,
                'department_id' => $user->department_id ?? $targetDepartment->id,
                'target_department_id' => $targetDepartment->id,
                // Keep legacy reviewer_user_id populated with the department manager.
                // The general manager is the final business approver for their own request;
                // never route their request to the target department manager.
                'reviewer_user_id' => $isExecutiveRequester ? null : $assignedManager?->id,
                'site_engineer_user_id' => $isOffice ? null : $siteEngineer?->id,
                'priority' => $data['priority'] ?? 'NORMAL',
                'status' => 'DRAFT',
                'date_needed' => $this->normalizeNeededDate($data['date_needed'] ?? null),
                'notes' => $data['notes'] ?? null,
            ]);

            foreach ($normalizedItems as $itemData) {
                $pr->items()->create([
                    'item_id' => $itemData['item_id'] ?? null,
                    'item_description' => $itemData['item_description'],
                    'item_reference' => $itemData['item_reference'],
                    'region' => $itemData['region'],
                    'quantity' => $itemData['quantity'],
                    'uom' => $itemData['uom'],
                    'specifications' => $itemData['specifications'] ?? null,
                    'notes' => $itemData['notes'] ?? null,
                ]);
            }

            AuditLog::create([
                'user_id' => $user->id,
                'action' => 'CREATED',
                'entity_type' => PurchaseRequest::class,
                'entity_id' => $pr->id,
                'new_value' => json_encode([
                    'request_number' => $pr->request_number,
                    'request_type' => $pr->request_type,
                    'parcel_reference' => $pr->parcel_reference,
                    'region' => $pr->region,
                    'status' => 'DRAFT',
                ], JSON_UNESCAPED_UNICODE),
            ]);

            return $pr->load(['requester.roles', 'requester:id,name,email,department_id', 'department:id,name,code', 'assignedReviewer:id,name,email,department_id', 'siteEngineer:id,name,email,department_id', 'landParcel', 'items.item']);
        });
    }

    /**
     * Update a requester-editable Purchase Request before reviewer approval.
     */
    public function updateRequest(User $user, PurchaseRequest $request, array $data): PurchaseRequest
    {
        if (! $request->isEditableByRequester()) {
            throw new \RuntimeException('لا يمكن تعديل طلب الشراء بعد اعتماد المراجع.');
        }

        return DB::transaction(function () use ($user, $request, $data) {
            $lockedRequest = PurchaseRequest::query()->whereKey($request->id)->lockForUpdate()->firstOrFail();
            if (! $lockedRequest->isEditableByRequester()) {
                throw new \RuntimeException('لا يمكن تعديل طلب الشراء بعد اعتماد المراجع.');
            }

            $requestType = $data['request_type'] ?? $lockedRequest->request_type ?? 'PROJECT';
            $isOffice = $requestType === 'OFFICE_SUPPLIES';

            $parcelProvided = array_key_exists('parcel_reference', $data);
            $regionProvided = array_key_exists('region', $data);
            $itemsProvided = array_key_exists('items', $data);

            $parcelReference = $parcelProvided
                ? trim((string) $data['parcel_reference'])
                : (string) ($lockedRequest->parcel_reference ?? $lockedRequest->items()->first()?->item_reference ?? '');

            $region = $regionProvided
                ? trim((string) $data['region'])
                : (string) ($lockedRequest->region ?? $lockedRequest->items()->first()?->region ?? '');

            $landParcelId = array_key_exists('land_parcel_id', $data)
                ? (!empty($data['land_parcel_id']) ? (int) $data['land_parcel_id'] : null)
                : $lockedRequest->land_parcel_id;

            if ($landParcelId && ($parcelReference === '' || $region === '')) {
                $lp = LandParcel::find($landParcelId);
                if ($lp) {
                    if ($parcelReference === '') $parcelReference = $lp->parcel_reference;
                    if ($region === '') $region = $lp->region;
                }
            }

            if ($isOffice) {
                $parcelReference = $parcelReference !== '' ? $parcelReference : 'مقر الشركة';
                $region = $region !== '' ? $region : 'إداري / المقر الرئيسي';
            } else {
                if ($parcelReference === '' && !empty($data['items'][0]['item_reference'])) {
                    $parcelReference = trim((string) $data['items'][0]['item_reference']);
                }
                if ($region === '' && !empty($data['items'][0]['region'])) {
                    $region = trim((string) $data['items'][0]['region']);
                }

                if (($parcelProvided || $regionProvided || $itemsProvided) && ($parcelReference === '' || $region === '')) {
                    $errors = [];
                    if ($parcelReference === '') $errors['parcel_reference'] = ['رقم قطعة الأرض مطلوب للطلب ولا يمكن أن يكون فارغًا.'];
                    if ($region === '') $errors['region'] = ['المنطقة مطلوبة للطلب ولا يمكن أن تكون فارغة.'];
                    throw ValidationException::withMessages($errors);
                }

                if ($parcelReference !== '' && $region !== '' && ! $landParcelId) {
                    $existingLp = LandParcel::where('parcel_reference', $parcelReference)->where('region', $region)->first();
                    if ($existingLp) {
                        $landParcelId = $existingLp->id;
                    }
                }
            }

            $updateFields = [];
            if ($parcelReference !== '') {
                $updateFields['parcel_reference'] = $parcelReference;
            }
            if ($region !== '') {
                $updateFields['region'] = $region;
            }
            if ($landParcelId !== null) {
                $updateFields['land_parcel_id'] = $landParcelId;
            }

            if (array_key_exists('request_type', $data)) {
                $updateFields['request_type'] = $requestType;
            }
            if (array_key_exists('target_department_id', $data)) {
                $targetDepartment = Department::with(['manager', 'siteEngineer'])->find((int) $data['target_department_id']);
                if (!$targetDepartment) {
                    throw ValidationException::withMessages(['target_department_id' => ['اختر قسمًا مستهدفًا صحيحًا.']]);
                }
                $assignedManager = $targetDepartment->manager;
                if (!$assignedManager) {
                    $assignedManager = User::where('department_id', $targetDepartment->id)
                        ->where('is_active', true)
                        ->whereHas('roles', fn ($q) => $q->where('slug', 'reviewer'))
                        ->first();
                }
                if (!$assignedManager) {
                    $emailMap = (array) config('procurement.default_department_reviewers', []);
                    if (isset($emailMap[$targetDepartment->code])) {
                        $assignedManager = User::where('email', $emailMap[$targetDepartment->code])->first();
                    }
                }
                if ($assignedManager && !$targetDepartment->manager_user_id) {
                    $targetDepartment->update(['manager_user_id' => $assignedManager->id]);
                }
                if (!$assignedManager && !$user->hasRole('general_manager')) {
                    throw ValidationException::withMessages(['target_department_id' => ['القسم المستهدف لا يحتوي على مدير قسم أو مراجع معين بعد.']]);
                }
                $isExecutiveRequester = $user->hasRole('general_manager');
                $updateFields['target_department_id'] = $targetDepartment->id;
                $updateFields['reviewer_user_id'] = $isExecutiveRequester ? null : $assignedManager?->id;
            }
            $simpleFields = ['notes', 'priority'];
            foreach ($simpleFields as $field) {
                if (array_key_exists($field, $data)) {
                    $updateFields[$field] = is_string($data[$field]) ? trim($data[$field]) : $data[$field];
                }
            }
            if (array_key_exists('site_engineer_user_id', $data)) {
                $updateFields['site_engineer_user_id'] = $isOffice ? null : (!empty($data['site_engineer_user_id']) ? (int) $data['site_engineer_user_id'] : null);
            }
            if (array_key_exists('date_needed', $data)) {
                $updateFields['date_needed'] = $this->normalizeNeededDate($data['date_needed']);
            }

            if (array_key_exists('items', $data)) {
                $normalizedItems = $this->normalizeItems($data['items'], $isOffice, $parcelReference, $region);

                // Re-create items
                $request->items()->delete();
                foreach ($normalizedItems as $itemData) {
                    $request->items()->create([
                        'item_id' => $itemData['item_id'] ?? null,
                        'item_description' => $itemData['item_description'],
                        'item_reference' => $itemData['item_reference'],
                        'region' => $itemData['region'],
                        'quantity' => $itemData['quantity'],
                        'uom' => $itemData['uom'],
                        'specifications' => $itemData['specifications'] ?? null,
                        'notes' => $itemData['notes'] ?? null,
                    ]);
                }
            } else {
                // Keep existing items in sync if parcel/region changed
                $request->items()->update([
                    'item_reference' => $parcelReference,
                    'region' => $region,
                ]);
            }

            $request->update($updateFields);

            return $request->fresh(['requester.roles', 'requester:id,name,email,department_id', 'department:id,name,code', 'targetDepartment.manager:id,name,email,department_id', 'targetDepartment.siteEngineer:id,name,email,department_id', 'assignedReviewer:id,name,email,department_id', 'siteEngineer:id,name,email,department_id', 'landParcel', 'items.item']);
        });
    }

    private function normalizeNeededDate(?string $value): string
    {
        $dateValue = trim((string) $value);
        if ($dateValue === '') {
            return now()->toDateString();
        }

        try {
            $date = Carbon::createFromFormat('Y-m-d', $dateValue);
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                'date_needed' => ['تاريخ الاحتياج غير صحيح. استخدم تاريخًا بصيغة يوم-شهر-سنة صحيحة.'],
            ]);
        }

        if (!$date || $date->format('Y-m-d') !== $dateValue) {
            throw ValidationException::withMessages([
                'date_needed' => ['تاريخ الاحتياج غير صحيح. استخدم تاريخًا بصيغة يوم-شهر-سنة صحيحة.'],
            ]);
        }

        if ($date->lt(Carbon::today())) {
            throw ValidationException::withMessages([
                'date_needed' => ['تاريخ الاحتياج لا يمكن أن يكون في الماضي. اختر اليوم أو تاريخًا قادمًا.'],
            ]);
        }

        return $date->toDateString();
    }

    /**
     * Soft delete a draft Purchase Request.
     */
    public function deleteRequest(User $user, PurchaseRequest $request): void
    {
        if ($request->status !== 'DRAFT') {
            throw new \RuntimeException('Only draft purchase requests can be deleted.');
        }

        DB::transaction(function () use ($request) {
            $lockedRequest = PurchaseRequest::query()->whereKey($request->id)->lockForUpdate()->firstOrFail();
            if ($lockedRequest->status !== 'DRAFT') {
                throw new \RuntimeException('Only draft purchase requests can be deleted.');
            }

            $lockedRequest->delete();
        });
    }

    /**
     * Submit a draft Purchase Request for review.
     */
    public function submitRequest(User $user, PurchaseRequest $request, ?int $siteEngineerUserId = null): PurchaseRequest
    {
        if ($request->status !== 'DRAFT') {
            throw new \RuntimeException('Only draft purchase requests can be submitted.');
        }

        if ($request->items()->count() === 0) {
            throw ValidationException::withMessages([
                'items' => ['Cannot submit a purchase request with no line items.'],
            ]);
        }

        return DB::transaction(function () use ($user, $request, $siteEngineerUserId) {
            // إعادة تحميل الطلب مع قفل الصف لمنع الإرسال المزدوج أو انتقالين متزامنين من المسودة.
            $request = PurchaseRequest::query()->whereKey($request->id)->lockForUpdate()->firstOrFail();
            if ($request->status !== 'DRAFT') {
                throw new \RuntimeException('تم إرسال طلب الشراء بالفعل أو لم يعد في حالة مسودة.');
            }
            $request->loadMissing(['department', 'targetDepartment', 'assignedReviewer', 'siteEngineer']);
            $normalizedNeededDate = $this->normalizeNeededDate($request->date_needed?->toDateString());
            $isExecutiveRequester = $user->hasRole('general_manager');
            $isDepartmentManagerRequester = $user->hasRole('reviewer');
            // مدير المشتريات والحسابات: يتجاوزان المراجع ويذهبان مباشرةً للمدير التنفيذي.
            $isProcurementOrAccounting = $user->hasAnyRole(['procurement_manager', 'accountant']);
            $sameDepartment = (int) $request->department_id === (int) $request->target_department_id;
            $canSkipReviewer = $isDepartmentManagerRequester && $sameDepartment;
            $nextStatus = $isExecutiveRequester
                ? 'PENDING_PROCUREMENT_APPROVAL'
                : ($isProcurementOrAccounting || $canSkipReviewer
                    ? 'PENDING_EXECUTIVE_APPROVAL'
                    : 'SUBMITTED');

            $assignedSiteEngineerId = $request->site_engineer_user_id;
            if ($siteEngineerUserId) {
                $assignedSiteEngineerId = $siteEngineerUserId;
            }

            // إذا كان مقدم الطلب هو المدير التنفيذي وطلب مشروعات/موقع، يجب تحديد مسؤول الاستلام قبل الإرسال للمشتريات
            if ($isExecutiveRequester && $request->request_type !== 'OFFICE_SUPPLIES') {
                if (!$assignedSiteEngineerId && $request->targetDepartment?->site_engineer_user_id) {
                    $assignedSiteEngineerId = $request->targetDepartment->site_engineer_user_id;
                }
                if (!$assignedSiteEngineerId) {
                    throw ValidationException::withMessages([
                        'site_engineer_user_id' => ['طالما أن طلب الشراء صادر من المدير التنفيذي ولا يمر على مراجع، يجب تحديد مهندس الموقع أو مسؤول الاستلام قبل إرسال الطلب إلى المشتريات.'],
                    ]);
                }
            }

            $request->update([
                'status' => $nextStatus,
                'date_needed' => $normalizedNeededDate,
                'submitted_at' => now(),
                'reviewer_user_id' => $isExecutiveRequester ? null : $request->reviewer_user_id,
                'site_engineer_user_id' => $request->request_type === 'OFFICE_SUPPLIES' ? null : $assignedSiteEngineerId,
            ]);

            AuditLog::create([
                'user_id' => $user->id,
                'action' => 'SUBMITTED',
                'entity_type' => PurchaseRequest::class,
                'entity_id' => $request->id,
                'old_value' => json_encode(['status' => 'DRAFT'], JSON_UNESCAPED_UNICODE),
                'new_value' => json_encode(['status' => $nextStatus, 'target_department_id' => $request->target_department_id], JSON_UNESCAPED_UNICODE),
            ]);

            $eventMessage = match (true) {
                $nextStatus === 'PENDING_PROCUREMENT_APPROVAL' => 'أنشأ المدير التنفيذي طلب شراء وأرسله مباشرة إلى مدير المشتريات.',
                $nextStatus === 'PENDING_EXECUTIVE_APPROVAL' && $isProcurementOrAccounting => 'أنشأ مدير المشتريات / الحسابات طلب شراء وأرسله مباشرةً للمدير التنفيذي متجاوزاً مرحلة المراجع.',
                $nextStatus === 'PENDING_EXECUTIVE_APPROVAL' => 'أرسل مراجع القسم الطلب إلى المدير التنفيذي مباشرة لأن القسم المستهدف هو نفس قسمه.',
                default => 'أرسل الطلب إلى مدير القسم المستهدف للمراجعة.',
            };
            app(SystemEventService::class)->recordAction(
                $request,
                'PR_SUBMITTED',
                $eventMessage,
                ['event_type' => 'purchase_request.submitted', 'from_state' => 'DRAFT', 'to_state' => $nextStatus, 'actor_user_id' => $user->id]
            );

            $notificationService = app(NotificationService::class);
            if ($nextStatus === 'SUBMITTED') {
                $reviewers = $request->assignedReviewer
                    ? collect([$request->assignedReviewer])
                    : $notificationService->resolveUsersWithPermission('purchase_request.review', $request->target_department_id);
                $notificationService->queueUsers(
                    $reviewers,
                    'purchase_request_submitted',
                    'طلب شراء جديد للمراجعة',
                    "طلب الشراء {$request->request_number} تابع لقسمك ويحتاج اعتماد مدير القسم.",
                    $request
                );
            } elseif ($nextStatus === 'PENDING_EXECUTIVE_APPROVAL') {
                $notificationService->queueUsers(
                    $notificationService->resolveUsersWithPermission('purchase_request.view_gm'),
                    'purchase_request_pending_executive_approval',
                    'طلب شراء بانتظار اعتماد المدير التنفيذي',
                    "طلب الشراء {$request->request_number} جاهز لقرار المدير التنفيذي.",
                    $request
                );
            } else {
                $notificationService->queueUsers(
                    $notificationService->resolveUsersWithPermission('purchase_request.view_approved'),
                    'purchase_request_pending_procurement',
                    'طلب شراء من المدير التنفيذي',
                    "طلب الشراء {$request->request_number} وصل مباشرة للمشتريات لبدء مساره.",
                    $request
                );
            }

            return $request->fresh(['requester.roles', 'requester:id,name,email,department_id', 'department:id,name,code', 'targetDepartment.manager:id,name,email,department_id', 'targetDepartment.siteEngineer:id,name,email,department_id', 'assignedReviewer:id,name,email,department_id', 'siteEngineer:id,name,email,department_id', 'items.item']);
        });
    }

    /**
     * Get paginated own purchase requests for an employee.
     */
    public function getOwnRequests(User $user, int $perPage = 15)
    {
        $query = PurchaseRequest::query();

        // Procurement Manager and Admin see all purchase requests across the organization
        if (! $user->hasAnyRole(['procurement_manager', 'admin'])) {
            $query->where('user_id', $user->id);
        }

        return $query
            ->with([
                'requester.roles',
                'requester:id,name,email,department_id',
                'department:id,name,code',
                'targetDepartment.manager:id,name,email,department_id',
                'targetDepartment.siteEngineer:id,name,email,department_id',
                'assignedReviewer:id,name,email,department_id',
                'siteEngineer:id,name,email,department_id',
                'items.item',
                'approvalHistory.actor',
                'purchaseOrders:id,po_number,purchase_request_id,status,grand_total',
                'supplements',
            ])
            ->orderBy('created_at', 'desc')
            ->paginate($perPage);
    }
}

