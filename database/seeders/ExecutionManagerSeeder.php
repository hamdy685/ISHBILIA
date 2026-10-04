<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class ExecutionManagerSeeder extends Seeder
{
    public function run(): void
    {
        // 0. التأكد من تشغيل أي ترحيلات ناقصة في قاعدة البيانات
        if (! \Illuminate\Support\Facades\Schema::hasColumn('users', 'manager_id')) {
            try {
                \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
            } catch (\Throwable $e) {
                // Ignore if migration fails or already running
            }
        }

        // 1. جلب أو إنشاء دور مدير مشروعات التنفيذ
        $role = Role::firstOrCreate(
            ['slug' => 'execution_manager'],
            [
                'name' => 'Execution Projects Manager',
                'description' => 'مدير مشروعات التنفيذ - اعتماد طلبات الشراء ومتابعة أوامر الشراء للموظفين التابعين له',
            ]
        );

        // 2. إنشاء أو تحديث حساب المهندس كريم
        $dept = Department::where('code', 'EXECUTION')->first() ?? Department::first();

        $karim = User::where('email', 'karim@eshbelia.com')
            ->orWhere('email', 'kareem@gmail.com')
            ->first();

        if ($karim) {
            $karim->update([
                'name' => 'المهندس كريم',
                'email' => 'karim@eshbelia.com',
                'password' => Hash::make('password123'),
                'is_active' => true,
                'department_id' => $dept?->id,
            ]);
        } else {
            $karim = User::create([
                'name' => 'المهندس كريم',
                'email' => 'karim@eshbelia.com',
                'password' => Hash::make('password123'),
                'is_active' => true,
                'department_id' => $dept?->id,
            ]);
        }

        // ربط الدور بحساب المهندس كريم
        if (! $karim->roles()->where('slug', 'execution_manager')->exists()) {
            $karim->roles()->syncWithoutDetaching([$role->id]);
        }

        // 3. البحث عن حساب المهندس كامل وتحديث المدير المباشر له
        if (\Illuminate\Support\Facades\Schema::hasColumn('users', 'manager_id')) {
            $kamelUsers = User::where('email', 'kamel@eshbelia.com')
                ->orWhere('email', 'kamel@gmail.com')
                ->orWhere('name', 'like', '%كامل%')
                ->get();

            foreach ($kamelUsers as $kamel) {
                if ($kamel->id !== $karim->id) {
                    $kamel->update([
                        'manager_id' => $karim->id,
                    ]);
                }
            }
        }

        // 4. تنظيف أي إشعارات قديمة كانت موجهة للمدير العام بخصوص طلبات تتبع مدير مشروعات التنفيذ
        try {
            $gmUserIds = User::whereHas('roles', fn ($q) => $q->where('slug', 'general_manager'))->pluck('id');
            if ($gmUserIds->isNotEmpty()) {
                \App\Models\Notification::whereIn('user_id', $gmUserIds)
                    ->whereHasMorph('notifiable', [\App\Models\PurchaseRequest::class], function ($q) {
                        $q->whereHas('requester.manager.roles', fn ($r) => $r->where('slug', 'execution_manager'));
                    })
                    ->delete();
            }
        } catch (\Throwable $e) {
            // Ignore
        }

        // 5. تصحيح تسعير الكانات وحديد التسليح لطلب PR-2026-00030 أو أي بنود مشابهة
        try {
            $prs = \App\Models\PurchaseRequest::where('request_number', 'PR-2026-00030')
                ->orWhereHas('items', function ($iq) {
                    $iq->where('estimated_unit_price', '>', 500)
                       ->where(function ($uq) {
                           $uq->whereIn(\Illuminate\Support\Facades\DB::raw('UPPER(uom)'), ['KG', 'KILOGRAM', 'كجم'])
                              ->orWhere('uom', 'like', '%كيلو%');
                       });
                })->get();

            foreach ($prs as $pr) {
                $newPrTotal = 0.0;
                foreach ($pr->items as $item) {
                    $isKanatInKg = (str_contains($item->item_description, 'كانات') || str_contains($item->item_description, 'حديد'))
                        && (float)$item->estimated_unit_price > 500
                        && (in_array(strtoupper((string)($item->uom ?? '')), ['KG', 'KILOGRAM', 'كجم']) || str_contains((string)($item->uom ?? ''), 'كيلو'));

                    if ($isKanatInKg) {
                        $oldQty = (float)$item->quantity;
                        $tonQty = round($oldQty / 1000, 3);
                        $tonPrice = (float)$item->estimated_unit_price;
                        $lineTotal = round($tonQty * $tonPrice, 2);

                        $item->update([
                            'quantity' => $tonQty,
                            'uom' => 'TON',
                            'specifications' => trim(($item->specifications ? $item->specifications . ' • ' : '') . "الكمية الأصلية: {$oldQty} كجم"),
                            'estimated_unit_price' => $tonPrice,
                            'estimated_line_total' => $lineTotal,
                        ]);
                        $newPrTotal += $lineTotal;
                    } else {
                        $newPrTotal += (float)$item->estimated_line_total;
                    }
                }
                $pr->update(['total_estimated_cost' => round($newPrTotal, 2)]);
            }
        } catch (\Throwable $e) {
            // Ignore
        }
    }
}
