import { isRouteErrorResponse, useRouteError } from 'react-router';
import NotFound from './NotFound';

/** Router error boundary: unknown route, or a page chunk that failed to load (e.g. after a deploy). */
const RouteError = () => {
    const error = useRouteError();
    if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;

    return (
        <div className="bg-white dark:bg-[#0a0e19] min-h-screen flex items-center justify-center px-[15px]">
            <div className="text-center max-w-[520px]">
                <i className="material-symbols-outlined !text-[56px] text-danger-500" aria-hidden="true">
                    error
                </i>
                <h4 className="!mt-[10px]">Terjadi kesalahan</h4>
                <p>Halaman gagal dimuat. Muat ulang halaman; jika masih gagal, hubungi admin.</p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="font-medium rounded-md mt-[10px] py-[10px] px-[22px] text-white bg-primary-500 transition-all hover:bg-primary-400"
                >
                    Muat ulang
                </button>
            </div>
        </div>
    );
};

export default RouteError;
