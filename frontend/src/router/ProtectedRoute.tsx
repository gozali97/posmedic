import { Navigate, Outlet, useLocation } from 'react-router';
import Forbidden from '@/pages/Forbidden';
import { useAppSelector } from '@/store';
import type { Perm } from '@/types/auth.types';

interface ProtectedRouteProps {
    /** Extra permission flag required for the child routes. */
    perm?: Perm;
}

/**
 * Layout route guard:
 * - not signed in → /login (and back to this page afterwards),
 * - must_change_password → /profile until the password is changed (F1),
 * - missing `perm` → 403 page. The backend checks the same flags.
 */
const ProtectedRoute = ({ perm }: ProtectedRouteProps) => {
    const { isAuthenticated, user } = useAppSelector((s) => s.auth);
    const location = useLocation();

    if (!isAuthenticated || !user) {
        return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    }
    if (user.must_change_password && location.pathname !== '/profile') {
        return <Navigate to="/profile" replace />;
    }
    if (perm && !user[perm]) {
        return <Forbidden />;
    }
    return <Outlet />;
};

export default ProtectedRoute;
