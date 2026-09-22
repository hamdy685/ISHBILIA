<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Contractor Invoices Account Mappings
    |--------------------------------------------------------------------------
    |
    | Default account codes for automated journal entries generated when a
    | contractor invoice is approved. These can be overridden via .env
    | or changed in runtime configuration.
    |
    */
    'contractor_expense_account_code' => env('ACCOUNTING_CONTRACTOR_EXPENSE_CODE', '512'),
    'contractor_payable_account_code' => env('ACCOUNTING_CONTRACTOR_PAYABLE_CODE', '2113'),

    /*
    |--------------------------------------------------------------------------
    | Petty Cash Settlements Account Mappings
    |--------------------------------------------------------------------------
    |
    | Default account codes for automated journal entries generated when a
    | petty cash settlement is approved.
    | - Expense: project direct / operational expense (code 513)
    | - Asset / Custody: petty cash custody account (code 112)
    |
    */
    'petty_cash_expense_account_code' => env('ACCOUNTING_PETTY_CASH_EXPENSE_CODE', '513'),
    'petty_cash_asset_account_code' => env('ACCOUNTING_PETTY_CASH_ASSET_CODE', '112'),

    /*
    |--------------------------------------------------------------------------
    | Procurement & Supplier Invoices Account Mappings
    |--------------------------------------------------------------------------
    |
    | Default account codes for automated journal entries generated when a
    | supplier invoice is matched / approved, and when supplier payments are recorded.
    | - Material Expense: direct construction materials (code 511)
    | - Supplier Payable: trade creditors / suppliers (code 2111)
    | - Bank Account: active commercial bank account (code 1112)
    | - Treasury Cash: main cash custody / treasury (code 1111)
    |
    */
    'material_expense_account_code' => env('ACCOUNTING_MATERIAL_EXPENSE_CODE', '511'),
    'supplier_payable_account_code' => env('ACCOUNTING_SUPPLIER_PAYABLE_CODE', '2111'),
    'bank_account_code' => env('ACCOUNTING_BANK_ACCOUNT_CODE', '1112'),
    'treasury_cash_account_code' => env('ACCOUNTING_TREASURY_CASH_CODE', '1111'),
    'default_cost_center_code' => env('ACCOUNTING_DEFAULT_COST_CENTER_CODE', 'CC-101'),
];

