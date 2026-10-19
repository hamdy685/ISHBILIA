<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $viewPath = storage_path('framework/views');
        if (! is_dir($viewPath)) {
            @mkdir($viewPath, 0777, true);
        }
        $sessionPath = storage_path('framework/sessions');
        if (! is_dir($sessionPath)) {
            @mkdir($sessionPath, 0777, true);
        }
        \Illuminate\Support\Facades\Gate::policy(
            \App\Models\PurchaseRequestItem::class,
            \App\Policies\PurchaseRequestItemPolicy::class
        );
        \Illuminate\Support\Facades\Gate::policy(
            \App\Models\SupplierInvoice::class,
            \App\Policies\SupplierInvoicePolicy::class
        );
    }
}
