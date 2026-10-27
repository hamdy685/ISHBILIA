<?php

namespace App\Http\Requests\Procurement;

use App\Models\Supplier;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePurchaseOrderHeaderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'supplier_id' => ['sometimes', 'nullable', 'integer', 'exists:suppliers,id'],
            'parcel_reference' => ['nullable', 'string', 'max:100'],
            'region' => ['nullable', 'string', 'max:150'],
            'payment_terms' => ['nullable', 'string', 'max:150'],
            'delivery_terms' => ['nullable', 'string', 'max:150'],
            'delivery_date' => ['nullable', 'date'],
            'budget_code' => ['nullable', 'string', 'max:50'],
            'financial_notes' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            'finalization_notes' => ['nullable', 'string'],
            'discount_type' => ['nullable', 'string', 'in:NONE,TOTAL,SELECTED_ITEMS'],
            'discount_percentage' => ['nullable', 'numeric', 'gte:0', 'lte:100'],
            'discount_item_ids' => ['nullable', 'array'],
            'discount_item_ids.*' => ['integer'],
            'items' => ['sometimes', 'array'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.item_id' => ['nullable', 'integer'],
            'items.*.pr_item_id' => ['nullable', 'integer'],
            'items.*.item_description' => ['sometimes', 'required', 'string', 'max:500'],
            'items.*.item_reference' => ['sometimes', 'nullable', 'string', 'max:100'],
            'items.*.region' => ['sometimes', 'nullable', 'string', 'max:150'],
            'items.*.quantity' => ['sometimes', 'required', 'numeric', 'gte:0'],
            'items.*.unit_price' => ['sometimes', 'required', 'numeric', 'gte:0'],
            'items.*.is_discount_applied' => ['nullable', 'boolean'],
            'items.*.uom' => ['nullable', 'string', 'max:20'],
            'items.*.specifications' => ['nullable', 'string'],
            'items.*.supplier_id' => ['nullable', 'integer'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $supplierId = $this->input('supplier_id');
            if ($supplierId) {
                $supplier = Supplier::find($supplierId);
                if ($supplier && ! $supplier->is_active) {
                    $validator->errors()->add('supplier_id', 'The selected supplier is inactive.');
                }
            }
        });
    }
}
