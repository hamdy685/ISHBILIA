import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    render,
    screen,
    waitFor,
    fireEvent,
    cleanup,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { User } from "../types/auth";
import AuthenticatedLayout from "../layouts/AuthenticatedLayout";
import ProtectedRoute from "../routes/ProtectedRoute";
import RoleHomeRedirect from "../routes/RoleHomeRedirect";
import * as authStorage from "../utils/authStorage";
import * as authApi from "../api/auth";

const makeUser = (roles: string[]): User => ({
    id: 1,
    name: `${roles[0] ?? "user"} user`,
    email: `${roles[0] ?? "user"}@ashbiliya.com`,
    is_active: true,
    roles,
    permissions: [],
});

const renderLayout = async (initialPath: string, user: User) => {
    vi.spyOn(authStorage, "getToken").mockReturnValue("mock_token");
    vi.spyOn(authApi, "getMeApi").mockResolvedValue(user);

    render(
        <MemoryRouter initialEntries={[initialPath]}>
            <AuthProvider>
                <Routes>
                    <Route element={<ProtectedRoute />}>
                        <Route element={<AuthenticatedLayout />}>
                            <Route
                                path="*"
                                element={
                                    <div data-testid="page-content">Page</div>
                                }
                            />
                        </Route>
                    </Route>
                    <Route
                        path="/login"
                        element={<div data-testid="login-page">Login Page</div>}
                    />
                </Routes>
            </AuthProvider>
        </MemoryRouter>,
    );

    await waitFor(() => {
        expect(screen.getByTestId("page-content")).toBeInTheDocument();
    });
};

const assertVisibleLinks = (labels: string[]) => {
    labels.forEach((label) => {
        expect(screen.getByRole("link", { name: new RegExp(label) })).toBeInTheDocument();
    });
};

const assertHiddenLinks = (labels: string[]) => {
    labels.forEach((label) => {
        expect(
            screen.queryByRole("link", { name: new RegExp(label) }),
        ).not.toBeInTheDocument();
    });
};

