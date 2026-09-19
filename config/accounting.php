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
];
