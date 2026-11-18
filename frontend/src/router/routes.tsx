import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import AppLayout from '@/components/Layouts/AppLayout';
import AuthLayout from '@/components/Layouts/AuthLayout';
import NotFound from '@/pages/NotFound';
import RouteError from '@/pages/RouteError';
import ProtectedRoute from './ProtectedRoute';

/** Lazy page module: code-split per page, loaded before navigation completes. */
const page = (load: () => Promise<{ default: ComponentType }>): Pick<RouteObject, 'lazy'> => ({
    lazy: async () => ({ Component: (await load()).default }),
});

const routes: RouteObject[] = [
    {
        errorElement: <RouteError />,
        HydrateFallback: () => null,
        children: [
            { path: '/', ...page(() => import('@/pages/Landing')) },
            {
                element: <AuthLayout />,
                children: [{ path: '/login', ...page(() => import('@/pages/Auth/Login')) }],
            },
            {
                element: <ProtectedRoute />,
                children: [
                    {
                        element: <AppLayout />,
                        children: [
                            // Every signed-in user (PRD §3)
                            { path: '/app', ...page(() => import('@/pages/Pos/Index')) },
                            { path: '/held', ...page(() => import('@/pages/Held/Index')) },
                            { path: '/shifts', ...page(() => import('@/pages/Shifts/Index')) },
                            { path: '/shifts/:id', ...page(() => import('@/pages/Shifts/Detail')) },
                            { path: '/customers', ...page(() => import('@/pages/Customers/Index')) },
                            { path: '/profile', ...page(() => import('@/pages/Profile/Index')) },

                            {
                                element: <ProtectedRoute perm="perm_transactions" />,
                                children: [
                                    { path: '/transactions', ...page(() => import('@/pages/Transactions/Index')) },
                                    { path: '/transactions/:id', ...page(() => import('@/pages/Transactions/Detail')) },
                                    { path: '/sales-returns', ...page(() => import('@/pages/SalesReturns/Index')) },
                                ],
                            },
                            {
                                element: <ProtectedRoute perm="perm_products" />,
                                children: [
                                    { path: '/products', ...page(() => import('@/pages/Products/Index')) },
                                    { path: '/products/create', ...page(() => import('@/pages/Products/Create')) },
                                    { path: '/products/:id', ...page(() => import('@/pages/Products/Detail')) },
                                    { path: '/products/:id/edit', ...page(() => import('@/pages/Products/Edit')) },
                                    { path: '/batches', ...page(() => import('@/pages/Batches/Index')) },
                                    { path: '/stock-opnames', ...page(() => import('@/pages/StockOpnames/Index')) },
                                    { path: '/stock-opnames/:id', ...page(() => import('@/pages/StockOpnames/Detail')) },
                                ],
                            },
                            {
                                element: <ProtectedRoute perm="perm_categories" />,
                                children: [{ path: '/categories', ...page(() => import('@/pages/Categories/Index')) }],
                            },
                            {
                                element: <ProtectedRoute perm="perm_purchases" />,
                                children: [
                                    { path: '/purchases', ...page(() => import('@/pages/Purchases/Index')) },
                                    { path: '/purchases/create', ...page(() => import('@/pages/Purchases/Create')) },
                                    { path: '/purchases/:id', ...page(() => import('@/pages/Purchases/Detail')) },
                                    { path: '/payables', ...page(() => import('@/pages/Payables/Index')) },
                                    { path: '/suppliers', ...page(() => import('@/pages/Suppliers/Index')) },
                                ],
                            },
                            {
                                element: <ProtectedRoute perm="perm_users" />,
                                children: [
                                    { path: '/users', ...page(() => import('@/pages/Users/Index')) },
                                    { path: '/users/create', ...page(() => import('@/pages/Users/Create')) },
                                    { path: '/users/:id/edit', ...page(() => import('@/pages/Users/Edit')) },
                                ],
                            },
                            {
                                element: <ProtectedRoute perm="perm_settings" />,
                                children: [
                                    { path: '/settings', ...page(() => import('@/pages/Settings/Index')) },
                                    { path: '/audit-logs', ...page(() => import('@/pages/AuditLogs/Index')) },
                                ],
                            },
                        ],
                    },
                ],
            },
            { path: '*', element: <NotFound /> },
        ],
    },
];

export const router = createBrowserRouter(routes);
