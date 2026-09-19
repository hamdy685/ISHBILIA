<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\PurchaseRequestItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class CatalogItemController extends Controller
{
    /**
     * Get autocomplete suggestions for item names.
     */
    public function suggestions(Request $request): JsonResponse
    {
        $query = trim((string) $request->input('query', ''));

        // 1. Suggestions from master items table
        $itemBuilder = Item::query()->where('is_active', true);
        if ($query !== '') {
            $itemBuilder->where('name', 'LIKE', "%{$query}%");
        }
        $masterItems = $itemBuilder->orderBy('name', 'asc')->limit(15)->pluck('name');

        // 2. Suggestions from historical purchase request items
        $prItemBuilder = PurchaseRequestItem::query();
        if ($query !== '') {
            $prItemBuilder->where('item_description', 'LIKE', "%{$query}%");
        }
        $historicalItems = $prItemBuilder->select('item_description')
            ->whereNotNull('item_description')
            ->where('item_description', '!=', '')
            ->distinct()
            ->limit(15)
            ->pluck('item_description');

        // 3. Merge, deduplicate (case/space insensitive), limit to 10
        $suggestions = collect()
            ->concat($masterItems)
            ->concat($historicalItems)
            ->map(fn ($item) => trim((string) $item))
            ->filter(fn ($item) => $item !== '')
            ->unique(fn ($item) => mb_strtolower($item))
            ->take(10)
            ->values();

        return response()->json($suggestions);
    }

    /**
     * Get list of active catalog items for purchase request creation.
     */
    public function index(): JsonResponse
    {
        $items = Cache::remember('catalog.active.v2', now()->addMinutes(10), function () {
            return Item::query()
                ->with('category:id,name')
                                ->select(['id', 'category_id', 'sku', 'name', 'uom', 'description'])

                ->where('is_active', true)
                ->orderBy('name', 'asc')
                ->get()
                ->map(function ($item) {
                    return [
                        'id' => $item->id,
                        'sku' => $item->sku,
                        'name' => $item->name,
                        'uom' => $item->uom,
                        'description' => $item->description,
                        
                        'category' => $item->category ? [
                            'id' => $item->category->id,
                            'name' => $item->category->name,
                        ] : null,
                    ];
                });
        });

        return response()->json(['data' => $items]);
    }
}
