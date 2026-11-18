import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import 'material-symbols/outlined.css';
import './index.css';
import { router } from '@/router/routes';
import { setSessionRefreshedHandler, setUnauthorizedHandler } from '@/services/api.service';
import { store } from '@/store';
import { sessionExpired, setUser } from '@/store/authSlice';
import { toast } from '@/utils/toast';

setUnauthorizedHandler(() => {
    if (!store.getState().auth.isAuthenticated) return;
    store.dispatch(sessionExpired());
    toast.warning('Sesi berakhir, silakan login ulang');
    const { pathname, search } = window.location;
    router.navigate('/login', { replace: true, state: { from: pathname + search } });
});

setSessionRefreshedHandler((data) => store.dispatch(setUser(data.user)));

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Provider store={store}>
            <RouterProvider router={router} />
        </Provider>
    </StrictMode>,
);
