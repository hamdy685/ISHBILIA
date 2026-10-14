<?php

return [
    'enabled' => (bool) env('GOOGLE_DRIVE_ENABLED', true),
    'client_id' => env('GOOGLE_DRIVE_CLIENT_ID'),
    'client_secret' => env('GOOGLE_DRIVE_CLIENT_SECRET'),
    'refresh_token' => env('GOOGLE_DRIVE_REFRESH_TOKEN'),
    'folder_id' => env('GOOGLE_DRIVE_RECEIPTS_FOLDER_ID', env('GOOGLE_DRIVE_FOLDER_ID', '1ZdrP3K-NqU4uIs5GL3JD7biz7rDpSIdX')),
];
