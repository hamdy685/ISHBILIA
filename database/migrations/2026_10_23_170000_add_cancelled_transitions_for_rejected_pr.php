<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('workflow_transitions')) {
            $now = now();
            DB::table('workflow_transitions')->insertOrIgnore([
                [
                    'entity_type' => 'PURCHASE_REQUEST',
                    'from_status' => 'REJECTED',
                    'to_status' => 'CANCELLED',
                    'is_allowed' => true,
                    'requires_exception' => false,
                    'description' => 'إلغاء طلب الشراء المرفوض نهائياً من قبل مقدم الطلب',
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
                [
                    'entity_type' => 'PURCHASE_REQUEST',
                    'from_status' => 'RETURNED',
                    'to_status' => 'CANCELLED',
                    'is_allowed' => true,
                    'requires_exception' => false,
                    'description' => 'إلغاء طلب الشراء المعاد للتعديل من قبل مقدم الطلب',
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
            ]);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('workflow_transitions')) {
            DB::table('workflow_transitions')
                ->where('entity_type', 'PURCHASE_REQUEST')
                ->where('to_status', 'CANCELLED')
                ->whereIn('from_status', ['REJECTED', 'RETURNED'])
                ->delete();
        }
    }
};
