<?php

use App\Models\Department;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Accounting permissions list for department accountants
        $permissionsSlugs = [
            'accounting.invoice.view',
            'accounting.invoice.create',
            'accounting.invoice.match',
            'supplier.account.view',
            'purchase_order.view',
            'purchase_order.view_accounting',
            'purchase_request.create',
            'purchase_request.view_own',
            'purchase_request.edit_own',
            'purchase_request.submit',
        ];

        $permissions = Permission::whereIn('slug', $permissionsSlugs)->get();
        $permissionIds = $permissions->pluck('id')->all();

        // 2. Create Development Accountant role
        $devAccountantRole = Role::firstOrCreate(
            ['slug' => 'development_accountant'],
            [
                'name' => 'Development Accountant',
                'description' => 'محاسب قسم التطوير - مسؤول عن إجراءات الحسابات الخاصة بقسم التطوير فقط',
            ]
        );
        $devAccountantRole->permissions()->sync($permissionIds);

        // 3. Ensure Development Department exists
        $devDept = Department::where('code', 'DEVELOPMENT')->first();

        // 4. Assign role to Eng. Ahmed (User ID 35)
        $ahmed = User::where('email', 'ahmed.dev@gmail.com')->first();
        if ($ahmed) {
            if ($devDept && $ahmed->department_id !== $devDept->id) {
                $ahmed->update(['department_id' => $devDept->id]);
            }
            $ahmed->roles()->sync([$devAccountantRole->id]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $ahmed = User::where('email', 'ahmed.dev@gmail.com')->first();
        if ($ahmed) {
            $accountantRole = Role::where('slug', 'accountant')->first();
            if ($accountantRole) {
                $ahmed->roles()->sync([$accountantRole->id]);
            }
        }
    }
};
