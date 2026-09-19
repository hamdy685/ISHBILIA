import React from "react";
import { Routes, Route } from "react-router-dom";
import AuthenticatedLayout from "../layouts/AuthenticatedLayout";
import LoginPage from "../pages/LoginPage";
import ProtectedPage from "../pages/ProtectedPage";
const EmployeeDashboardPage = React.lazy(() => import("../pages/employee/EmployeeDashboardPage"));
const PurchaseRequestsPage = React.lazy(() => import("../pages/employee/PurchaseRequestsPage"));
const CreatePurchaseRequestPage = React.lazy(() => import("../pages/employee/CreatePurchaseRequestPage"));
const FavoriteRequestsPage = React.lazy(() => import("../pages/employee/FavoriteRequestsPage"));
const EditPurchaseRequestPage = React.lazy(() => import("../pages/employee/EditPurchaseRequestPage"));
const PurchaseRequestDetailsPage = React.lazy(() => import("../pages/employee/PurchaseRequestDetailsPage"));
const SupplementaryRequestsPage = React.lazy(() => import("../pages/SupplementaryRequestsPage").then(m => ({ default: m.SupplementaryRequestsPage })));
const AdminSystemMonitoringPage = React.lazy(() => import("../pages/admin/AdminSystemMonitoringPage"));
import ProtectedRoute from "./ProtectedRoute";
import RoleRoute from "./RoleRoute";
const ReviewerDashboardPage = React.lazy(() => import("../pages/reviewer/ReviewerDashboardPage"));
const ReviewerRequestsPage = React.lazy(() => import("../pages/reviewer/ReviewerRequestsPage"));
const ReviewerPurchaseRequestDetailsPage = React.lazy(() => import("../pages/reviewer/ReviewerPurchaseRequestDetailsPage"));
const ReviewPurchaseRequestPage = React.lazy(() => import("../pages/reviewer/ReviewPurchaseRequestPage"));
const ApprovedPurchaseRequestsPage = React.lazy(() => import("../pages/procurement/ApprovedPurchaseRequestsPage"));
const CreatePurchaseOrderPage = React.lazy(() => import("../pages/procurement/CreatePurchaseOrderPage"));
const EditPurchaseOrderPage = React.lazy(() => import("../pages/procurement/EditPurchaseOrderPage"));
const PurchaseOrderDetailsPage = React.lazy(() => import("../pages/procurement/PurchaseOrderDetailsPage"));
const ProcurementManagerPage = React.lazy(() => import("../pages/procurement/ProcurementManagerPage"));
const ProcurementReportsPage = React.lazy(() => import("../pages/procurement/ProcurementReportsPage"));
const UniversalReportsPage = React.lazy(() => import("../pages/reports/UniversalReportsPage"));
const SiteAccountantDashboardPage = React.lazy(() => import("../pages/accounting/SiteAccountantDashboardPage"));
const AccountingDashboardPage = React.lazy(() => import("../pages/accounting/AccountingDashboardPage"));
const AccountingPurchaseOrdersPage = React.lazy(() => import("../pages/accounting/AccountingPurchaseOrdersPage"));
const AccountingPurchaseRequestsPage = React.lazy(() => import("../pages/accounting/AccountingPurchaseRequestsPage"));
const AccountingPurchaseOrderDetailsPage = React.lazy(() => import("../pages/accounting/AccountingPurchaseOrderDetailsPage"));
const GeneralManagerDashboardPage = React.lazy(() => import("../pages/general-manager/GeneralManagerDashboardPage"));
const GeneralManagerPurchaseRequestsPage = React.lazy(() => import("../pages/general-manager/GeneralManagerPurchaseRequestsPage"));
const GeneralManagerPurchaseOrdersPage = React.lazy(() => import("../pages/general-manager/GeneralManagerPurchaseOrdersPage"));
const GeneralManagerPurchaseOrderDetailsPage = React.lazy(() => import("../pages/general-manager/GeneralManagerPurchaseOrderDetailsPage"));
const GeneralManagerReportsPage = React.lazy(() => import("../pages/general-manager/GeneralManagerReportsPage"));
const PurchaseQuotesDecisionPage = React.lazy(() => import("../pages/purchase-quotes/PurchaseQuotesDecisionPage"));
const PurchaseReceiptPage = React.lazy(() => import("../pages/receipts/PurchaseReceiptPage"));
const SupplierPaymentsPage = React.lazy(() => import("../pages/accounting/SupplierPaymentsPage"));
const SupplierAccountsPage = React.lazy(() => import("../pages/accounting/SupplierAccountsPage"));
const SupplierFinanceWorkspacePage = React.lazy(() => import("../pages/accounting/SupplierFinanceWorkspacePage"));
const LandParcelsPage = React.lazy(() => import("../pages/accounting/LandParcelsPage"));
const ChartOfAccountsPage = React.lazy(() => import("../pages/accounting/ChartOfAccountsPage"));
const CostCentersPage = React.lazy(() => import("../pages/accounting/CostCentersPage"));
const ContractorInvoicesPage = React.lazy(() => import("../pages/accounting/ContractorInvoicesPage"));
const PettyCashPage = React.lazy(() => import("../pages/accounting/PettyCashPage"));
const ProjectCostsReportPage = React.lazy(() => import("../pages/accounting/ProjectCostsReportPage"));
const NotificationsPage = React.lazy(() => import("../pages/NotificationsPage"));
const RoleArchivePage = React.lazy(() => import("../pages/RoleArchivePage"));
const ProfilePage = React.lazy(() => import("../pages/ProfilePage"));
const UserPreferencesPage = React.lazy(() => import("../pages/UserPreferencesPage"));
const AdminDashboardPage = React.lazy(() => import("../pages/admin/AdminDashboardPage"));
const UsersPage = React.lazy(() => import("../pages/admin/UsersPage"));
const RolesPage = React.lazy(() => import("../pages/admin/RolesPage"));
const PermissionsPage = React.lazy(() => import("../pages/admin/PermissionsPage"));
const DepartmentsPage = React.lazy(() => import("../pages/admin/DepartmentsPage"));
const CategoriesPage = React.lazy(() => import("../pages/admin/CategoriesPage"));
const ItemsPage = React.lazy(() => import("../pages/admin/ItemsPage"));
const SuppliersPage = React.lazy(() => import("../pages/admin/SuppliersPage"));
const AdminRequestTrackerPage = React.lazy(() => import("../pages/admin/AdminRequestTrackerPage"));
const AdminRequestDetailsPage = React.lazy(() => import("../pages/admin/AdminRequestDetailsPage"));
import RoleHomeRedirect from "./RoleHomeRedirect";
import { ForbiddenPage, NotFoundPage, ServerErrorPage } from "../pages/ErrorPages";

