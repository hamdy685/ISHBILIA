<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\PurchaseRequest\StorePurchaseRequestRequest;
use App\Http\Requests\PurchaseRequest\UpdatePurchaseRequestRequest;
use App\Http\Resources\PurchaseRequestResource;
use App\Models\Attachment;
use App\Models\Department;
use App\Models\PurchaseRequest;
use App\Models\User;
use App\Services\PurchaseRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Storage;

class PurchaseRequestController extends Controller
{
    public function __construct(
        protected PurchaseRequestService $purchaseRequestService
    ) {}

    /**
     * Display a listing of own Purchase Requests for the authenticated employee.
     */
    public function reviewerOptions(Request $request): JsonResponse
    {
        $reviewers = User::query()
            ->where('is_active', true)
            ->whereHas('roles', fn ($query) => $query->where('slug', 'reviewer'))
            ->with('department:id,name')
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'department_id']);

        return response()->json([
            'data' => $reviewers->map(fn (User $reviewer) => [
                'id' => $reviewer->id,
                'name' => $reviewer->name,
                'email' => $reviewer->email,
                'department_id' => $reviewer->department_id,
                'department_name' => $reviewer->department?->name,
            ])->values(),
        ]);
    }

    public function departmentOptions(Request $request): JsonResponse
    {
        $departments = Department::query()
            ->where('is_active', true)
            ->with(['manager:id,name,email,department_id', 'siteEngineer:id,name,email,department_id'])
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'manager_user_id', 'site_engineer_user_id'])
            ->map(function (Department $department) {
                $manager = $department->manager;
                if (! $manager) {
                    $manager = User::where('department_id', $department->id)
                        ->whereHas('roles', fn ($q) => $q->where('slug', 'reviewer'))
                        ->first();
                }
                if (! $manager) {
                    $emailMap = (array) config('procurement.default_department_reviewers', []);
                    if (isset($emailMap[$department->code])) {
                        $manager = User::where('email', $emailMap[$department->code])->first();
                    }
                }
                return [
                    'id' => $department->id,
                    'name' => $department->name,
                    'code' => $department->code,
                    'manager' => $manager ? ['id' => $manager->id, 'name' => $manager->name] : null,
                    'site_engineer' => $department->siteEngineer ? ['id' => $department->siteEngineer->id, 'name' => $department->siteEngineer->name] : null,
                ];
            })->values();

        return response()->json(['data' => $departments]);
    }

    public function siteEngineerOptions(Request $request): JsonResponse
    {
        $allUsers = User::query()
            ->where('is_active', true)
            ->with(['roles:id,name,slug', 'department:id,name'])
            ->orderBy('name')
            ->get();

        $engineers = $allUsers->filter(fn (User $engineer) => $engineer->hasRole('site_engineer'))->values();
        $warehouseKeepers = $allUsers->filter(fn (User $keeper) => $keeper->hasRole('warehouse_keeper'))->values();
        $otherUsers = $allUsers->filter(fn (User $user) => ! $user->hasRole('site_engineer') && ! $user->hasRole('warehouse_keeper'))->values();

        return response()->json([
            'data' => $allUsers->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'department_id' => $user->department_id,
                'department_name' => $user->department?->name,
                'is_site_engineer' => $user->hasRole('site_engineer'),
                'is_warehouse_keeper' => $user->hasRole('warehouse_keeper'),
                'role_name' => $user->roles->first()?->name ?: 'مستخدم',
                'roles' => $user->roles->map(fn ($r) => ['slug' => $r->slug, 'name' => $r->name]),
            ])->values(),
            'site_engineers' => $engineers->map(fn (User $engineer) => [
                'id' => $engineer->id,
                'name' => $engineer->name,
                'email' => $engineer->email,
                'department_id' => $engineer->department_id,
                'department_name' => $engineer->department?->name,
                'role_name' => 'مهندس موقع',
            ])->values(),
            'warehouse_keepers' => $warehouseKeepers->map(fn (User $keeper) => [
                'id' => $keeper->id,
                'name' => $keeper->name,
                'email' => $keeper->email,
                'department_id' => $keeper->department_id,
                'department_name' => $keeper->department?->name,
                'role_name' => 'أمين مخزن',
            ])->values(),
            'other_users' => $otherUsers->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'department_id' => $user->department_id,
                'department_name' => $user->department?->name,
                'role_name' => $user->roles->first()?->name ?: 'مستخدم',
            ])->values(),
        ]);
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $perPage = min((int) $request->query('per_page', 50), 200);
        $requests = $this->purchaseRequestService->getOwnRequests($request->user(), $perPage);

        return PurchaseRequestResource::collection($requests);
    }

    /**
     * Store a newly created draft Purchase Request in storage.
     */
    public function store(StorePurchaseRequestRequest $request): JsonResponse
    {
        $pr = $this->purchaseRequestService->createRequest(
            $request->user(),
            $request->validated()
        );

        return (new PurchaseRequestResource($pr))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Display the specified Purchase Request.
     */
    public function show(Request $request, string|int $id): JsonResponse|PurchaseRequestResource
    {
        $pr = PurchaseRequest::with([
            'requester.roles',
            'department',
            'targetDepartment.manager',
            'targetDepartment.siteEngineer',
            'assignedReviewer.roles',
            'siteEngineer.roles',
            'items.item',
            'approvalHistory.actor.roles',
            'quotes.supplier',
            'quotes.recommendations.user.roles',
            'selectedQuote.supplier',
            'attachments.uploadedBy',
            'purchaseOrders.supplier',
            'purchaseOrders.receipts',
        ])->findOrFail((int) $id);

        $user = $request->user();
        $isAllowed = $pr->user_id === $user->id
            || $user->hasAnyRole(['admin', 'general_manager', 'procurement_manager', 'accountant', 'warehouse_keeper'])
            || $pr->reviewer_user_id === $user->id
            || $pr->site_engineer_user_id === $user->id
            || ($user->hasRole('reviewer') && (
                $pr->target_department_id === $user->department_id
                || $pr->department_id === $user->department_id
                || $pr->targetDepartment?->manager_user_id === $user->id
                || $pr->department?->manager_user_id === $user->id
            ))
            || $user->hasAnyPermission([
                'purchase_request.view',
                'purchase_request.review',
                'purchase_request.approve_gm',
                'purchase_request.convert_po',
                'purchase_request.review_accounting',
            ]);

        if (! $isAllowed) {
            return response()->json([
                'message' => 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
            ], 403);
        }

        return new PurchaseRequestResource($pr);
    }

    /**
     * Update the specified draft or returned Purchase Request.
     */
    public function update(UpdatePurchaseRequestRequest $request, string|int $id): JsonResponse|PurchaseRequestResource
    {
        $pr = PurchaseRequest::findOrFail((int) $id);

        if ($pr->user_id !== $request->user()->id) {
            return response()->json([
                'message' => 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
            ], 403);
        }

        if (! $pr->isEditableByRequester()) {
            return response()->json([
                'message' => 'لا يمكن تعديل طلب الشراء بعد اعتماد المراجع.',
            ], 409);
        }

        $updatedPr = $this->purchaseRequestService->updateRequest(
            $request->user(),
            $pr,
            $request->validated()
        );

        return new PurchaseRequestResource($updatedPr);
    }

    /**
     * Remove the specified draft Purchase Request from storage.
     */
    public function destroy(Request $request, string|int $id): JsonResponse
    {
        $pr = PurchaseRequest::findOrFail((int) $id);

        if ($pr->user_id !== $request->user()->id) {
            return response()->json([
                'message' => 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
            ], 403);
        }

        if ($pr->status !== 'DRAFT') {
            return response()->json([
                'message' => 'لا يمكن حذف طلب الشراء إلا إذا كانت حالته مسودة. تم إرسال هذا الطلب للمراجعة أو دخل مرحلة معالجة.',
            ], 409);
        }

        $this->purchaseRequestService->deleteRequest($request->user(), $pr);

        return response()->json([
            'message' => 'Purchase request deleted successfully.',
        ], 200);
    }

    /**
     * Submit a draft Purchase Request for review.
     */
    public function submit(Request $request, string|int $id): JsonResponse
    {
        $pr = PurchaseRequest::with('items')->findOrFail((int) $id);

        if ($pr->user_id !== $request->user()->id) {
            return response()->json([
                'message' => 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
            ], 403);
        }

        if ($pr->status !== 'DRAFT') {
            return response()->json([
                'message' => 'Only draft purchase requests can be submitted.',
            ], 409);
        }

        $siteEngineerUserId = $request->input('site_engineer_user_id');
        $submittedPr = $this->purchaseRequestService->submitRequest(
            $request->user(),
            $pr,
            $siteEngineerUserId ? (int) $siteEngineerUserId : null
        );

        return response()->json([
            'message' => 'Purchase request submitted successfully.',
            'data' => new PurchaseRequestResource($submittedPr),
        ], 200);
    }

    /**
     * Upload an attachment to a Purchase Request.
     */
    public function attachmentUpload(Request $request, string|int $id): JsonResponse
    {
        $request->validate([
            'file' => [
                'required',
                'file',
                'max:10240', // 10 MB
                'mimes:pdf,doc,docx,xls,xlsx,jpg,jpeg,png,gif',
            ],
        ]);

        $pr = PurchaseRequest::findOrFail((int) $id);

        if ($pr->user_id !== $request->user()->id) {
            return response()->json(['message' => 'ليس لديك صلاحية لتنفيذ هذا الإجراء.'], 403);
        }

        if ($pr->status !== 'DRAFT') {
            return response()->json([
                'message' => 'Attachments can only be added to draft purchase requests.',
            ], 409);
        }

        $file = $request->file('file');
        $stored = \App\Services\StorageService::storeUploadedFile($file, "attachments/pr/{$id}");

        $attachment = Attachment::create([
            'attachable_type' => PurchaseRequest::class,
            'attachable_id' => $pr->id,
            'uploaded_by_user_id' => $request->user()->id,
            'file_name' => $stored['name'],
            'file_path' => $stored['path'],
            'mime_type' => $stored['mime_type'],
            'file_size' => $stored['size'],
        ]);

        $attachment->load('uploadedBy');

        return response()->json([
            'message' => 'Attachment uploaded successfully.',
            'data' => [
                'id' => $attachment->id,
                'file_name' => $attachment->file_name,
                'mime_type' => $attachment->mime_type,
                'file_size' => $attachment->file_size,
                'uploaded_by' => $attachment->uploadedBy?->name,
                'created_at' => $attachment->created_at->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * Delete an attachment from a Purchase Request.
     */
    public function attachmentDelete(Request $request, string|int $prId, string|int $attachmentId): JsonResponse
    {
        $pr = PurchaseRequest::findOrFail((int) $prId);

        if ($pr->user_id !== $request->user()->id) {
            return response()->json(['message' => 'ليس لديك صلاحية لتنفيذ هذا الإجراء.'], 403);
        }

        if (! $pr->isEditableByRequester()) {
            return response()->json([
                'message' => 'لا يمكن تعديل مرفقات طلب الشراء بعد اعتماده وإرساله إلى المرحلة التالية.',
            ], 409);
        }

        $attachment = Attachment::where('attachable_type', PurchaseRequest::class)
            ->where('attachable_id', $pr->id)
            ->findOrFail((int) $attachmentId);

        \App\Services\StorageService::delete($attachment->file_path);
        $attachment->delete();

        return response()->json(['message' => 'Attachment deleted successfully.']);
    }

    /**
     * Download an attachment from a Purchase Request.
     */
    public function attachmentDownload(Request $request, string|int $prId, string|int $attachmentId)
    {
        $pr = PurchaseRequest::findOrFail((int) $prId);

        $user = $request->user();
        $isAllowed = $pr->user_id === $user->id
            || $user->hasAnyRole(['admin', 'general_manager', 'procurement_manager', 'accountant', 'warehouse_keeper'])
            || $pr->reviewer_user_id === $user->id
            || $pr->site_engineer_user_id === $user->id
            || ($user->hasRole('reviewer') && (
                $pr->target_department_id === $user->department_id
                || $pr->department_id === $user->department_id
                || $pr->targetDepartment?->manager_user_id === $user->id
                || $pr->department?->manager_user_id === $user->id
            ))
            || $user->hasAnyPermission([
                'purchase_request.view',
                'purchase_request.review',
                'purchase_request.approve_gm',
                'purchase_request.convert_po',
                'purchase_request.review_accounting',
            ]);

        if (! $isAllowed) {
            return response()->json(['message' => 'ليس لديك صلاحية لتنفيذ هذا الإجراء.'], 403);
        }

        $attachment = Attachment::where('attachable_type', PurchaseRequest::class)
            ->where('attachable_id', $pr->id)
            ->findOrFail((int) $attachmentId);

        return \App\Services\StorageService::streamResponse(
            $attachment->file_path,
            $attachment->file_name,
            $attachment->mime_type,
            true
        );
    }
}
