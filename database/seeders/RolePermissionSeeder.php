<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RolePermissionSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $permissions = [
            // Employee Requisition Permissions
            'purchase_request.create' => 'Create new purchase request',
            'purchase_request.view_own' => 'View own submitted purchase requests',
            'purchase_request.edit_own' => 'Edit own draft purchase requests',
            'purchase_request.submit' => 'Submit purchase request for review',

            // Reviewer Departmental Review Permissions
            'purchase_request.view_assigned' => 'View departmentally assigned purchase requests',
            'purchase_request.review' => 'Review pending purchase requests',
            'purchase_request.edit_during_review' => 'Directly modify purchase requests during review',
            'purchase_request.approve' => 'Approve purchase request',
            'purchase_request.reject' => 'Reject purchase request',

            // Site Engineer / Warehouse Receipt Permissions
            'purchase_receipt.view_assigned' => 'View assigned purchase receipt tasks',
            'purchase_receipt.edit' => 'Register received quantities after warehouse receipt',
            'purchase_receipt.approve' => 'Approve assigned purchase receipts',

            // Multi-quote workflow permissions
            'purchase_quote.create' => 'Create three supplier quotes for a purchase request',
            'purchase_quote.view' => 'View submitted supplier quotes',
            'purchase_quote.recommend' => 'Recommend a supplier quote',
            'purchase_quote.decide' => 'Select or reject the final supplier quote',

            // Procurement Manager Permissions
            'purchase_request.view_approved' => 'View purchase requests pending procurement approval',
            'purchase_request.approve_procurement' => 'Approve purchase request at procurement level',
            'purchase_order.view' => 'View purchase orders',
            'purchase_order.create' => 'Create commercial purchase orders',
            'purchase_order.edit' => 'Edit purchase orders when allowed',
            'supplier.view' => 'View approved suppliers catalog',
            'supplier.create' => 'Create new supplier record',
            'supplier.edit' => 'Edit supplier information',

            // Accountant Financial Operations Permissions
            'purchase_order.view_accounting' => 'View issued purchase orders as Accountant',
            'accounting.invoice.view' => 'View approved receipts and supplier invoices',
            'accounting.invoice.create' => 'Register supplier invoices',
            'accounting.invoice.match' => 'Match purchase order, receipt, and invoice',
            'accounting.payment.create' => 'Register supplier payments',
            'supplier.account.view' => 'View supplier account statements and balances',
            'purchase_request.accounting_view' => 'View purchase requests pending direct accounting approval',
            'purchase_request.accounting_approve' => 'Approve purchase requests directly from accounting',
            'purchase_request.accounting_reject' => 'Reject purchase requests directly from accounting',

            // General Manager / Executive Purchase Request Decision Permissions
            'purchase_request.view_gm' => 'View purchase requests pending executive decision',
            'purchase_request.edit_gm' => 'Edit purchase requests during executive review',
            'purchase_request.approve_gm' => 'Approve purchase requests at executive level',
            'purchase_request.reject_gm' => 'Reject purchase requests at executive level',

            // General Manager — Purchase Order View Access
            'purchase_order.view_gm' => 'View issued purchase orders as General Manager',

            // System Administration Permissions
            'system.users.manage' => 'Manage system user accounts',
            'system.roles.manage' => 'Manage user roles and assignments',
            'system.permissions.manage' => 'Manage system permissions',
            'system.departments.manage' => 'Manage department structure',
            'system.categories.manage' => 'Manage item categories',
            'system.items.manage' => 'Manage catalog items',
            'system.suppliers.manage' => 'Manage suppliers catalog',
            'system.monitor.view' => 'View application health, deployment status, alerts, and audit activity',
        ];

        $createdPermissions = [];
        foreach ($permissions as $slug => $name) {
            $createdPermissions[$slug] = Permission::firstOrCreate(
                ['slug' => $slug],
                ['name' => $name, 'description' => $name]
            );
        }

        // Clean up any obsolete invalid permissions from database
        Permission::whereIn('slug', [
            'purchase_order.review_financial',
            'purchase_order.approve_accounting',
            'purchase_order.return_to_procurement',
        ])->delete();

        $rolesMatrix = [
            'employee' => [
                'name' => 'Employee',
                'description' => 'Requisition initiator',
                'permissions' => [
                    'purchase_request.create',
                    'purchase_request.view_own',
                    'purchase_request.edit_own',
                    'purchase_request.submit',
                ],
            ],
            'reviewer' => [
                'name' => 'Reviewer',
                'description' => 'Departmental reviewer with direct modification capability',
                'permissions' => [
                    'purchase_request.view_assigned',
                    'purchase_request.review',
                    'purchase_request.edit_during_review',
                    'purchase_quote.view',
                    'purchase_quote.recommend',
                    'purchase_request.approve',
                    'purchase_request.reject',
                ],
            ],
            'site_engineer' => [
                'name' => 'Site Engineer',
                'description' => 'Site engineer responsible for reviewing and approving purchase receipts',
                'permissions' => [
                    'purchase_receipt.view_assigned',
                    'purchase_receipt.edit',
                    'purchase_receipt.approve',
                ],
            ],
            'warehouse_keeper' => [
                'name' => 'Warehouse Keeper',
                'description' => 'Warehouse keeper responsible for registering received quantities',
                'permissions' => [
                    'purchase_receipt.view_assigned',
                    'purchase_receipt.edit',
                ],
            ],
            'procurement_manager' => [
                'name' => 'Procurement Manager',
                'description' => 'Procurement officer responsible for commercial purchase orders',
                'permissions' => [
                    'purchase_request.view_approved',
                    'purchase_request.approve_procurement',
                    'purchase_quote.create',
                    'purchase_quote.view',
                    'purchase_quote.recommend',
                    'purchase_order.view',
                    'purchase_order.create',
                    'purchase_order.edit',
                    'supplier.view',
                    'supplier.create',
                    'supplier.edit',
                    'purchase_receipt.view_assigned',
                    'purchase_receipt.edit',
                    'purchase_receipt.approve',
                ],
            ],
            'accountant' => [
                'name' => 'Financial Director',
                'description' => 'المدير المالي - مسؤول الرقابة المالية الشاملة والاعتمادات والتقارير',
                'permissions' => [
                    'purchase_order.view',
                    'purchase_quote.view',
                    'purchase_quote.recommend',
                    'purchase_order.view_accounting',
                    'accounting.invoice.view',
                    'accounting.invoice.create',
                    'accounting.invoice.match',
                    'accounting.payment.create',
                    'supplier.account.view',
                    'purchase_request.accounting_view',
                    'purchase_request.accounting_approve',
                    'purchase_request.accounting_reject',
                ],
            ],
            'site_accountant' => [
                'name' => 'Site Accountant',
                'description' => 'حسابات - تسجيل فواتير الموردين ومطابقة أذونات الاستلام لأقسام التنفيذ والتشطيبات والمباني',
                'permissions' => [
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
                ],
            ],
            'licenses_accountant' => [
                'name' => 'Licenses Accountant',
                'description' => 'حسابات - تسجيل فواتير الموردين ومطابقة أذونات الاستلام لقسم التراخيص (المهندس أحمد)',
                'permissions' => [
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
                ],
            ],
            'buffet_accountant' => [
                'name' => 'Buffet Accountant',
                'description' => 'حسابات - تسجيل فواتير الموردين ومطابقة أذونات الاستلام للمكتبيات والبوفيه (المهندسة شروق)',
                'permissions' => [
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
                ],
            ],
            'general_accountant' => [
                'name' => 'General Accountant',
                'description' => 'المحاسب العام - تسجيل الفواتير والمطابقة المالية والاطلاع الشامل على كافة أقسام الشركة (المهندسة حبيبة)',
                'permissions' => [
                    'accounting.invoice.view',
                    'accounting.invoice.create',
                    'accounting.invoice.match',
                    'accounting.payment.create',
                    'supplier.account.view',
                    'purchase_order.view',
                    'purchase_order.view_accounting',
                    'purchase_request.create',
                    'purchase_request.view_own',
                    'purchase_request.edit_own',
                    'purchase_request.submit',
                    'purchase_request.accounting_view',
                    'purchase_request.accounting_approve',
                    'purchase_request.accounting_reject',
                ],
            ],
            'general_manager' => [
                'name' => 'General Manager',
                'description' => 'Executive decision maker for purchase requests and viewer of issued purchase orders',
                'permissions' => [
                    'purchase_request.view_gm',
                    'purchase_quote.view',
                    'purchase_quote.decide',
                    'purchase_request.edit_gm',
                    'purchase_request.approve_gm',
                    'purchase_request.reject_gm',
                    'purchase_order.view_gm',
                ],
            ],
            'execution_manager' => [
                'name' => 'Execution Projects Manager',
                'description' => 'مدير مشروعات التنفيذ - اعتماد ومتابعة طلبات وأوامر الشراء للموظفين التابعين له',
                'permissions' => [
                    'purchase_request.view_gm',
                    'purchase_quote.view',
                    'purchase_quote.decide',
                    'purchase_request.edit_gm',
                    'purchase_request.approve_gm',
                    'purchase_request.reject_gm',
                    'purchase_order.view_gm',
                ],
            ],
            'admin' => [
                'name' => 'Admin',
                'description' => 'System administrator',
                'permissions' => array_keys($permissions),
            ],
        ];

        $requestCreatorRoles = ['reviewer', 'site_engineer', 'warehouse_keeper', 'procurement_manager', 'accountant', 'general_manager', 'execution_manager', 'site_accountant', 'licenses_accountant', 'buffet_accountant', 'general_accountant'];
        $requestCreatorPermissions = ['purchase_request.create', 'purchase_request.view_own', 'purchase_request.edit_own', 'purchase_request.submit'];
        $receiptPermissions = ['purchase_receipt.view_assigned', 'purchase_receipt.edit', 'purchase_receipt.approve'];

        foreach ($rolesMatrix as $slug => $definition) {
            $permissionsToSync = $definition['permissions'];
            if (in_array($slug, $requestCreatorRoles, true)) {
                $permissionsToSync = array_values(array_unique(array_merge($permissionsToSync, $requestCreatorPermissions)));
            }
            $permissionsToSync = array_values(array_unique(array_merge($permissionsToSync, $receiptPermissions)));

            $role = Role::updateOrCreate(
                ['slug' => $slug],
                [
                    'name' => $definition['name'],
                    'description' => $definition['description'],
                ]
            );

            $permissionIds = collect($permissionsToSync)
                ->map(fn (string $permissionSlug) => $createdPermissions[$permissionSlug]->id ?? null)
                ->filter()
                ->values()
                ->all();

            $role->permissions()->sync($permissionIds);
        }
    }
}
