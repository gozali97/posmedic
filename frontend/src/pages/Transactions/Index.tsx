import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import DateRangeFilter, { filterControlClass, rangeFromPreset, type RangeValue } from '@/components/DateRangeFilter';
import ReceiptModal from '@/components/print/ReceiptModal';
import { TransactionReceipt } from '@/components/print/Receipts';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import IconButton, { iconButtonClass } from '@/components/ui/IconButton';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { errorMessage } from '@/services/api.service';
import { transactionService } from '@/services/sales.service';
import { tillService } from '@/services/setting.service';
import { userService } from '@/services/user.service';
import { useAppSelector } from '@/store';
import type { User } from '@/types/auth.types';
import { paymentMethodLabel, type SalesSummary, type SoldProductItem, type Transaction, type TransactionFilters, type TransactionListData, type TransactionListItem } from '@/types/sales.types';
import type { Till } from '@/types/setting.types';
import { formatDateTime, formatNumber, formatRupiah } from '@/utils/format';
import { toast } from '@/utils/toast';
import StatusBadge from './StatusBadge';

type ListFilters = Required<Omit<TransactionFilters, 'search'>>;

const StatCard = ({ label, value, sub, icon, tone = 'text-primary-500' }: { label: string; value: string; sub?: string; icon: string; tone?: string }) => (
    <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] rounded-md flex items-center gap-[15px]">
        <span className={`w-[48px] h-[48px] shrink-0 rounded-full bg-gray-50 dark:bg-[#15203c] flex items-center justify-center ${tone}`}>
            <i className="material-symbols-outlined" aria-hidden="true">
                {icon}
            </i>
        </span>
        <div className="min-w-0">
            <span className="block text-sm">{label}</span>
            <span className="block text-[20px] font-bold text-black dark:text-white truncate">{value}</span>
            {sub && <span className="block text-xs truncate">{sub}</span>}
        </div>
    </div>
);

const SOLD_PREVIEW = 10;

