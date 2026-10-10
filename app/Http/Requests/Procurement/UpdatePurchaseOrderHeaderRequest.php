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
            'supplier_id' => ['sometimes', 'required', 'integer', 'exists:suppliers,id'],
            'payment_terms' => ['nullable', 'string', 'max:150'],
            'delivery_terms' => ['nullable', 'string', 'max:150'],
            'delivery_date' => ['nullable', 'date'],
            'budget_code' => ['nullable', 'string', 'max:50'],
            'financial_notes' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
            'finalization_notes' => ['nullable', 'string'],
            'items' => ['sometimes', 'array'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.item_id' => ['nullable', 'integer'],
            'items.*.pr_item_id' => ['nullable', 'integer'],
            'items.*.item_description' => ['sometimes', 'required', 'string', 'max:500'],
            'items.*.item_reference' => ['sometimes', 'required', 'string', 'max:100'],
            'items.*.region' => ['sometimes', 'required', 'string', 'max:150'],
            'items.*.quantity' => ['sometimes', 'required', 'numeric', 'gte:0'],
            'items.*.unit_price' => ['sometimes', 'required', 'numeric', 'gte:0'],
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
