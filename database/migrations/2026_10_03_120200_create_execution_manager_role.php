<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'execution_manager'],
            [
                'name' => 'Execution Projects Manager',
                'description' => 'مدير مشروعات التنفيذ - اعتماد طلبات الشراء للموظفين التابعين له',
            ]
        );

        $permissionSlugs = [
            'purchase_request.view_gm',
            'purchase_quote.view',
            'purchase_quote.decide',
            'purchase_request.edit_gm',
            'purchase_request.approve_gm',
            'purchase_request.reject_gm',
            'purchase_order.view_gm',
            'purchase_request.create',
            'purchase_request.view_own',
            'purchase_request.edit_own',
            'purchase_request.submit',
            'purchase_receipt.view_assigned',
            'purchase_receipt.edit',
            'purchase_receipt.approve',
        ];

        $permissionIds = Permission::whereIn('slug', $permissionSlugs)->pluck('id');
        $role->permissions()->syncWithoutDetaching($permissionIds);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Keep role or detach permissions if needed
    }
};
