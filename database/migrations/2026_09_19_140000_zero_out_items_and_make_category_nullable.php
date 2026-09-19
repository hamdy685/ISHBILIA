<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Zeroes out items and categories, and makes category_id on items nullable.
     */
    public function up(): void
    {
        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            DB::statement('SET FOREIGN_KEY_CHECKS=0;');
        } elseif ($driver === 'sqlite') {
            DB::statement('PRAGMA foreign_keys = OFF;');
        }

        try {
            Schema::disableForeignKeyConstraints();
        } catch (\Throwable $e) {}

        try {
            // 1. Zero out existing items and categories
            if (Schema::hasTable('items')) {
                DB::table('items')->delete();
            }
            if (Schema::hasTable('categories')) {
                DB::table('categories')->delete();
            }

            // 2. Make category_id nullable on items table
            if (Schema::hasTable('items') && Schema::hasColumn('items', 'category_id')) {
                Schema::table('items', function (Blueprint $table) {
                    $table->foreignId('category_id')->nullable()->change();
                });
            }

            Cache::forget('catalog.active.v2');
        } catch (\Throwable $e) {
            logger()->error('Error in zero_out_items migration: ' . $e->getMessage());
            throw $e;
        } finally {
            try {
                Schema::enableForeignKeyConstraints();
            } catch (\Throwable $e) {}

            if ($driver === 'mysql') {
                DB::statement('SET FOREIGN_KEY_CHECKS=1;');
            } elseif ($driver === 'sqlite') {
                DB::statement('PRAGMA foreign_keys = ON;');
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        //
    }
};
