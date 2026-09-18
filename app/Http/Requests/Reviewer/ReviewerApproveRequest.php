<?php

namespace App\Http\Requests\Reviewer;

use App\Models\PurchaseRequest;
use Illuminate\Foundation\Http\FormRequest;

class ReviewerApproveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->filled('receiver_user_id') && ! $this->filled('site_engineer_user_id')) {
            $this->merge([
                'site_engineer_user_id' => $this->input('receiver_user_id'),
            ]);
        }
    }

    public function rules(): array
    {
        return [
            'comment' => ['nullable', 'string', 'max:1000'],
            'requires_warehouse_receipt' => ['nullable', 'boolean'],
            'receiver_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'site_engineer_user_id' => [
                'nullable',
                'integer',
                'exists:users,id',
                function ($attribute, $value, $fail) {
                    $prId = $this->route('id');
                    $pr = PurchaseRequest::with(['targetDepartment', 'department'])->find($prId);
                    $siteEngId = $value ?: $pr?->site_engineer_user_id ?: $pr?->targetDepartment?->site_engineer_user_id ?: $pr?->department?->site_engineer_user_id;
                    if (! $siteEngId) {
                        $fail('يجب اختيار مهندس الموقع أو مسؤول الاستلام قبل اعتماد الطلب.');
                    }
                },
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'site_engineer_user_id.exists' => 'مهندس الموقع أو مسؤول الاستلام المحدد غير مسجل في النظام.',
        ];
    }
}
