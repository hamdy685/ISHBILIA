<?php

use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Hash;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Create or restore Department: Marketing (التسويق)
        $marketingDept = Department::withTrashed()->where('code', 'MARKETING')->first();
        if ($marketingDept) {
            if ($marketingDept->trashed()) {
                $marketingDept->restore();
            }
            $marketingDept->update([
                'name' => 'التسويق',
                'is_active' => true,
            ]);
        } else {
            $marketingDept = Department::create([
                'code' => 'MARKETING',
                'name' => 'التسويق',
                'is_active' => true,
            ]);
        }

        // 2. Create or restore Department: Sales (المبيعات)
        $salesDept = Department::withTrashed()->where('code', 'SALES')->first();
        if ($salesDept) {
            if ($salesDept->trashed()) {
                $salesDept->restore();
            }
            $salesDept->update([
                'name' => 'المبيعات',
                'is_active' => true,
            ]);
        } else {
            $salesDept = Department::create([
                'code' => 'SALES',
                'name' => 'المبيعات',
                'is_active' => true,
            ]);
        }

        $reviewerRole = Role::where('slug', 'reviewer')->first();

        // 3. Create or update Marketing Reviewer: Eng. Karim Ahmed (المهندس كريم أحمد)
        $karimMarketing = User::withTrashed()
            ->where('email', 'karim.marketing@gmail.com')
            ->first();

        if ($karimMarketing) {
            if ($karimMarketing->trashed()) {
                $karimMarketing->restore();
            }
            $karimMarketing->update([
                'name' => 'المهندس كريم أحمد',
                'department_id' => $marketingDept->id,
                'is_active' => true,
                'password' => Hash::make('123456'),
            ]);
        } else {
            $karimMarketing = User::create([
                'name' => 'المهندس كريم أحمد',
                'email' => 'karim.marketing@gmail.com',
                'password' => Hash::make('123456'),
                'department_id' => $marketingDept->id,
                'is_active' => true,
            ]);
        }

        if ($reviewerRole) {
            $karimMarketing->roles()->sync([$reviewerRole->id]);
        }

        // Assign Eng. Karim Ahmed as manager and designated reviewer of Marketing
        $marketingDept->update(['manager_user_id' => $karimMarketing->id]);

        // 4. Create or update Sales Reviewer: Eng. Amr Bayoumi (المهندس عمرو بيومي)
        $amrSales = User::withTrashed()
            ->where('email', 'amr.sales@gmail.com')
            ->first();

        if ($amrSales) {
            if ($amrSales->trashed()) {
                $amrSales->restore();
            }
            $amrSales->update([
                'name' => 'المهندس عمرو بيومي',
                'department_id' => $salesDept->id,
                'is_active' => true,
                'password' => Hash::make('123456'),
            ]);
        } else {
            $amrSales = User::create([
                'name' => 'المهندس عمرو بيومي',
                'email' => 'amr.sales@gmail.com',
                'password' => Hash::make('123456'),
                'department_id' => $salesDept->id,
                'is_active' => true,
            ]);
        }

        if ($reviewerRole) {
            $amrSales->roles()->sync([$reviewerRole->id]);
        }

        // Assign Eng. Amr Bayoumi as manager and designated reviewer of Sales
        $salesDept->update(['manager_user_id' => $amrSales->id]);
    }

    public function down(): void
    {
        $marketingDept = Department::where('code', 'MARKETING')->first();
        if ($marketingDept) {
            User::where('email', 'karim.marketing@gmail.com')->delete();
            $marketingDept->delete();
        }

        $salesDept = Department::where('code', 'SALES')->first();
        if ($salesDept) {
            User::where('email', 'amr.sales@gmail.com')->delete();
            $salesDept->delete();
        }
    }
};
