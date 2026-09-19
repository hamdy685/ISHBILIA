<?php

use App\Http\Controllers\Api\V1\PurchaseQuoteController;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Response;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes & SPA Fallback for Single Page Application
|--------------------------------------------------------------------------
|
| Any web request that is not handled by the API will serve the compiled
| SPA index.html so direct URL reloads and client routes work on Hostinger.
|
*/

Route::get('/storage/quotes/{filename}', [PurchaseQuoteController::class, 'viewFileByName']);
Route::get('/purchase-quotes/{id}/file', [PurchaseQuoteController::class, 'viewFile']);
Route::middleware('auth:sanctum')->get('/api/items/suggestions', [\App\Http\Controllers\Api\V1\CatalogItemController::class, 'suggestions']);

Route::get('/{any}', function () {
    // Check if dist/index.html or public/index.html exists
    $spaPath = public_path('index.html');
    if (! File::exists($spaPath)) {
        $spaPath = base_path('dist/index.html');
    }

    if (File::exists($spaPath)) {
        return Response::file($spaPath, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma' => 'no-cache',
            'Expires' => '0',
        ]);
    }

    return view('welcome');
})->where('any', '^(?!api/).*$');