/** F15: period summary cards, sold products, paginated transactions with receipt reprint, Excel export. */
const TransactionIndex = () => {
    const [params] = useSearchParams();
    const shiftParam = Number(params.get('shift_id')) || '';
    const user = useAppSelector((s) => s.auth.user);
    const store = useAppSelector((s) => s.setting.store);
    const currency = store?.currency_symbol;
    const money = (n: number) => formatRupiah(n, currency);

    // Coming from a shift: show the whole shift regardless of date.
    const [range, setRange] = useState<RangeValue>(() => rangeFromPreset(shiftParam ? 'all' : 'today'));
    const list = usePaginatedList<TransactionListItem, TransactionListData, ListFilters>({
        fetcher: (p, signal) => transactionService.list(p, signal),
        select: (d) => d.transactions,
        initialFilters: { start_date: range.start_date, end_date: range.end_date, till_id: '', user_id: '', shift_id: shiftParam, status: '' },
    });
    const { filters, setFilters } = list;

    const [summary, setSummary] = useState<SalesSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [showAllSold, setShowAllSold] = useState(false);
    const [tills, setTills] = useState<Till[]>([]);
    const [cashiers, setCashiers] = useState<User[]>([]);
    const [exporting, setExporting] = useState(false);
    const [receipt, setReceipt] = useState<{ open: boolean; trx: Transaction | null }>({ open: false, trx: null });

    useEffect(() => {
        tillService
            .list()
            .then((res) => setTills(res.data ?? []))
            .catch(() => setTills([]));
        // The cashier filter needs the user list, which only perm_users may read.
        if (user?.perm_users)
            userService
                .list({ per_page: 100 })
                .then((res) => setCashiers(res.data?.users ?? []))
                .catch(() => setCashiers([]));
    }, [user?.perm_users]);

    // Summary uses the same period/till/cashier/shift; it always covers paid sales (BR11).
    const { start_date, end_date, till_id, user_id, shift_id } = filters;
    useEffect(() => {
        const controller = new AbortController();
        setSummaryLoading(true);
        transactionService
            .summary({ start_date, end_date, till_id, user_id, shift_id }, controller.signal)
            .then((res) => setSummary(res.data ?? null))
            .catch((err) => {
                if (!controller.signal.aborted) toast.error(errorMessage(err, 'Gagal memuat ringkasan'));
            })
            .finally(() => {
                if (!controller.signal.aborted) setSummaryLoading(false);
            });
        return () => controller.abort();
    }, [start_date, end_date, till_id, user_id, shift_id]);

    const changeRange = (v: RangeValue) => {
        setRange(v);
        // A custom range applies once both ends are set.
        if (v.preset !== 'custom' || (v.start_date && v.end_date)) setFilters({ start_date: v.start_date, end_date: v.end_date });
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            await transactionService.export({ ...filters, search: list.search.trim() }, `transaksi-${start_date || 'semua'}${end_date && end_date !== start_date ? `_${end_date}` : ''}.xlsx`);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal export'));
        } finally {
            setExporting(false);
        }
    };

    const openReceipt = async (id: number) => {
        setReceipt({ open: true, trx: null });
        try {
            const res = await transactionService.detail(id);
            setReceipt({ open: true, trx: res.data ?? null });
        } catch (err) {
            toast.error(errorMessage(err));
            setReceipt({ open: false, trx: null });
        }
    };

    const soldRows = summary?.products ?? [];
    const soldShown = showAllSold ? soldRows : soldRows.slice(0, SOLD_PREVIEW);
    const soldColumns: Column<SoldProductItem>[] = [
        { key: 'product_name', header: 'Produk', render: (p) => <span className="font-medium">{p.product_name}</span> },
        { key: 'sold_quantity', header: 'Terjual', className: 'text-right', render: (p) => `${formatNumber(p.sold_quantity)} ${p.base_unit ?? ''}` },
        { key: 'stock_quantity', header: 'Stok tersedia', className: 'text-right', render: (p) => `${formatNumber(p.stock_quantity)} ${p.base_unit ?? ''}` },
        { key: 'net_sales', header: 'Penjualan bersih', className: 'text-right', render: (p) => money(p.net_sales) },
        { key: 'cogs', header: 'HPP', className: 'text-right', render: (p) => money(p.cogs) },
        { key: 'profit', header: 'Laba', className: 'text-right', render: (p) => <span className={p.profit < 0 ? 'text-danger-500' : ''}>{money(p.profit)}</span> },
    ];

    const columns: Column<TransactionListItem>[] = [
        {
            key: 'invoice_number',
            header: 'Invoice',
            render: (t) => (
                <Link to={`/transactions/${t.id}`} className="font-medium text-primary-500 hover:underline">
                    {t.invoice_number ?? t.ref_number ?? `#${t.id}`}
                </Link>
            ),
        },
        { key: 'date', header: 'Tanggal', render: (t) => formatDateTime(t.paid_at ?? t.created_at) },
        { key: 'customer_name', header: 'Pelanggan', render: (t) => t.customer_name ?? '-' },
        { key: 'total', header: 'Total', className: 'text-right', render: (t) => money(t.total) },
        { key: 'paid', header: 'Dibayar', className: 'text-right', render: (t) => money(t.paid) },
        { key: 'change', header: 'Kembali', className: 'text-right', render: (t) => money(t.change) },
        { key: 'payment_method', header: 'Metode', render: (t) => paymentMethodLabel(t.payment_method) },
        { key: 'till', header: 'Till', render: (t) => `${t.till_number} – ${t.till_name}` },
        { key: 'cashier_name', header: 'Kasir', render: (t) => t.cashier_name ?? '-' },
        { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} returnCount={t.return_count} /> },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (t) => (
                <div className="flex justify-end gap-[6px]">
                    {t.status !== 'held' && <IconButton icon="receipt" label={`Struk ${t.invoice_number ?? t.id}`} onClick={() => openReceipt(t.id)} />}
                    <Link to={`/transactions/${t.id}`} className={iconButtonClass()} aria-label={`Detail ${t.invoice_number ?? t.id}`} title="Detail, void, retur">
                        <i className="material-symbols-outlined !text-[20px]">visibility</i>
                    </Link>
                </div>
            ),
        },
    ];

    const s = summary;
    const dash = summaryLoading && !s ? '…' : null;

    return (
        <>
            <PageHeader
                title="Transaksi & Laporan"
                breadcrumbs={[{ label: 'Penjualan' }, { label: 'Transaksi & Laporan' }]}
                actions={
                    <Button variant="outline" size="sm" icon="download" onClick={handleExport} loading={exporting}>
                        Export Excel
                    </Button>
                }
            />

            <Card>
                <div className="flex flex-wrap items-center gap-[10px]">
                    <DateRangeFilter value={range} onChange={changeRange} />
                    <label className="sr-only" htmlFor="trx-till">
                        Till
                    </label>
                    <select id="trx-till" className={filterControlClass} value={filters.till_id} onChange={(e) => setFilters({ till_id: e.target.value ? Number(e.target.value) : '' })}>
                        <option value="">Semua till</option>
                        {tills.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.number} – {t.name}
                            </option>
                        ))}
                    </select>
                    {cashiers.length > 0 && (
                        <>
                            <label className="sr-only" htmlFor="trx-cashier">
                                Kasir
                            </label>
                            <select id="trx-cashier" className={filterControlClass} value={filters.user_id} onChange={(e) => setFilters({ user_id: e.target.value ? Number(e.target.value) : '' })}>
                                <option value="">Semua kasir</option>
                                {cashiers.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.fullname}
                                    </option>
                                ))}
                            </select>
                        </>
                    )}
                    {filters.shift_id !== '' && (
                        <button
                            type="button"
                            onClick={() => setFilters({ shift_id: '' })}
                            className="inline-flex items-center gap-[4px] rounded-md bg-primary-50 dark:bg-[#15203c] text-primary-600 px-[10px] h-[36px] text-xs font-medium"
                        >
                            Shift #{filters.shift_id}
                            <i className="material-symbols-outlined !text-[16px]" aria-label="Hapus filter shift">
                                close
                            </i>
                        </button>
                    )}
                </div>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-[25px] mb-[25px]" aria-busy={summaryLoading}>
                <StatCard label="Penjualan bruto" value={dash ?? money(s?.gross_sales ?? 0)} icon="point_of_sale" />
                <StatCard label="Retur" value={dash ?? money(s?.returns ?? 0)} icon="assignment_return" tone="text-danger-500" />
                <StatCard label="Penjualan bersih" value={dash ?? money(s?.net_sales ?? 0)} icon="payments" tone="text-success-600" />
                <StatCard label="HPP" value={dash ?? money(s?.cogs ?? 0)} icon="inventory_2" tone="text-orange-500" />
                <StatCard label="Laba kotor" value={dash ?? money(s?.gross_profit ?? 0)} icon="trending_up" tone="text-success-600" />
                <StatCard label="Jumlah transaksi" value={dash ?? formatNumber(s?.transaction_count)} icon="receipt_long" />
                <StatCard label="Item terjual" value={dash ?? formatNumber(s?.items_sold)} icon="medication" />
                {store?.is_pkp && <StatCard label="PPN keluaran" value={dash ?? money(s?.ppn ?? 0)} sub={`DPP ${money(s?.dpp ?? 0)}`} icon="account_balance" tone="text-purple-500" />}
            </div>

            <Card title="Produk terjual">
                <DataTable columns={soldColumns} rows={soldShown} rowKey={(p) => p.product_id} loading={summaryLoading} emptyText="Belum ada penjualan pada periode ini" />
                {soldRows.length > SOLD_PREVIEW && (
                    <div className="mt-[12px] text-center">
                        <Button variant="secondary" size="sm" onClick={() => setShowAllSold((v) => !v)}>
                            {showAllSold ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${formatNumber(soldRows.length)})`}
                        </Button>
                    </div>
                )}
            </Card>

            <Card
                title="Daftar transaksi"
                actions={
                    <>
                        <label className="sr-only" htmlFor="trx-status">
                            Status
                        </label>
                        <select id="trx-status" className={filterControlClass} value={filters.status} onChange={(e) => setFilters({ status: e.target.value as ListFilters['status'] })}>
                            <option value="">Lunas & void</option>
                            <option value="paid">Lunas</option>
                            <option value="void">Void</option>
                            <option value="held">Tertunda</option>
                        </select>
                        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cari invoice, ref, pelanggan…" />
                    </>
                }
            >
                <DataTable columns={columns} rows={list.rows} rowKey={(t) => t.id} loading={list.loading} pagination={list.pagination} onPageChange={list.setPage} emptyText="Tidak ada transaksi" />
            </Card>

            <ReceiptModal open={receipt.open} onClose={() => setReceipt({ open: false, trx: null })} title={`Struk ${receipt.trx?.invoice_number ?? ''}`}>
                {receipt.trx && <TransactionReceipt trx={receipt.trx} store={store} />}
            </ReceiptModal>
        </>
    );
};

export default TransactionIndex;
