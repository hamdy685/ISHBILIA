<?php

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
        // 1. Create or find the general_accountant role
        $generalAccountantRole = Role::firstOrCreate(
            ['slug' => 'general_accountant'],
            [
                'name' => 'General Accountant',
                'description' => 'المحاسب العام - تسجيل الفواتير والمطابقة المالية والاطلاع على كافة طلبات وأوامر وأذونات أقسام الشركة (المهندسة حبيبة)',
            ]
        );

        // 2. Assign complete accounting permissions to general_accountant
        $permissionsSlugs = [
            'accounting.invoice.view',
            'accounting.invoice.create',
            'accounting.invoice.match',
            'accounting.payment.create',
            'supplier.account.view',
            'purchase_order.view',
            'purchase_order.view_accounting',
            'purchase_receipt.view_assigned',
            'purchase_receipt.edit',
            'purchase_receipt.approve',
            'purchase_request.create',
            'purchase_request.view_own',
            'purchase_request.edit_own',
            'purchase_request.submit',
            'purchase_request.accounting_view',
            'purchase_request.accounting_approve',
            'purchase_request.accounting_reject',
        ];

        $permissions = Permission::whereIn('slug', $permissionsSlugs)->get();
        $generalAccountantRole->permissions()->sync($permissions->pluck('id')->all());

        // 3. Assign role to User Habiba (habiba@gmail.com and any matching Habiba accounts)
        $habibaUsers = User::withTrashed()
            ->where('email', 'habiba@gmail.com')
            ->orWhere('email', 'habiba@ashbiliya.com')
            ->get();

        foreach ($habibaUsers as $habiba) {
            $habiba->update([
                'name' => 'المهندسة حبيبة',
            ]);
            $habiba->roles()->syncWithoutDetaching([$generalAccountantRole->id]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $generalAccountantRole = Role::where('slug', 'general_accountant')->first();
        if ($generalAccountantRole) {
            $generalAccountantRole->users()->detach();
            $generalAccountantRole->permissions()->detach();
            $generalAccountantRole->delete();
        }
    }
};
