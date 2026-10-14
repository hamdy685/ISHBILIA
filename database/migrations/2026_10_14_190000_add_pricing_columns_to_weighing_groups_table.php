<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('weighing_groups')) {
            Schema::table('weighing_groups', function (Blueprint $table) {
                if (! Schema::hasColumn('weighing_groups', 'unit_price')) {
                    $table->decimal('unit_price', 15, 2)->default(0)->after('uom');
                }
                if (! Schema::hasColumn('weighing_groups', 'total_amount')) {
                    $table->decimal('total_amount', 15, 2)->default(0)->after('unit_price');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('weighing_groups')) {
            Schema::table('weighing_groups', function (Blueprint $table) {
                if (Schema::hasColumn('weighing_groups', 'total_amount')) {
                    $table->dropColumn('total_amount');
                }
                if (Schema::hasColumn('weighing_groups', 'unit_price')) {
                    $table->dropColumn('unit_price');
                }
            });
        }
    }
};
