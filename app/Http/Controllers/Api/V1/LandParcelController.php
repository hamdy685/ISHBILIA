<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LandParcel;
use App\Services\LandParcelService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LandParcelController extends Controller
{
    public function __construct(protected LandParcelService $service) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->service->list((int) $request->integer('limit', 200)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'parcel_reference' => ['required', 'string', 'max:100'],
            'region' => ['required', 'string', 'max:150'],
            'opening_balance' => ['nullable', 'numeric', 'gte:0'],
            'transaction_date' => ['nullable', 'date'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        return response()->json([
            'data' => $this->service->createParcel($request->user(), $validated),
            'message' => 'تم إنشاء حساب قطعة الأرض وتسجيل الرصيد الافتتاحي بنجاح.',
        ], 201);
    }

    public function show(LandParcel $landParcel): JsonResponse
    {
        return response()->json(['data' => $this->service->getParcelAccount($landParcel)]);
    }

    public function fund(Request $request, LandParcel $landParcel): JsonResponse
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'gt:0'],
            'transaction_date' => ['nullable', 'date'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        return response()->json([
            'data' => $this->service->addCustomerFunding(
                $request->user(),
                $landParcel,
                (float) $validated['amount'],
                $validated['transaction_date'] ?? null,
                $validated['reference_number'] ?? null,
                $validated['notes'] ?? null,
            ),
            'message' => 'تم تسجيل تمويل العميل وإضافة المبلغ إلى رصيد قطعة الأرض.',
        ], 201);
    }

    public function destroy(LandParcel $landParcel): JsonResponse
    {
        $this->service->deleteParcel($landParcel);
        return response()->json([
            'message' => 'تم حذف قطعة الأرض بنجاح.',
        ]);
    }

    public function wipeAll(): JsonResponse
    {
        $count = $this->service->wipeAllParcels();
        return response()->json([
            'message' => "تم حذف كافة قطع الأراضي ({$count} قطعة) من السيستم بنجاح.",
            'deleted_count' => $count,
        ]);
    }
}

