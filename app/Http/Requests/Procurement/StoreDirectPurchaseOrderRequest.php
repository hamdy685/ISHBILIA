<?php

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;

class StoreDirectPurchaseOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'one_time_supplier_name' => ['nullable', 'string', 'max:150'],
            'department_id' => ['required', 'integer', 'exists:departments,id'],
            'site_engineer_user_id' => ['required', 'integer', 'exists:users,id'],
            'requires_warehouse_receipt' => ['nullable', 'boolean'],
            'delivery_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'items.*.item_description' => ['required', 'string', 'max:255'],
            'items.*.item_reference' => ['required', 'string', 'max:100'],
            'items.*.region' => ['required', 'string', 'max:150'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.01', 'max:999999999'],
            'items.*.uom' => ['required', 'string', 'max:30'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0', 'max:999999999'],
            'items.*.specifications' => ['nullable', 'string'],
            'items.*.supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'items.*.one_time_supplier_name' => ['nullable', 'string', 'max:150'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $hasGlobal = !empty($this->supplier_id) || !empty(trim((string)$this->one_time_supplier_name));
            $items = $this->input('items');
            $hasItems = is_array($items) && count($items) > 0 && collect($items)->every(
                fn($i) => !empty($i['supplier_id']) || !empty(trim((string)($i['one_time_supplier_name'] ?? '')))
            );

            if (!$hasGlobal && !$hasItems) {
                $validator->errors()->add('supplier_id', 'يجب اختيار مورد معتمد أو إدخال اسم مورد لعملية واحدة فقط.');
            }
        });
    }
}

