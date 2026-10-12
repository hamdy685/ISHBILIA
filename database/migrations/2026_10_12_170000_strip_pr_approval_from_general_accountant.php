<?php

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Strips Purchase Request approval/rejection/view permissions from the general_accountant
     * role (Eng. Habiba). Habiba is an operational accountant handling invoice registration,
     * three-way matching, and supplier accounts/payments AFTER the actual PO and receipt
     * are created. PR financial approval belongs exclusively to the Financial Director (role 'accountant').
     */
    public function up(): void
    {
        $permissionsToStrip = Permission::whereIn('slug', [
            'purchase_request.accounting_view',
            'purchase_request.accounting_approve',
            'purchase_request.accounting_reject',
        ])->get();

        if ($permissionsToStrip->isNotEmpty()) {
            $permissionIds = $permissionsToStrip->pluck('id')->all();

            // 1. Detach from general_accountant role
            $generalAccountantRole = Role::where('slug', 'general_accountant')->first();
            if ($generalAccountantRole) {
                $generalAccountantRole->permissions()->detach($permissionIds);
            }

            // 2. Ensure Habiba directly does not have them either
            $habibaUsers = User::where('email', 'habiba@gmail.com')
                ->orWhere('email', 'habiba@ashbiliya.com')
                ->orWhere('id', 30)
                ->get();

            foreach ($habibaUsers as $user) {
                // If there's any user-level permission pivot or cache, ensure it's detached
                if (method_exists($user, 'permissions')) {
                    $user->permissions()->detach($permissionIds);
                }
            }
        }

        // 3. Ensure the Financial Director role ('accountant') exists and has all three PR approval permissions
        $accountantRole = Role::firstOrCreate(
            ['slug' => 'accountant'],
            ['name' => 'Financial Director', 'description' => 'المدير المالي - مسؤول الرقابة المالية الشاملة والاعتمادات والتقارير']
        );
        if ($accountantRole) {
            foreach ([
                'purchase_request.accounting_view' => 'عرض موافقات الحسابات المباشرة',
                'purchase_request.accounting_approve' => 'اعتماد طلبات الشراء المالية المباشرة',
                'purchase_request.accounting_reject' => 'رفض طلبات الشراء المالية المباشرة',
            ] as $slug => $name) {
                $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $name]);
                $accountantRole->permissions()->syncWithoutDetaching([$perm->id]);
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op rollback to maintain role security
    }
};
