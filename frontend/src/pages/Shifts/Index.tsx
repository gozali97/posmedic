import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { iconButtonClass } from '@/components/ui/IconButton';
import PageHeader from '@/components/ui/PageHeader';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { shiftService } from '@/services/sales.service';
import { tillService } from '@/services/setting.service';
import { useAppSelector } from '@/store';
import type { Shift, ShiftListData, ShiftListParams } from '@/types/sales.types';
import type { Till } from '@/types/setting.types';
import { formatDateTime, formatRupiah } from '@/utils/format';

const filterClass = 'bg-gray-50 border border-gray-50 h-[36px] text-xs rounded-md px-[10px] text-black dark:bg-[#15203c] dark:text-white dark:border-[#15203c] outline-0 focus:border-primary-500';

/** F9: own shifts; every shift for users with perm_transactions (the server applies the rule). */
const ShiftIndex = () => {
    const canSeeAll = useAppSelector((s) => s.auth.user?.perm_transactions ?? false);
    const currency = useAppSelector((s) => s.setting.store?.currency_symbol);
    const [tills, setTills] = useState<Till[]>([]);
    const list = usePaginatedList<Shift, ShiftListData, Required<Pick<ShiftListParams, 'status' | 'till_id'>>>({
        fetcher: (params, signal) => shiftService.list(params, signal),
        select: (d) => d.shifts,
        initialFilters: { status: '', till_id: '' },
    });

    useEffect(() => {
        tillService
            .list()
            .then((res) => setTills(res.data ?? []))
            .catch(() => setTills([]));
    }, []);

    const money = (n: number | null) => (n === null ? '-' : formatRupiah(n, currency));

    const columns: Column<Shift>[] = [
        { key: 'id', header: 'Shift', render: (s) => <span className="font-medium">#{s.id}</span> },
        ...(canSeeAll ? [{ key: 'user', header: 'Kasir', render: (s: Shift) => s.user?.fullname ?? '-' }] : []),
        { key: 'till', header: 'Till', render: (s) => (s.till ? `${s.till.number} – ${s.till.name}` : s.till_id) },
        { key: 'opened_at', header: 'Dibuka', render: (s) => formatDateTime(s.opened_at) },
        { key: 'closed_at', header: 'Ditutup', render: (s) => formatDateTime(s.closed_at) },
        { key: 'status', header: 'Status', render: (s) => (s.status === 'open' ? <Badge color="success">Terbuka</Badge> : <Badge color="gray">Ditutup</Badge>) },
        { key: 'opening_cash', header: 'Modal awal', className: 'text-right', render: (s) => money(s.opening_cash) },
        { key: 'expected_cash', header: 'Kas seharusnya', className: 'text-right', render: (s) => money(s.expected_cash) },
        { key: 'counted_cash', header: 'Kas fisik', className: 'text-right', render: (s) => money(s.counted_cash) },
        {
            key: 'cash_difference',
            header: 'Selisih',
            className: 'text-right',
            render: (s) =>
                s.cash_difference === null ? (
                    '-'
                ) : (
                    <span className={s.cash_difference < 0 ? 'text-danger-500 font-medium' : s.cash_difference > 0 ? 'text-warning-900 dark:text-warning-300 font-medium' : ''}>
                        {money(s.cash_difference)}
                    </span>
                ),
        },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (s) => (
                <Link to={`/shifts/${s.id}`} className={iconButtonClass()} aria-label={`Lihat shift #${s.id}`} title="Detail & rekap">
                    <i className="material-symbols-outlined !text-[20px]">visibility</i>
                </Link>
            ),
        },
    ];

    return (
        <>
            <PageHeader title="Shift" breadcrumbs={[{ label: 'Kasir' }, { label: 'Shift' }]} />
            <Card
                title={canSeeAll ? 'Semua shift' : 'Shift saya'}
                actions={
                    <>
                        <label className="sr-only" htmlFor="shift-status">
                            Status
                        </label>
                        <select
                            id="shift-status"
                            className={filterClass}
                            value={list.filters.status}
                            onChange={(e) => list.setFilters({ status: e.target.value as ShiftListParams['status'] & string })}
                        >
                            <option value="">Semua status</option>
                            <option value="open">Terbuka</option>
                            <option value="closed">Ditutup</option>
                        </select>
                        <label className="sr-only" htmlFor="shift-till">
                            Till
                        </label>
                        <select id="shift-till" className={filterClass} value={list.filters.till_id} onChange={(e) => list.setFilters({ till_id: e.target.value ? Number(e.target.value) : '' })}>
                            <option value="">Semua till</option>
                            {tills.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.number} – {t.name}
                                </option>
                            ))}
                        </select>
                    </>
                }
            >
                <DataTable columns={columns} rows={list.rows} rowKey={(s) => s.id} loading={list.loading} pagination={list.pagination} onPageChange={list.setPage} emptyText="Belum ada shift" />
            </Card>
        </>
    );
};

export default ShiftIndex;
