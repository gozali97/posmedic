import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate, useNavigation } from 'react-router';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchMe } from '@/store/authSlice';
import { fetchSettings } from '@/store/settingSlice';
import { toast } from '@/utils/toast';
import Footer from './Footer';
import Header from './Header';
import Sidebar from './Sidebar';

/** Replaces Trezo's LayoutProvider for signed-in pages: sidebar + header + page + footer. */
const AppLayout = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const navigation = useNavigation();
    const sidebarToggled = useAppSelector((s) => s.themeConfig.sidebarToggled);
    const user = useAppSelector((s) => s.auth.user);
    const setting = useAppSelector((s) => s.setting);

    const mustChangePassword = user?.must_change_password ?? false;

    // Refresh permissions once per app load, so flag changes by an admin apply without re-login.
    useEffect(() => {
        dispatch(fetchMe());
    }, [dispatch]);

    // The backend refuses everything but /auth/* until the password is changed.
    useEffect(() => {
        if (!mustChangePassword) dispatch(fetchSettings());
    }, [dispatch, mustChangePassword]);

    // F17 first run: send whoever may fill the store settings to the settings page.
    useEffect(() => {
        if (setting.loaded && setting.store === null && user?.perm_settings && !mustChangePassword && location.pathname !== '/settings') {
            toast.info('Lengkapi pengaturan toko terlebih dahulu');
            navigate('/settings', { replace: true });
        }
    }, [setting.loaded, setting.store, user?.perm_settings, mustChangePassword, location.pathname, navigate]);

    return (
        <div className={`main-content-wrap transition-all ${sidebarToggled ? 'active' : ''}`}>
            {navigation.state === 'loading' && <div className="fixed top-0 left-0 right-0 h-[3px] z-[60] bg-primary-500 animate-pulse" role="progressbar" aria-label="Memuat halaman" />}
            <Sidebar />
            <Header />
            <main className="main-content transition-all flex flex-col overflow-hidden min-h-screen">
                <Outlet />
                <Footer />
            </main>
        </div>
    );
};

export default AppLayout;
