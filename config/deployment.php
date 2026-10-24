<?php

return [
    // Values injected by Railway, Render, or fallback to sensible production build defaults
    'version' => env('APP_VERSION', 'v2.1.0'),
    'commit' => env('APP_COMMIT', env('RAILWAY_GIT_COMMIT_SHA', env('RENDER_GIT_COMMIT', '86635704'))),
    'deployed_at' => env('APP_DEPLOYED_AT', '2026-10-24'),
];

