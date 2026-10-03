<?php

namespace App\Http\Requests\PurchaseRequest;

use App\Models\Item;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePurchaseRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'request_type' => ['nullable', 'string', 'in:PROJECT,OFFICE_SUPPLIES'],
            'parcel_reference' => ['nullable', 'string', 'max:100'],
            'region' => ['nullable', 'string', 'max:150'],
            'land_parcel_id' => ['nullable', 'integer', 'exists:land_parcels,id'],
            'target_department_id' => ['sometimes', 'integer', 'exists:departments,id'],
            'site_engineer_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'date_needed' => ['nullable', 'date'],
            'priority' => ['sometimes', 'nullable', 'string', 'in:NORMAL,HIGH,URGENT,EMERGENCY,LOW'],
            'notes' => ['nullable', 'string'],
            'items' => ['sometimes', 'required', 'array', 'min:1'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'items.*.item_description' => ['required', 'string', 'max:255'],
            'items.*.item_reference' => ['nullable', 'string', 'max:100'],
            'items.*.region' => ['nullable', 'string', 'max:150'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.uom' => ['nullable', 'string', 'max:20'],
            'items.*.specifications' => ['nullable', 'string'],
            'items.*.notes' => ['nullable', 'string'],
            'items.*.supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'items.*.estimated_unit_price' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $items = $this->input('items', []);
            $itemIds = collect($items)->pluck('item_id')->filter()->unique()->toArray();

            if (! empty($itemIds)) {
                $inactiveItemCount = Item::whereIn('id', $itemIds)->where('is_active', false)->count();
                if ($inactiveItemCount > 0) {
                    $validator->errors()->add('items', 'One or more selected catalog items are inactive.');
                }
            }
        });
    }
}
