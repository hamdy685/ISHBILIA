<?php

namespace App\Http\Resources;

use App\Models\MaterialTransferRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MaterialTransferRequestResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var MaterialTransferRequest $this */
        $user = $request->user();

        $statusLabels = [
            MaterialTransferRequest::STATUS_DRAFT => 'مسودة',
            MaterialTransferRequest::STATUS_PENDING_REVIEWER => 'بانتظار مراجعة المراجع',
            MaterialTransferRequest::STATUS_PENDING_ACCOUNTING => 'بانتظار الإجراء المحاسبي',
            MaterialTransferRequest::STATUS_ARCHIVED => 'مؤرشف ومعالج محاسبياً',
            MaterialTransferRequest::STATUS_REJECTED => 'مرفوض',
            MaterialTransferRequest::STATUS_RETURNED => 'مُعاد للتعديل',
        ];

        return [
            'id' => $this->id,
            'request_number' => $this->request_number,
            'transfer_date' => $this->transfer_date?->format('Y-m-d') ?: (string) $this->transfer_date,
            'from_project' => $this->from_project,
            'to_project' => $this->to_project,
            'driver_name' => $this->driver_name,
            'vehicle_plate_number' => $this->vehicle_plate_number,
            'status' => $this->status,
            'status_label' => $statusLabels[$this->status] ?? $this->status,
            'general_notes' => $this->general_notes,
            'rejection_reason' => $this->rejection_reason,
            'return_reason' => $this->return_reason,
            'review_notes' => $this->review_notes,
            'reviewed_at' => $this->reviewed_at?->toIso8601String(),
            'accounting_notes' => $this->accounting_notes,
            'accounted_at' => $this->accounted_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            
            'user' => $this->whenLoaded('user', function () {
                return [
                    'id' => $this->user->id,
                    'name' => $this->user->name,
                    'email' => $this->user->email,
                    'department' => $this->user->department?->name,
                ];
            }),

            'reviewer' => $this->whenLoaded('reviewer', function () {
                return $this->reviewer ? [
                    'id' => $this->reviewer->id,
                    'name' => $this->reviewer->name,
                    'email' => $this->reviewer->email,
                ] : null;
            }),

            'accountant' => $this->whenLoaded('accountant', function () {
                return $this->accountant ? [
                    'id' => $this->accountant->id,
                    'name' => $this->accountant->name,
                    'email' => $this->accountant->email,
                ] : null;
            }),

            'items' => $this->whenLoaded('items', function () {
                return $this->items->map(function ($it) {
                    return [
                        'id' => $it->id,
                        'item_order' => $it->item_order,
                        'item_description' => $it->item_description,
                        'uom' => $it->uom,
                        'quantity' => (float) $it->quantity,
                        'notes' => $it->notes,
                    ];
                });
            }),

            'can_edit' => $user ? $this->canBeEditedBy($user) : false,
            'can_review' => $user ? $this->canBeReviewedBy($user) : false,
            'can_account' => $user ? $this->canBeAccountedBy($user) : false,
        ];
    }
}
