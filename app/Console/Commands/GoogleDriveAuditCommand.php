<?php

namespace App\Console\Commands;

use App\Models\PurchaseOrder;
use App\Models\PurchaseReceipt;
use App\Services\GoogleDriveService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class GoogleDriveAuditCommand extends Command
{
    protected $signature = 'drive:audit';
    protected $description = 'Audit Google Drive attachments and identify healthy vs orphaned legacy files';

    public function handle(): int
    {
        $this->info('====================================================');
        $this->info('GOOGLE DRIVE & PROCUREMENT ATTACHMENTS AUDIT');
        $this->info('====================================================');

        // 1. Connection check
        $this->line("\n1. Testing Google Drive Connection & Folders...");
        $test = GoogleDriveService::testConnection();
        if ($test['success']) {
            $this->info("   [SUCCESS] Connected to Google Drive!");
            $this->line("   Root Folder ID:       {$test['folder_id']}");
            $this->line("   Root Folder Name:     {$test['folder_name']}");
            $this->line("   Receipts Folder ID:   " . GoogleDriveService::receiptsFolderId() . " (أذونات استلام إشبيليا)");
            $this->line("   Invoices Folder ID:   " . GoogleDriveService::invoicesFolderId() . " (فواتير)");
            $this->line("   Quotes Folder ID:     " . GoogleDriveService::quotesFolderId() . " (عروض أسعار)");
        } else {
            $this->warn("   [NOT CONNECTED / NEED TOKEN]: " . ($test['error'] ?? 'Unknown'));
        }

        // 2. Audit Purchase Receipts
        $this->line("\n2. Auditing Purchase Receipts Attachments (أذونات استلام إشبيليا)...");
        $receipts = PurchaseReceipt::all();
        $totalReceipts = $receipts->count();
        $driveReceipts = 0;
        $localExisting = 0;
        $orphanedMissing = 0;
        $noPhoto = 0;

        $orphanedList = [];

        foreach ($receipts as $r) {
            $path = $r->photo_path;
            if (! $path) {
                $noPhoto++;
                continue;
            }

            if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://') || $r->photo_drive_id) {
                $driveReceipts++;
            } else {
                $exists = Storage::disk('public')->exists($path) || file_exists(storage_path('app/public/' . $path));
                if ($exists) {
                    $localExisting++;
                } else {
                    $orphanedMissing++;
                    $orphanedList[] = [
                        'id' => $r->id,
                        'receipt_number' => $r->receipt_number,
                        'po_number' => $r->purchaseOrder?->po_number ?? '—',
                        'photo_path' => $path,
                        'created_at' => $r->created_at?->toDateString() ?? '—',
                    ];
                }
            }
        }

        $this->line("   Total Receipts in DB:           {$totalReceipts}");
        $this->line("   With Google Drive / Cloud Link: {$driveReceipts}");
        $this->line("   Local Files Still on Disk:      {$localExisting}");
        $this->line("   Orphaned / Missing from Disk:   {$orphanedMissing}");
        $this->line("   Receipts Without Photos:        {$noPhoto}");

        if (! empty($orphanedList)) {
            $this->warn("\n   Missing Legacy Receipt Files (lost in previous container redeployments before Google Drive fix):");
            $this->table(
                ['ID', 'Receipt #', 'PO #', 'Missing Local Path', 'Created Date'],
                array_slice($orphanedList, 0, 15)
            );
        }

        // 3. Audit Purchase Orders Invoices
        $this->line("\n3. Auditing Purchase Orders Invoices (فواتير)...");
        $pos = PurchaseOrder::whereNotNull('invoice_photo_path')->get();
        $totalInvoices = $pos->count();
        $driveInvoices = 0;
        $localInvoices = 0;
        $missingInvoices = 0;

        foreach ($pos as $po) {
            $invPath = $po->invoice_photo_path;
            if (str_starts_with($invPath, 'http://') || str_starts_with($invPath, 'https://') || $po->invoice_photo_drive_id) {
                $driveInvoices++;
            } else {
                $exists = Storage::disk('public')->exists($invPath) || file_exists(storage_path('app/public/' . $invPath));
                if ($exists) {
                    $localInvoices++;
                } else {
                    $missingInvoices++;
                }
            }
        }

        $this->line("   Total POs with Invoices:        {$totalInvoices}");
        $this->line("   With Google Drive / Cloud Link: {$driveInvoices}");
        $this->line("   Local Invoices on Disk:         {$localInvoices}");
        $this->line("   Orphaned / Missing Invoices:    {$missingInvoices}");

        // 4. Audit Purchase Request Quotes
        $this->line("\n4. Auditing Purchase Request Quotes (عروض أسعار)...");
        $quotes = \App\Models\PurchaseRequestQuote::whereNotNull('file_path')->get();
        $totalQuotes = $quotes->count();
        $driveQuotes = 0;
        $localQuotes = 0;
        $missingQuotes = 0;

        foreach ($quotes as $q) {
            $qPath = $q->file_path;
            if (str_starts_with($qPath, 'http://') || str_starts_with($qPath, 'https://') || $q->file_drive_id) {
                $driveQuotes++;
            } else {
                $exists = Storage::disk('public')->exists($qPath) || file_exists(storage_path('app/public/' . $qPath));
                if ($exists) {
                    $localQuotes++;
                } else {
                    $missingQuotes++;
                }
            }
        }

        $this->line("   Total Quotes with Files:        {$totalQuotes}");
        $this->line("   With Google Drive / Cloud Link: {$driveQuotes}");
        $this->line("   Local Quotes on Disk:           {$localQuotes}");
        $this->line("   Orphaned / Missing Quotes:      {$missingQuotes}");

        $this->info("\nAudit complete.");
        return 0;
    }
}
