<?php

namespace App\Http\Requests\PurchaseRequest;

use App\Models\Item;
use Illuminate\Foundation\Http\FormRequest;

class StorePurchaseRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $merge = [];

        // Map department_id to target_department_id if missing
        if (! $this->filled('target_department_id')) {
            if ($this->filled('department_id')) {
                $merge['target_department_id'] = $this->input('department_id');
            } elseif ($this->user()?->department_id) {
                $merge['target_department_id'] = $this->user()->department_id;
            }
        }

        // Map required_date or required_delivery_date to date_needed
        if (! $this->filled('date_needed')) {
            if ($this->filled('required_date')) {
                $merge['date_needed'] = $this->input('required_date');
            } elseif ($this->filled('required_delivery_date')) {
                $merge['date_needed'] = $this->input('required_delivery_date');
            }
        }

        // Map parcel / parcel_name to parcel_reference
        if (! $this->filled('parcel_reference')) {
            if ($this->filled('parcel')) {
                $merge['parcel_reference'] = $this->input('parcel');
            } elseif ($this->filled('parcel_name')) {
                $merge['parcel_reference'] = $this->input('parcel_name');
            }
        }

        // Sanitize numeric IDs to null if empty or 0
        if ($this->has('land_parcel_id')) {
            $lpId = $this->input('land_parcel_id');
            if (empty($lpId) || (int) $lpId <= 0) {
                $merge['land_parcel_id'] = null;
            }
        }

        if ($this->has('site_engineer_user_id')) {
            $seId = $this->input('site_engineer_user_id');
            if (empty($seId) || (int) $seId <= 0) {
                $merge['site_engineer_user_id'] = null;
            }
        }

        if ($this->has('reviewer_user_id')) {
            $rvId = $this->input('reviewer_user_id');
            if (empty($rvId) || (int) $rvId <= 0) {
                $merge['reviewer_user_id'] = null;
            }
        }

        // Sanitize items array
        if ($this->has('items') && is_array($this->input('items'))) {
            $topParcel = $merge['parcel_reference'] ?? $this->input('parcel_reference');
            $topRegion = $this->input('region');
            $items = $this->input('items');

            foreach ($items as $idx => $it) {
                if (is_array($it)) {
                    if (isset($it['item_id']) && (empty($it['item_id']) || (int) $it['item_id'] <= 0)) {
                        $items[$idx]['item_id'] = null;
                    }
                    if (empty($it['uom']) && ! empty($it['unit'])) {
                        $items[$idx]['uom'] = $it['unit'];
                    }
                    if (empty($it['item_reference']) && ! empty($topParcel)) {
                        $items[$idx]['item_reference'] = $topParcel;
                    }
                    if (empty($it['region']) && ! empty($topRegion)) {
                        $items[$idx]['region'] = $topRegion;
                    }
                }
            }
            $merge['items'] = $items;
        }

        if (! empty($merge)) {
            $this->merge($merge);
        }
    }

    public function rules(): array
    {
        return [
            'request_type' => ['nullable', 'string', 'in:PROJECT,OFFICE_SUPPLIES'],
            'parcel_reference' => [
                \Illuminate\Validation\Rule::requiredIf(fn () => ($this->input('request_type') ?? 'PROJECT') === 'PROJECT'),
                'nullable',
                'string',
                'max:100',
            ],
            'parcel' => ['nullable', 'string', 'max:100'],
            'region' => [
                \Illuminate\Validation\Rule::requiredIf(fn () => ($this->input('request_type') ?? 'PROJECT') === 'PROJECT'),
                'nullable',
                'string',
                'max:150',
            ],
            'land_parcel_id' => ['nullable', 'integer', 'exists:land_parcels,id'],
            'target_department_id' => ['required', 'integer', 'exists:departments,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'reviewer_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'site_engineer_user_id' => ['nullable', 'integer', 'exists:users,id'],

            'date_needed' => ['nullable', 'date'],
            'required_date' => ['nullable', 'date'],
            'required_delivery_date' => ['nullable', 'date'],
            'priority' => ['nullable', 'string', 'in:NORMAL,HIGH,URGENT,EMERGENCY,LOW'],
            'notes' => ['nullable', 'string'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_id' => ['nullable', 'integer', 'exists:items,id'],
            'items.*.item_description' => ['required', 'string', 'max:255'],
            'items.*.item_reference' => ['nullable', 'string', 'max:100'],
            'items.*.region' => ['nullable', 'string', 'max:150'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.uom' => ['nullable', 'string', 'max:20'],
            'items.*.unit' => ['nullable', 'string', 'max:20'],
            'items.*.specifications' => ['nullable', 'string'],
            'items.*.notes' => ['nullable', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'parcel_reference.required' => 'رقم قطعة الأرض مطلوب لطلبات المشاريع ولا يمكن أن يكون فارغًا.',
            'region.required' => 'المنطقة مطلوبة لطلبات المشاريع ولا يمكن أن تكون فارغة.',
            'target_department_id.required' => 'القسم المستهدف مطلوب. يرجى اختيار القسم المعالج للطلب.',
            'target_department_id.exists' => 'القسم المستهدف المحدد غير موجود.',
            'items.required' => 'يجب إضافة بند واحد على الأقل لطلب الشراء.',
            'items.min' => 'يجب إضافة بند واحد على الأقل لطلب الشراء.',
            'items.*.item_description.required' => 'وصف الصنف مطلوب لكل بند.',
            'items.*.quantity.required' => 'الكمية مطلوبة لكل بند.',
            'items.*.quantity.gt' => 'الكمية يجب أن تكون أكبر من صفر.',
            'date_needed.date' => 'تاريخ الاحتياج يجب أن يكون تاريخًا صحيحًا.',
            'land_parcel_id.exists' => 'قطعة الأرض المحددة غير صحيحة.',
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
                    $validator->errors()->add('items', 'أحد الأصناف المختارة من الدليل غير نشط أو تم إيقافه.');
                }
            }
        });
    }
}
