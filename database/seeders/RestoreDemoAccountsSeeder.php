<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class RestoreDemoAccountsSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(RolePermissionSeeder::class);

        $departments = [];
        foreach ([
            'EXECUTION' => 'التنفيذ',
            'BUILDINGS' => 'المباني',
            'FINISHING' => 'التشطيبات',
            'LICENSES' => 'التراخيص',
            'BUFFET' => 'البوفيه',
            'DEVELOPMENT' => 'التطوير',
        ] as $code => $name) {
            $departments[$code] = Department::withTrashed()->firstOrCreate(
                ['code' => $code],
                ['name' => $name, 'is_active' => true]
            );
            if ($departments[$code]->trashed()) {
                $departments[$code]->restore();
            }
        }

        $roles = [];
        foreach (['employee', 'reviewer', 'procurement_manager', 'accountant', 'general_manager', 'admin', 'warehouse_keeper', 'site_engineer'] as $slug) {
            $roles[$slug] = Role::where('slug', $slug)->first();
        }

        $users = [
            // Department Reviewers
            ['ayman@gmail.com', 'م. أيمن ماهر', 'reviewer', 'EXECUTION'],
            ['hatem@gmail.com', 'المهندس حاتم', 'reviewer', 'BUILDINGS'],
            ['kheshen@gmail.com', 'المهندس مصطفى الخشن', 'reviewer', 'FINISHING'],
            ['mostafa@gmail.com', 'م. مصطفى', 'reviewer', 'LICENSES'],
            ['amr@gmail.com', 'أ. عمرو', 'reviewer', 'BUFFET'],
            ['mahmoud@gmail.com', 'المهندس محمود', 'reviewer', 'DEVELOPMENT'],

            // Management & Operations
            ['ahmed@gmail.com', 'المهندس أحمد بدوي', 'procurement_manager', 'EXECUTION'],
            ['hasan@gmail.com', 'حسن', 'accountant', 'EXECUTION'],
            ['ahmed.dev@gmail.com', 'المهندس أحمد', 'accountant', 'DEVELOPMENT'],
            ['mohamed@gmail.com', 'المهندس محمد عبدالكريم', 'general_manager', 'EXECUTION'],
            ['admin@gmail.com', 'Admin', 'admin', 'EXECUTION'],
            ['salam@gmail.com', 'عم سلامة', 'warehouse_keeper', 'EXECUTION'],

            // The 4 Site Engineers
            ['kamel@gmail.com', 'م. كامل', 'site_engineer', 'EXECUTION'],
            ['youssef@gmail.com', 'م. يوسف', 'site_engineer', 'EXECUTION'],
            ['islam@gmail.com', 'م. إسلام', 'site_engineer', 'EXECUTION'],
            ['banhawy@gmail.com', 'أيمن البنهاوي', 'site_engineer', 'EXECUTION'],
        ];

        // Safely ensure default users exist without deleting or altering other users
        foreach ($users as [$email, $name, $role, $department]) {
            $user = User::withTrashed()->firstOrCreate(
                ['email' => $email],
                [
                    'name' => $name,
                    'password' => $role === 'warehouse_keeper' ? '1' : '123456',
                    'department_id' => $departments[$department]->id ?? null,
                    'is_active' => true,
                ]
            );

            if ($user->trashed()) {
                $user->restore();
            }

            $user->update([
                'is_active' => true,
                'password' => $role === 'warehouse_keeper' ? '1' : '123456',
            ]);

            if (isset($roles[$role]) && ! $user->roles()->where('slug', $role)->exists()) {
                $user->roles()->syncWithoutDetaching([$roles[$role]->id]);
            }
        }

        // Set default managers only if not already assigned
        foreach ([
            'EXECUTION' => 'ayman@gmail.com',
            'BUILDINGS' => 'hatem@gmail.com',
            'FINISHING' => 'kheshen@gmail.com',
            'LICENSES' => 'mostafa@gmail.com',
            'BUFFET' => 'amr@gmail.com',
            'DEVELOPMENT' => 'mahmoud@gmail.com',
        ] as $department => $email) {
            if (isset($departments[$department])) {
                $deptModel = Department::find($departments[$department]->id);
                if ($deptModel && ! $deptModel->manager_user_id) {
                    $managerId = User::where('email', $email)->value('id');
                    if ($managerId) {
                        $deptModel->update(['manager_user_id' => $managerId]);
                    }
                }
            }
        }
    }
}
