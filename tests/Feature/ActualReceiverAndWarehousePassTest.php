<?php

namespace Tests\Feature;

use App\Models\PurchaseReceipt;
use Tests\TestCase;

class ActualReceiverAndWarehousePassTest extends TestCase
{
    public function test_actual_receiver_and_warehouse_keeper_pass_logic(): void
    {
        // 1. Existing receipt without actual receiver displays null and PASSED correctly
        $receipt = new PurchaseReceipt([
            'warehouse_keeper_user_id' => 5,
            'warehouse_submitted_at' => now(),
        ]);
        $this->assertEquals('PASSED', $receipt->warehouse_keeper_pass_status);
        $this->assertEquals('مر على إذن الاستلام', $receipt->warehouse_keeper_pass_label);
        $this->assertNull($receipt->actual_receiver_name);
        $this->assertNull($receipt->actual_receiver_display_name);

        // 2. Direct site receipt without warehouse keeper has BYPASSED
        $directReceipt = new PurchaseReceipt([
            'receipt_type' => 'SITE_DIRECT',
            'warehouse_keeper_user_id' => null,
            'receipt_number' => 'REC-SITE-001',
        ]);
        $this->assertEquals('BYPASSED', $directReceipt->warehouse_keeper_pass_status);
        $this->assertEquals('لم يمر على إذن الاستلام', $directReceipt->warehouse_keeper_pass_label);

        // 3. Receipt with explicit actual_receiver_name
        $receiptWithReceiver = new PurchaseReceipt([
            'warehouse_keeper_user_id' => 5,
            'warehouse_submitted_at' => now(),
            'actual_receiver_name' => 'م. أيمن ماهر',
        ]);
        $this->assertEquals('PASSED', $receiptWithReceiver->warehouse_keeper_pass_status);
        $this->assertEquals('مر على إذن الاستلام', $receiptWithReceiver->warehouse_keeper_pass_label);
        $this->assertEquals('م. أيمن ماهر', $receiptWithReceiver->actual_receiver_name);
        $this->assertEquals('م. أيمن ماهر', $receiptWithReceiver->actual_receiver_display_name);
    }
}
