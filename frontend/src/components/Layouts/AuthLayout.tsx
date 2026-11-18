import { Navigate, Outlet } from 'react-router';
import { useAppSelector } from '@/store';

/** Public pages (login). Signed-in users are sent to the app. */
const AuthLayout = () => {
    const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);
    if (isAuthenticated) return <Navigate to="/app" replace />;

    return (
        <div className="main-content-wrap">
            <main className="main-content flex flex-col overflow-hidden min-h-screen">
                <Outlet />
            </main>
        </div>
    );
};

export default AuthLayout;
