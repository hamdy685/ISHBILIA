<?php

return [
    'enabled' => (bool) env('GOOGLE_DRIVE_ENABLED', true),
    'client_id' => env('GOOGLE_DRIVE_CLIENT_ID'),
    'client_secret' => env('GOOGLE_DRIVE_CLIENT_SECRET'),
    'refresh_token' => env('GOOGLE_DRIVE_REFRESH_TOKEN'),
    'folder_id' => env('GOOGLE_DRIVE_RECEIPTS_FOLDER_ID', env('GOOGLE_DRIVE_FOLDER_ID', '1EB9h3hue3aPM_zlx_AbRBydPZP3nnPDU')),
    'invoices_folder_id' => env('GOOGLE_DRIVE_INVOICES_FOLDER_ID', '1OPejUvtGzsvs8vxXjEET47EUvgnF_O4F'),
    'quotes_folder_id' => env('GOOGLE_DRIVE_QUOTES_FOLDER_ID', '1osldpISMDMMxYsggcwSQm6viRO46TNui'),
];