export const AppRoutes: React.FC = () => {
    return (
        <React.Suspense fallback={
            <div className="min-h-[50vh] flex flex-col items-center justify-center p-8" dir="rtl">
                <div className="relative flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full border-2 border-gold-500/20 border-t-gold-400 animate-spin" />
                    <span className="absolute text-base select-none">🏢</span>
                </div>
                <p className="mt-4 text-xs font-black tracking-wider text-gold-300/90 animate-pulse">
                    جاري تحميل الصفحة...
                </p>
                <span className="text-[10px] text-slate-500 mt-1 font-mono">منظومة المشتريات التشغيلية</span>
            </div>
        }>
            <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected Routes wrapped in Authenticated Layout */}
            <Route
                element={
                    <ProtectedRoute>
                        <AuthenticatedLayout />
                    </ProtectedRoute>
                }
            >
                <Route path="/protected" element={<ProtectedPage />} />
                {/* Shared routes available to all authenticated users */}
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/my-archive" element={<RoleArchivePage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/preferences" element={<UserPreferencesPage />} />

                {/* ── Shared Purchase Request Routes for all operational roles ── */}
                <Route element={<RoleRoute allowedRoles={["employee", "reviewer", "warehouse_keeper", "site_engineer", "procurement_manager", "accountant", "site_accountant", "licenses_accountant", "buffet_accountant", "general_manager", "admin"]} />}>
                    <Route path="/requests" element={<PurchaseRequestsPage />} />
                    <Route path="/requests/create" element={<CreatePurchaseRequestPage />} />
                    <Route path="/requests/favorites" element={<FavoriteRequestsPage />} />
                    <Route path="/requests/supplements" element={<SupplementaryRequestsPage />} />
                    <Route path="/requests/:id" element={<PurchaseRequestDetailsPage />} />
                    <Route path="/requests/:id/edit" element={<EditPurchaseRequestPage />} />
                </Route>

                {/* ── Admin Routes ─────────────────────────────────────────── */}
                <Route element={<RoleRoute allowedRoles={["admin"]} />}>
                    <Route path="/admin" element={<AdminDashboardPage />} />
                    <Route path="/admin/request-tracker" element={<AdminRequestTrackerPage />} />
                    <Route path="/admin/request-tracker/:id" element={<AdminRequestDetailsPage />} />
                    <Route path="/admin/system-monitor" element={<AdminSystemMonitoringPage />} />
                    <Route path="/admin/users" element={<UsersPage />} />
                    <Route path="/admin/roles" element={<RolesPage />} />
                    <Route path="/admin/permissions" element={<PermissionsPage />} />
                    <Route path="/admin/departments" element={<DepartmentsPage />} />
                    <Route path="/admin/categories" element={<CategoriesPage />} />
                    <Route path="/admin/items" element={<ItemsPage />} />
                    <Route path="/admin/suppliers" element={<SuppliersPage />} />
                </Route>

                {/* ── Employee Routes ───────────────────────────────────────── */}
                <Route element={<RoleRoute allowedRoles={["employee"]} />}>
                    <Route path="/employee" element={<EmployeeDashboardPage />} />
                    <Route path="/employee/requests" element={<PurchaseRequestsPage />} />
                    <Route path="/employee/requests/create" element={<CreatePurchaseRequestPage />} />
                    <Route path="/employee/requests/favorites" element={<FavoriteRequestsPage />} />
                    <Route path="/employee/requests/:id" element={<PurchaseRequestDetailsPage />} />
                    <Route path="/employee/requests/:id/edit" element={<EditPurchaseRequestPage />} />
                </Route>

                {/* ── Reviewer Routes ───────────────────────────────────────── */}
                <Route element={<RoleRoute allowedRoles={["reviewer"]} />}>
                    <Route path="/reviewer" element={<ReviewerDashboardPage />} />
                    <Route path="/reviewer/requests" element={<ReviewerRequestsPage />} />
                    <Route path="/reviewer/requests/:id" element={<ReviewerPurchaseRequestDetailsPage />} />
                    <Route path="/reviewer/requests/:id/review" element={<ReviewPurchaseRequestPage />} />
                    <Route path="/reviewer/purchase-quotes" element={<PurchaseQuotesDecisionPage mode="recommend" />} />
                </Route>

                {/* ── Warehouse Keeper Routes ─────────────────────────────── */}
                <Route element={<RoleRoute allowedRoles={["warehouse_keeper"]} />}>
                    <Route path="/warehouse" element={<PurchaseReceiptPage mode="warehouse" />} />
                </Route>

                {/* ── Material Receipt / Site Engineer Routes ──────────────────────── */}
                <Route element={<RoleRoute allowedRoles={["employee", "reviewer", "warehouse_keeper", "site_engineer", "procurement_manager", "accountant", "general_manager", "admin"]} />}>
                    <Route path="/site-engineer" element={<PurchaseReceiptPage mode="site" />} />
                    <Route path="/receipts" element={<PurchaseReceiptPage mode="site" />} />
                </Route>

                {/* ── Procurement Manager Routes ────────────────────────────── */}
                <Route element={<RoleRoute allowedRoles={["procurement_manager"]} />}>
                    <Route path="/procurement" element={<ProcurementManagerPage />} />
                    <Route path="/procurement/approved-requests" element={<ApprovedPurchaseRequestsPage />} />
                    <Route path="/procurement/purchase-orders/create" element={<CreatePurchaseOrderPage />} />
                    <Route path="/procurement/purchase-orders/:id/edit" element={<EditPurchaseOrderPage />} />
                    <Route path="/procurement/purchase-orders/:id" element={<PurchaseOrderDetailsPage />} />
                    <Route path="/procurement/reports" element={<ProcurementReportsPage />} />
                    <Route path="/procurement/*" element={<ProcurementManagerPage />} />
                </Route>

                {/* ── Accounting & Department Accountants Shared Routes ────────────── */}
                <Route element={<RoleRoute allowedRoles={["accountant", "site_accountant", "licenses_accountant", "buffet_accountant"]} />}>
                    <Route path="/accounting/purchase-orders" element={<AccountingPurchaseOrdersPage />} />
                    <Route path="/accounting/purchase-orders/:id" element={<AccountingPurchaseOrderDetailsPage />} />
                    <Route path="/accounting/supplier-finance" element={<SupplierFinanceWorkspacePage />} />
                    <Route path="/accounting/supplier-payments" element={<SupplierFinanceWorkspacePage />} />
                    <Route path="/accounting/supplier-accounts" element={<SupplierFinanceWorkspacePage />} />
                    <Route path="/accounting/reports" element={<UniversalReportsPage />} />
                </Route>

                {/* ── Financial Management (Isolated MVP Accounting Module) ──────── */}
                <Route element={<RoleRoute allowedRoles={["accountant", "site_accountant", "licenses_accountant", "buffet_accountant", "admin"]} />}>
                    <Route path="/accounting/chart-of-accounts" element={<ChartOfAccountsPage />} />
                    <Route path="/accounting/cost-centers" element={<CostCentersPage />} />
                    <Route path="/accounting/contractor-invoices" element={<ContractorInvoicesPage />} />
                    <Route path="/accounting/petty-cash" element={<PettyCashPage />} />
                    <Route path="/accounting/reports/project-costs" element={<ProjectCostsReportPage />} />
                </Route>

                {/* ── Department Accountants Dedicated Dashboard ─────────────────────── */}
                <Route element={<RoleRoute allowedRoles={["site_accountant", "licenses_accountant", "buffet_accountant", "admin"]} />}>
                    <Route path="/site-accountant" element={<SiteAccountantDashboardPage />} />
                </Route>

                {/* ── Financial Director (Accountant) Only Routes ─────────────── */}
                <Route element={<RoleRoute allowedRoles={["accountant"]} />}>
                    <Route path="/accounting" element={<AccountingDashboardPage />} />
                    <Route path="/accounting/purchase-requests" element={<AccountingPurchaseRequestsPage />} />
                    <Route path="/accounting/purchase-quotes" element={<PurchaseQuotesDecisionPage mode="recommend" />} />
                    <Route path="/accounting/land-parcels" element={<LandParcelsPage />} />
                </Route>

                {/* ── General Manager Routes ────────────────────────────────── */}
                <Route element={<RoleRoute allowedRoles={["general_manager"]} />}>
                    <Route path="/general-manager" element={<GeneralManagerDashboardPage />} />
                    <Route path="/general-manager/purchase-requests" element={<GeneralManagerPurchaseRequestsPage />} />
                    <Route path="/general-manager/purchase-quotes" element={<PurchaseQuotesDecisionPage mode="executive" />} />
                    <Route path="/general-manager/purchase-orders" element={<GeneralManagerPurchaseOrdersPage />} />
                    <Route path="/general-manager/purchase-orders/:id" element={<GeneralManagerPurchaseOrderDetailsPage />} />
                    <Route path="/general-manager/land-parcels" element={<LandParcelsPage />} />
                    <Route path="/general-manager/reports" element={<GeneralManagerReportsPage />} />
                </Route>

                {/* Direct alias & shared routes */}
                <Route element={<RoleRoute allowedRoles={["accountant", "site_accountant", "licenses_accountant", "buffet_accountant", "general_manager", "procurement_manager", "admin"]} />}>
                    <Route path="/reports" element={<UniversalReportsPage />} />
                </Route>
                <Route path="/purchase-quotes" element={<PurchaseQuotesDecisionPage mode="recommend" />} />
                <Route path="/purchase-quotes/decision" element={<PurchaseQuotesDecisionPage mode="executive" />} />
                <Route element={<RoleRoute allowedRoles={["accountant", "reviewer", "general_manager", "procurement_manager", "admin"]} />}>
                    <Route path="/quotes" element={<PurchaseQuotesDecisionPage mode="recommend" />} />
                </Route>
            </Route>

            {/* Root & Error Routes */}
            <Route path="/" element={<RoleHomeRedirect />} />
            <Route path="/403" element={<ForbiddenPage />} />
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="/500" element={<ServerErrorPage />} />
            <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </React.Suspense>
    );
};

export default AppRoutes;