describe("Role-based navigation and redirect flow", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        cleanup();
        authStorage.removeToken();
        authStorage.removeStoredUser();
    });

    it("1. Employee sees only employee navigation plus notifications and profile", async () => {
        await renderLayout("/employee", makeUser(["employee"]));

        assertVisibleLinks([
            "لوحة الموظف",
            "طلباتي",

            "الإشعارات",
            "الملف الشخصي",
        ]);

        assertHiddenLinks([
            "لوحة المراجعة",
            "طلبات المراجعة",
            "لوحة المشتريات",
            "طلبات الشراء المعتمدة",
            "لوحة المحاسبة",
            "لوحة المدير العام",
            "لوحة تحكم الإدارة",
        ]);
    });

    it("2. Reviewer sees only reviewer navigation plus notifications and profile", async () => {
        await renderLayout("/reviewer", makeUser(["reviewer"]));

        assertVisibleLinks([
            "لوحة المراجعة",
            "طلبات المراجعة",
            "طلبات الشراء الخاصة بي",
            "الإشعارات",
            "الملف الشخصي",
        ]);

        assertHiddenLinks([
            "لوحة الموظف",
            "طلباتي",
            "لوحة المشتريات",
            "طلبات الشراء المعتمدة",
            "لوحة المحاسبة",
            "لوحة المدير العام",
            "لوحة تحكم الإدارة",
        ]);
    });

    it("3. Procurement Manager sees procurement navigation plus notifications and profile", async () => {
        await renderLayout("/procurement", makeUser(["procurement_manager"]));

        assertVisibleLinks([
            "لوحة المشتريات",
            "طلبات الشراء المعتمدة",
            "أوامر الشراء",
            "طلبات الشراء الخاصة بي",
            "الإشعارات",
            "الملف الشخصي",
        ]);

        assertHiddenLinks([
            "لوحة الموظف",
            "طلباتي",

            "لوحة المراجعة",
            "طلبات المراجعة",
            "لوحة المحاسبة",
            "لوحة المدير العام",
            "لوحة تحكم الإدارة",
        ]);
    });

    it("4. Accountant sees accounting navigation plus notifications and profile", async () => {
        await renderLayout("/accounting", makeUser(["accountant"]));

        assertVisibleLinks([
            "لوحة المحاسبة",
            "أوامر الشراء للحسابات",
            "طلبات الشراء الخاصة بي",
            "الإشعارات",
            "الملف الشخصي",
        ]);

        assertHiddenLinks([
            "لوحة الموظف",
            "طلباتي",

            "لوحة المراجعة",
            "طلبات المراجعة",
            "لوحة المشتريات",
            "طلبات الشراء المعتمدة",
            "لوحة المدير العام",
            "لوحة تحكم الإدارة",
        ]);
    });

    it("5. General Manager sees GM navigation plus notifications and profile", async () => {
        await renderLayout("/general-manager", makeUser(["general_manager"]));

        assertVisibleLinks([
            "لوحة المدير العام",
            "أوامر الشراء الصادرة — العرض التنفيذي",
            "طلبات الشراء الخاصة بي",
            "الإشعارات",
            "الملف الشخصي",
        ]);

        assertHiddenLinks([
            "لوحة الموظف",
            "طلباتي",

            "لوحة المراجعة",
            "طلبات المراجعة",
            "لوحة المشتريات",
            "طلبات الشراء المعتمدة",
            "لوحة المحاسبة",
            "لوحة تحكم الإدارة",
        ]);
    });

    it("6. Admin sees admin navigation and shared profile links", async () => {
        await renderLayout("/admin", makeUser(["admin"]));

        assertVisibleLinks([
            "لوحة مدير النظام",
            "إدارة المستخدمين",
            "الأدوار",
            "الصلاحيات",
            "الأقسام",
            "التصنيفات",
            "الأصناف",
            "الموردين",
            "الإشعارات",
            "الملف الشخصي",
        ]);

        assertHiddenLinks([
            "لوحة الموظف",
            "طلباتي",

            "لوحة المراجعة",
            "طلبات المراجعة",
            "لوحة المشتريات",
            "طلبات الشراء المعتمدة",
            "لوحة المحاسبة",
            "لوحة المدير العام",
            "لوحة تحكم الإدارة",
        ]);
    });

    it("7. Root redirect chooses the correct dashboard for each role with priority", async () => {
        const cases: Array<[string[], string]> = [
            [["employee"], "/employee"],
            [["reviewer"], "/reviewer"],
            [["procurement_manager"], "/procurement"],
            [["accountant"], "/accounting"],
            [["general_manager"], "/general-manager"],
            [["admin"], "/admin"],
            [
                [
                    "employee",
                    "reviewer",
                    "procurement_manager",
                    "accountant",
                    "general_manager",
                    "admin",
                ],
                "/admin",
            ],
        ];

        for (const [roles, expectedPath] of cases) {
            cleanup();
            authStorage.removeStoredUser();
            authStorage.removeToken();
            vi.restoreAllMocks();
            vi.spyOn(authStorage, "getToken").mockReturnValue("mock_token");
            vi.spyOn(authStorage, "getStoredUser").mockReturnValue(null);
            vi.spyOn(authApi, "getMeApi").mockResolvedValue(makeUser(roles));

            render(
                <MemoryRouter initialEntries={["/"]}>
                    <AuthProvider>
                        <Routes>
                            <Route path="/" element={<RoleHomeRedirect />} />
                            <Route
                                path="/employee"
                                element={
                                    <div data-testid="employee-home">
                                        Employee Home
                                    </div>
                                }
                            />
                            <Route
                                path="/reviewer"
                                element={
                                    <div data-testid="reviewer-home">
                                        Reviewer Home
                                    </div>
                                }
                            />
                            <Route
                                path="/procurement"
                                element={
                                    <div data-testid="procurement-home">
                                        Procurement Home
                                    </div>
                                }
                            />
                            <Route
                                path="/accounting"
                                element={
                                    <div data-testid="accounting-home">
                                        Accounting Home
                                    </div>
                                }
                            />
                            <Route
                                path="/general-manager"
                                element={
                                    <div data-testid="gm-home">GM Home</div>
                                }
                            />

                            <Route
                                path="/admin"
                                element={
                                    <div data-testid="admin-home">
                                        Admin Home
                                    </div>
                                }
                            />
                        </Routes>
                    </AuthProvider>
                </MemoryRouter>,
            );

            const targetTestIdMap: Record<string, string> = {
                "/employee": "employee-home",
                "/reviewer": "reviewer-home",
                "/procurement": "procurement-home",
                "/accounting": "accounting-home",
                "/general-manager": "gm-home",

                "/admin": "admin-home",
            };

            await waitFor(() => {
                expect(
                    screen.getByTestId(targetTestIdMap[expectedPath]),
                ).toBeInTheDocument();
            });
        }

        cleanup();
    });

    it("8. Shared layout keeps RTL direction and mobile menu toggle working", async () => {
        const user = makeUser(["employee"]);
        await renderLayout("/employee", user);

        const root = document.querySelector('[dir="rtl"]');
        expect(root).toBeInTheDocument();

        const aside = document.querySelector("aside");
        expect(aside?.className).toContain("hidden");

        fireEvent.click(
            screen.getByRole("button", { name: "Toggle navigation menu" }),
        );

        await waitFor(() => {
            expect(document.querySelector("aside")?.className).toContain(
                "block",
            );
        });
    });
});
