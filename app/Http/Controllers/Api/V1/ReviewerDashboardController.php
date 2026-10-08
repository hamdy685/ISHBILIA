<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReviewerDashboardController extends Controller
{
    public function __construct(
        protected DashboardPendingTasksController $pendingTasksController
    ) {}

    /**
     * Get pending tasks and actionable items for the Reviewer / Department Head.
     */
    public function index(Request $request): JsonResponse
    {
        return $this->pendingTasksController->index($request);
    }

    /**
     * Alias for pending tasks endpoint.
     */
    public function pendingTasks(Request $request): JsonResponse
    {
        return $this->pendingTasksController->index($request);
    }
}
