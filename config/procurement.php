<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Default Department Reviewer Emails (Fallback)
    |--------------------------------------------------------------------------
    |
    | Used as a fallback when a department does not have an explicitly assigned
    | manager_user_id or active reviewer assigned in the database.
    |
    */
    'default_department_reviewers' => [
        'EXECUTION' => env('REVIEWER_EMAIL_EXECUTION', 'ayman@gmail.com'),
        'BUILDINGS' => env('REVIEWER_EMAIL_BUILDINGS', 'hatem@gmail.com'),
        'FINISHING' => env('REVIEWER_EMAIL_FINISHING', 'kheshen@gmail.com'),
        'LICENSES' => env('REVIEWER_EMAIL_LICENSES', 'mostafa@gmail.com'),
        'BUFFET' => env('REVIEWER_EMAIL_BUFFET', 'amr@gmail.com'),
    ],
];
