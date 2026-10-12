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
        // 1. Find user Habiba (ID 30 or email habiba@gmail.com)
        $habiba = User::where('id', 30)
            ->orWhere('email', 'habiba@gmail.com')
            ->first();

        // 2. Find roles
        $siteAccountantRole = Role::where('slug', 'site_accountant')->first();
        $generalAccountantRole = Role::where('slug', 'general_accountant')->first();

        if ($habiba && $siteAccountantRole) {
            // Detach site_accountant from Habiba ONLY (do not delete the role or affect others)
            $habiba->roles()->detach($siteAccountantRole->id);
        }

        if ($habiba && $generalAccountantRole) {
            // Ensure Habiba has general_accountant
            $habiba->roles()->syncWithoutDetaching([$generalAccountantRole->id]);
        }

        // 3. Ensure general_accountant role does NOT have receipt editing/approving permissions
        // while strictly keeping receipt viewing for three-way matching and accounting actions
        if ($generalAccountantRole) {
            $prohibitedPermissions = Permission::whereIn('slug', [
                'purchase_receipt.edit',
                'purchase_receipt.approve',
            ])->pluck('id');

            if ($prohibitedPermissions->isNotEmpty()) {
                $generalAccountantRole->permissions()->detach($prohibitedPermissions);
            }

            // Ensure proper accounting permissions are intact
            $allowedPermissionSlugs = [
                'accounting.invoice.view',
                'accounting.invoice.create',
                'accounting.invoice.match',
                'accounting.payment.create',
                'supplier.account.view',
                'purchase_order.view',
                'purchase_order.view_accounting',
                'purchase_receipt.view_assigned',
                'purchase_request.create',
                'purchase_request.view_own',
                'purchase_request.edit_own',
                'purchase_request.submit',
            ];

            $allowedPermissions = Permission::whereIn('slug', $allowedPermissionSlugs)->pluck('id');
            $generalAccountantRole->permissions()->syncWithoutDetaching($allowedPermissions);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $habiba = User::where('id', 30)->orWhere('email', 'habiba@gmail.com')->first();
        $siteAccountantRole = Role::where('slug', 'site_accountant')->first();
        if ($habiba && $siteAccountantRole) {
            $habiba->roles()->syncWithoutDetaching([$siteAccountantRole->id]);
        }
    }
};
