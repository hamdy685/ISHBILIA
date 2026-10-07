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
        // 1. Create or restore the Development department
        $devDept = Department::withTrashed()->where('code', 'DEVELOPMENT')->first();
        if ($devDept) {
            if ($devDept->trashed()) {
                $devDept->restore();
            }
            $devDept->update([
                'name' => 'التطوير',
                'is_active' => true,
            ]);
        } else {
            $devDept = Department::create([
                'code' => 'DEVELOPMENT',
                'name' => 'التطوير',
                'is_active' => true,
            ]);
        }

        $reviewerRole = Role::where('slug', 'reviewer')->first();
        $accountantRole = Role::where('slug', 'accountant')->first();

        // 2. Create or update reviewer account for Eng. Mahmoud (المهندس محمود)
        $mahmoud = User::withTrashed()->where('email', 'mahmoud@gmail.com')->first();
        if ($mahmoud) {
            if ($mahmoud->trashed()) {
                $mahmoud->restore();
            }
            $mahmoud->update([
                'name' => 'المهندس محمود',
                'department_id' => $devDept->id,
                'is_active' => true,
                'password' => Hash::make('123456'),
            ]);
        } else {
            $mahmoud = User::create([
                'name' => 'المهندس محمود',
                'email' => 'mahmoud@gmail.com',
                'password' => Hash::make('123456'),
                'department_id' => $devDept->id,
                'is_active' => true,
            ]);
        }

        if ($reviewerRole) {
            $mahmoud->roles()->sync([$reviewerRole->id]);
        }

        // Set Eng. Mahmoud as the designated manager/reviewer of the Development department
        $devDept->update(['manager_user_id' => $mahmoud->id]);

        // 3. Create or update accountant account for Eng. Ahmed (المهندس أحمد)
        $ahmed = User::withTrashed()->where('email', 'ahmed.dev@gmail.com')->first();
        if ($ahmed) {
            if ($ahmed->trashed()) {
                $ahmed->restore();
            }
            $ahmed->update([
                'name' => 'المهندس أحمد',
                'department_id' => $devDept->id,
                'is_active' => true,
                'password' => Hash::make('123456'),
            ]);
        } else {
            $ahmed = User::create([
                'name' => 'المهندس أحمد',
                'email' => 'ahmed.dev@gmail.com',
                'password' => Hash::make('123456'),
                'department_id' => $devDept->id,
                'is_active' => true,
            ]);
        }

        if ($accountantRole) {
            $ahmed->roles()->sync([$accountantRole->id]);
        }
    }

    public function down(): void
    {
        $devDept = Department::where('code', 'DEVELOPMENT')->first();
        if ($devDept) {
            User::where('department_id', $devDept->id)->delete();
            $devDept->delete();
        }
    }
};
