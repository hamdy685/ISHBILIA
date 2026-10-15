<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Dedicated Admin Audit Logs (Immutable, sovereign audit record for all admin interventions)
        if (! Schema::hasTable('admin_audit_logs')) {
            Schema::create('admin_audit_logs', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('actor_user_id')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete();
                $table->string('actor_name', 120)->nullable();
                $table->string('actor_role', 60)->nullable();
                $table->string('action', 80)->index('idx_admin_audit_action');
                $table->string('entity_type', 80)->index('idx_admin_audit_entity_type');
                $table->unsignedBigInteger('entity_id')->nullable()->index('idx_admin_audit_entity_id');
                $table->string('entity_label', 150)->nullable();
                $table->string('from_status', 60)->nullable();
                $table->string('to_status', 60)->nullable();
                $table->text('reason')->nullable();
                $table->json('old_values')->nullable();
                $table->json('new_values')->nullable();
                $table->json('metadata')->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->string('user_agent', 255)->nullable();
                $table->boolean('is_exceptional')->default(false);
                $table->timestamp('created_at')->useCurrent()->index('idx_admin_audit_created_at');

                $table->index(['entity_type', 'entity_id', 'created_at'], 'idx_admin_audit_composite');
            });
        }

        // 2. Workflow Transitions Matrix
        if (! Schema::hasTable('workflow_transitions')) {
            Schema::create('workflow_transitions', function (Blueprint $table): void {
                $table->id();
                $table->string('entity_type', 60)->index();
                $table->string('from_status', 60)->index();
                $table->string('to_status', 60)->index();
                $table->boolean('is_allowed')->default(true);
                $table->boolean('requires_exception')->default(false);
                $table->string('description', 255)->nullable();
                $table->timestamps();

                $table->unique(['entity_type', 'from_status', 'to_status'], 'uniq_workflow_transition');
            });

            // Seed standard transitions
            $this->seedStandardTransitions();
        }

        // 3. Document Multi-User Assignments (Primary / Parallel / View-Only)
        if (! Schema::hasTable('workflow_document_assignments')) {
            Schema::create('workflow_document_assignments', function (Blueprint $table): void {
                $table->id();
                $table->string('entity_type', 60);
                $table->unsignedBigInteger('entity_id');
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('assignment_type', 40)->default('VIEW_ONLY_USER'); // PRIMARY_ACTION_OWNER, PARALLEL_ACTION_OWNER, VIEW_ONLY_USER
                $table->foreignId('assigned_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('notes', 255)->nullable();
                $table->timestamps();

                $table->unique(['entity_type', 'entity_id', 'user_id', 'assignment_type'], 'uniq_doc_user_assignment');
                $table->index(['entity_type', 'entity_id'], 'idx_doc_assignments_lookup');
                $table->index(['user_id', 'assignment_type'], 'idx_user_assignment_type');
            });
        }
    }

    private function seedStandardTransitions(): void
    {
        $now = now();
        $transitions = [
            // --- Purchase Requests ---
            ['PURCHASE_REQUEST', 'DRAFT', 'PENDING_REVIEW', true, false, 'إرسال المسودة للمراجعة'],
            ['PURCHASE_REQUEST', 'PENDING_REVIEW', 'REVIEWER_APPROVED', true, false, 'اعتماد المراجع'],
            ['PURCHASE_REQUEST', 'PENDING_REVIEW', 'RETURNED', true, false, 'إرجاع الطلب للموظف للتعديل'],
            ['PURCHASE_REQUEST', 'PENDING_REVIEW', 'REJECTED', true, false, 'رفض الطلب من المراجع'],
            ['PURCHASE_REQUEST', 'PENDING_REVIEW', 'DRAFT', true, false, 'إعادة للمسودة'],
            ['PURCHASE_REQUEST', 'RETURNED', 'PENDING_REVIEW', true, false, 'إعادة التقديم بعد التعديل'],
            ['PURCHASE_REQUEST', 'REVIEWER_APPROVED', 'PENDING_EXECUTIVE', true, false, 'التحويل للمدير التنفيذي'],
            ['PURCHASE_REQUEST', 'PENDING_EXECUTIVE', 'APPROVED_BY_EXECUTIVE', true, false, 'اعتماد المدير التنفيذي'],
            ['PURCHASE_REQUEST', 'PENDING_EXECUTIVE', 'PENDING_REVIEW', true, false, 'إرجاع للمراجع'],
            ['PURCHASE_REQUEST', 'PENDING_EXECUTIVE', 'REJECTED', true, false, 'رفض من المدير التنفيذي'],
            ['PURCHASE_REQUEST', 'APPROVED_BY_EXECUTIVE', 'PENDING_PROCUREMENT_APPROVAL', true, false, 'التحويل للمشتريات'],
            ['PURCHASE_REQUEST', 'PENDING_PROCUREMENT_APPROVAL', 'APPROVED_BY_PROCUREMENT', true, false, 'اعتماد المشتريات وتجهيز أمر الشراء'],
            ['PURCHASE_REQUEST', 'PENDING_PROCUREMENT_APPROVAL', 'PENDING_EXECUTIVE', true, false, 'إرجاع للمدير التنفيذي'],
            ['PURCHASE_REQUEST', 'APPROVED_BY_PROCUREMENT', 'APPROVED_BY_ACCOUNTING', true, false, 'اعتماد الحسابات للطلب'],
            ['PURCHASE_REQUEST', 'APPROVED_BY_ACCOUNTING', 'PENDING_PROCUREMENT_APPROVAL', false, true, 'إرجاع استثنائي بعد اعتماد الحسابات'],
            ['PURCHASE_REQUEST', 'DRAFT', 'CANCELLED', true, false, 'إلغاء مسودة'],
            ['PURCHASE_REQUEST', 'PENDING_REVIEW', 'CANCELLED', true, false, 'إلغاء في مرحلة المراجعة'],
            ['PURCHASE_REQUEST', 'PENDING_EXECUTIVE', 'CANCELLED', true, false, 'إلغاء في مرحلة التنفيذي'],
            ['PURCHASE_REQUEST', 'PENDING_PROCUREMENT_APPROVAL', 'CANCELLED', true, false, 'إلغاء في مرحلة المشتريات'],

            // --- Purchase Orders ---
            ['PURCHASE_ORDER', 'PO_DRAFT', 'ISSUED', true, false, 'إصدار أمر الشراء'],
            ['PURCHASE_ORDER', 'ISSUED', 'PENDING_ACCOUNTING_REVIEW', true, false, 'تحويل أمر الشراء لمراجعة الحسابات'],
            ['PURCHASE_ORDER', 'PENDING_ACCOUNTING_REVIEW', 'APPROVED_BY_ACCOUNTING', true, false, 'اعتماد الحسابات لأمر الشراء'],
            ['PURCHASE_ORDER', 'PENDING_ACCOUNTING_REVIEW', 'RETURNED_TO_PROCUREMENT', true, false, 'إرجاع أمر الشراء للمشتريات'],
            ['PURCHASE_ORDER', 'RETURNED_TO_PROCUREMENT', 'PENDING_ACCOUNTING_REVIEW', true, false, 'إعادة التقديم للحسابات'],
            ['PURCHASE_ORDER', 'APPROVED_BY_ACCOUNTING', 'FINAL_APPROVED', true, false, 'الاعتماد النهائي'],
            ['PURCHASE_ORDER', 'ISSUED', 'CANCELLED', true, false, 'إلغاء أمر شراء صادر غير مستلم'],
            ['PURCHASE_ORDER', 'ISSUED', 'VOIDED', true, false, 'إبطال أمر شراء بديل أو مكرر'],
            ['PURCHASE_ORDER', 'PENDING_ACCOUNTING_REVIEW', 'CANCELLED', true, false, 'إلغاء أمر الشراء قبل اعتماد الحسابات'],
            ['PURCHASE_ORDER', 'APPROVED_BY_ACCOUNTING', 'ISSUED', false, true, 'إرجاع استثنائي لأمر شراء معتمد حسابياً'],
            ['PURCHASE_ORDER', 'FINAL_APPROVED', 'PENDING_ACCOUNTING_REVIEW', false, true, 'إرجاع استثنائي لأمر شراء معتمد نهائياً'],

            // --- Purchase Receipts ---
            ['PURCHASE_RECEIPT', 'DRAFT', 'WAREHOUSE_RECEIPT_SUBMITTED', true, false, 'تسجيل استلام المخزن المبدئي'],
            ['PURCHASE_RECEIPT', 'WAREHOUSE_RECEIPT_SUBMITTED', 'PENDING_SITE_ENGINEER', true, false, 'التحويل لمهندس الموقع للفحص والاعتماد'],
            ['PURCHASE_RECEIPT', 'PENDING_SITE_ENGINEER', 'APPROVED', true, false, 'اعتماد مهندس الموقع النهائي للاستلام'],
            ['PURCHASE_RECEIPT', 'PENDING_SITE_ENGINEER', 'REJECTED', true, false, 'رفض الاستلام من مهندس الموقع'],
            ['PURCHASE_RECEIPT', 'PENDING_SITE_ENGINEER', 'WAREHOUSE_RECEIPT_SUBMITTED', true, false, 'إرجاع إذن الاستلام لأمين المخزن للتصحيح'],
            ['PURCHASE_RECEIPT', 'APPROVED', 'PENDING_SITE_ENGINEER', false, true, 'إرجاع استثنائي لإذن استلام معتمد'],
            ['PURCHASE_RECEIPT', 'WAREHOUSE_RECEIPT_SUBMITTED', 'CANCELLED', true, false, 'إلغاء إذن استلام لم يتم اعتماده'],
            ['PURCHASE_RECEIPT', 'PENDING_SITE_ENGINEER', 'CANCELLED', true, false, 'إلغاء إذن استلام معلق'],
        ];

        $insertData = [];
        foreach ($transitions as $t) {
            $insertData[] = [
                'entity_type' => $t[0],
                'from_status' => $t[1],
                'to_status' => $t[2],
                'is_allowed' => $t[3],
                'requires_exception' => $t[4],
                'description' => $t[5],
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        DB::table('workflow_transitions')->insertOrIgnore($insertData);
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_document_assignments');
        Schema::dropIfExists('workflow_transitions');
        Schema::dropIfExists('admin_audit_logs');
    }
};
