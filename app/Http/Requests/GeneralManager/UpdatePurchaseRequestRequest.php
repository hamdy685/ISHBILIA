<?php

namespace App\Http\Requests\GeneralManager;

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
            'date_needed' => ['sometimes', 'nullable', 'date'],
            'notes' => ['sometimes', 'nullable', 'string'],
            'comment' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'items' => ['sometimes', 'array', 'min:1'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'items.*.item_description' => ['required_with:items', 'string', 'max:255'],
            'items.*.item_reference' => ['required_with:items', 'string', 'max:100'],
            'items.*.region' => ['required_with:items', 'string', 'max:150'],
            'items.*.quantity' => ['required_with:items', 'numeric', 'gt:0'],
            'items.*.uom' => ['nullable', 'string', 'max:20'],
            'items.*.specifications' => ['nullable', 'string'],
            'items.*.notes' => ['nullable', 'string'],
            'items.*.supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'items.*.estimated_unit_price' => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
