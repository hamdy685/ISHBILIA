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
        $role = Role::firstOrCreate(
            ['slug' => 'execution_manager'],
            [
                'name' => 'Execution Projects Manager',
                'description' => 'مدير مشروعات التنفيذ - اعتماد طلبات الشراء ومتابعة أوامر الشراء للموظفين التابعين له',
            ]
        );

        $executionDept = Department::where('code', 'EXECUTION')->first() ?? Department::first();

        $user = User::firstOrCreate(
            ['email' => 'kareem@gmail.com'],
            [
                'name' => 'المهندس كريم',
                'password' => Hash::make('123456'),
                'is_active' => true,
                'department_id' => $executionDept?->id,
            ]
        );

        if (! $user->roles()->where('slug', 'execution_manager')->exists()) {
            $user->roles()->attach($role->id);
        }
    }
}
