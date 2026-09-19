<?php

namespace App\Http\Requests\PurchaseRequestItem;

use Illuminate\Foundation\Http\FormRequest;

class StorePurchaseRequestItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'item_description' => ['required', 'string', 'max:255'],
            'item_id' => ['nullable', 'integer', 'exists:items,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'item_reference' => ['nullable', 'string', 'max:100'],
            'region' => ['nullable', 'string', 'max:100'],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'uom' => ['nullable', 'string', 'max:50'],
            'estimated_unit_price' => ['nullable', 'numeric', 'min:0'],
            'specifications' => ['nullable', 'string', 'max:1000'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'item_description.required' => 'وصف البند مطلوب.',
            'quantity.required' => 'الكمية مطلوبة.',
            'quantity.gt' => 'الكمية يجب أن تكون أكبر من الصفر.',
            'estimated_unit_price.min' => 'سعر الوحدة التقديري يجب أن يكون صفرًا أو أكثر.',
            'item_id.exists' => 'الصنف المختار غير صالح.',
            'supplier_id.exists' => 'المورد المختار غير صالح.',
        ];
    }
}
