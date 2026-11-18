import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useDropdown } from '@/hooks/useDropdown';
import { alertService } from '@/services/alert.service';
import { useAppSelector } from '@/store';
import type { AlertCounts } from '@/types/alert.types';
import type { Perm } from '@/types/auth.types';
import { formatNumber } from '@/utils/format';

interface AlertRow {
    key: keyof AlertCounts;
    icon: string;
    color: string;
    label: string;
    to: string;
    perm?: Perm;
}

const ROWS: AlertRow[] = [
    { key: 'expired_batches', icon: 'event_busy', color: 'text-danger-500', label: 'batch kedaluwarsa masih berstok', to: '/batches?expiry_status=expired', perm: 'perm_products' },
    { key: 'near_expiry_batches', icon: 'schedule', color: 'text-warning-700', label: 'batch hampir kedaluwarsa', to: '/batches?expiry_status=warning', perm: 'perm_products' },
    { key: 'out_of_stock', icon: 'remove_shopping_cart', color: 'text-danger-500', label: 'produk stok habis', to: '/products?stock_status=out', perm: 'perm_products' },
    { key: 'low_stock', icon: 'inventory', color: 'text-orange-500', label: 'produk stok menipis', to: '/products?stock_status=low', perm: 'perm_products' },
    { key: 'payables_due', icon: 'payments', color: 'text-primary-500', label: 'hutang jatuh tempo', to: '/payables?due=week', perm: 'perm_purchases' },
];

const REFRESH_MS = 5 * 60 * 1000;

/** Trezo header Notifications, fed by GET /alerts (F16). Hides itself while the endpoint is unavailable. */
const Notifications = () => {
    const { open, toggle, setOpen, ref } = useDropdown();
    const user = useAppSelector((s) => s.auth.user);
    const location = useLocation();
    const [counts, setCounts] = useState<AlertCounts | null>(null);

    const load = useCallback(() => {
        alertService
            .get()
            .then((res) => setCounts(res.data?.counts ?? null))
            .catch(() => setCounts(null));
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, REFRESH_MS);
        return () => clearInterval(t);
    }, [load]);

    useEffect(() => setOpen(false), [location.pathname, setOpen]);

    const rows = ROWS.filter((r) => (counts?.[r.key] ?? 0) > 0);
    const total = rows.reduce((sum, r) => sum + (counts?.[r.key] ?? 0), 0);

    return (
        <div className="relative mx-[8px] md:mx-[10px] lg:mx-[12px] first:ml-0 last:mr-0" ref={ref}>
            <button
                type="button"
                onClick={() => {
                    if (!open) load();
                    toggle();
                }}
                className={`leading-none inline-block transition-all relative top-[2px] hover:text-primary-500 ${open ? 'text-primary-500' : ''}`}
                aria-label={total > 0 ? `Peringatan (${total})` : 'Peringatan'}
                aria-expanded={open}
            >
                <i className="material-symbols-outlined !text-[22px] md:!text-[24px]">notifications</i>
                {total > 0 && (
                    <span className="absolute -top-[6px] -right-[8px] min-w-[18px] h-[18px] px-[4px] rounded-full bg-danger-500 text-white text-[10px] leading-[18px] font-semibold text-center">
                        {total > 99 ? '99+' : total}
                    </span>
                )}
            </button>

            {open && (
                <div className="bg-white dark:bg-[#0c1427] shadow-3xl dark:shadow-none py-[17px] absolute mt-[17px] md:mt-[20px] w-[290px] md:w-[350px] z-[1] top-full -right-[120px] md:right-0 rounded-md">
                    <div className="px-[20px] pb-[17px]">
                        <span className="font-semibold text-black dark:text-white text-[15px]">Peringatan</span>
                    </div>
                    {counts === null ? (
                        <p className="px-[20px] !mb-0">Data peringatan belum tersedia.</p>
                    ) : rows.length === 0 ? (
                        <p className="px-[20px] !mb-0">Tidak ada peringatan. Stok dan ED aman.</p>
                    ) : (
                        <ul>
                            {rows.map((r) => {
                                const canOpen = !r.perm || user?.[r.perm];
                                const body = (
                                    <>
                                        <span className={`rounded-full flex items-center justify-center absolute top-1/2 -translate-y-1/2 left-[20px] w-[44px] h-[44px] bg-[#4936f50d] ${r.color}`}>
                                            <i className="material-symbols-outlined !text-[22px]">{r.icon}</i>
                                        </span>
                                        <span className="block text-black dark:text-white">
                                            <strong className="font-semibold">{formatNumber(counts[r.key])}</strong> {r.label}
                                        </span>
                                    </>
                                );
                                return (
                                    <li key={r.key} className="relative border-b border-gray-100 dark:border-[#172036] border-dashed first:border-t">
                                        {canOpen ? (
                                            <Link to={r.to} className="block py-[17px] pl-[75px] pr-[20px] transition-all hover:bg-gray-50 dark:hover:bg-[#15203c]">
                                                {body}
                                            </Link>
                                        ) : (
                                            <div className="py-[17px] pl-[75px] pr-[20px]">{body}</div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

export default Notifications;
