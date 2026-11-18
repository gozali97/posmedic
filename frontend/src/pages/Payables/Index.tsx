import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { filterClass } from '@/components/ui/filters';
import PageHeader from '@/components/ui/PageHeader';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import PaymentBadge from '@/pages/Purchases/PaymentBadge';
import MarkPaidModal from './MarkPaidModal';
import { supplierService } from '@/services/master.service';
import { purchaseService } from '@/services/stock.service';
import type { Supplier } from '@/types/master.types';
import type { PayableListParams, PayableSummary, PurchaseListData, PurchaseListItem } from '@/types/stock.types';
import { formatDate, formatNumber, formatRupiah } from '@/utils/format';

type Filters = Required<PayableListParams>;

const EMPTY_FILTERS: Filters = { supplier_id: '', due: '' };

const StatCard = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) => (
    <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <span className="block text-sm text-gray-500">{label}</span>
        <span className={`block !mt-[6px] text-[22px] font-semibold ${tone}`}>{value}</span>
        {sub && <span className="block text-sm text-gray-500 !mt-[2px]">{sub}</span>}
    </div>
);

const PayableIndex = () => {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [summary, setSummary] = useState<PayableSummary | null>(null);
    const [paying, setPaying] = useState<PurchaseListItem | null>(null);
    const list = usePaginatedList<PurchaseListItem, PurchaseListData, Filters>({
        fetcher: async (params, signal) => {
            const res = await purchaseService.payables(params, signal);
            setSummary(res.data?.summary ?? null);
            return res;
        },
        select: (d) => d.purchases,
        initialFilters: EMPTY_FILTERS,
    });
    const { filters, setFilters } = list;

    useEffect(() => {
        const controller = new AbortController();
        supplierService
            .all(controller.signal)
            .then((res) => setSuppliers(res.data?.suppliers ?? []))
            .catch(() => setSuppliers([]));
        return () => controller.abort();
    }, []);

    const columns: Column<PurchaseListItem>[] = [
        {
            key: 'invoice_number',
            header: 'No. faktur',
            render: (p) => (
                <Link to={`/purchases/${p.id}`} className="font-medium text-primary-500 hover:underline">
                    {p.invoice_number}
                </Link>
            ),
        },
        { key: 'supplier_name', header: 'Supplier' },
        { key: 'invoice_date', header: 'Tgl. faktur', render: (p) => formatDate(p.invoice_date) },
        { key: 'due_date', header: 'Jatuh tempo', render: (p) => <span className={p.is_overdue ? 'text-danger-500 font-medium' : ''}>{formatDate(p.due_date)}</span> },
        { key: 'total', header: 'Total', className: 'text-right', render: (p) => formatRupiah(p.total) },
        { key: 'status', header: 'Status', render: (p) => <PaymentBadge status={p.payment_status} overdue={p.is_overdue} /> },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (p) => (
                <Button size="sm" variant="success" icon="payments" onClick={() => setPaying(p)} aria-label={`Tandai lunas faktur ${p.invoice_number}`}>
                    Lunas
                </Button>
            ),
        },
    ];

    return (
        <>
            <PageHeader title="Hutang" breadcrumbs={[{ label: 'Pembelian' }, { label: 'Hutang' }]} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[25px] mb-[25px]">
                <StatCard label="Total hutang belum lunas" value={formatRupiah(summary?.unpaid_total ?? 0)} tone="text-black dark:text-white" />
                <StatCard
                    label="Lewat jatuh tempo"
                    value={formatRupiah(summary?.overdue_total ?? 0)}
                    sub={`${formatNumber(summary?.overdue_count ?? 0)} faktur`}
                    tone={(summary?.overdue_count ?? 0) > 0 ? 'text-danger-500' : 'text-black dark:text-white'}
                />
            </div>
            <Card title="Faktur belum lunas">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[12px] mb-[20px]">
                    <select
                        aria-label="Filter supplier"
                        className={filterClass}
                        value={filters.supplier_id}
                        onChange={(e) => setFilters({ supplier_id: e.target.value === '' ? '' : Number(e.target.value) })}
                    >
                        <option value="">Semua supplier</option>
                        {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                    <select aria-label="Filter jatuh tempo" className={filterClass} value={filters.due} onChange={(e) => setFilters({ due: e.target.value as Filters['due'] })}>
                        <option value="">Semua jatuh tempo</option>
                        <option value="overdue">Lewat jatuh tempo</option>
                        <option value="week">Jatuh tempo ≤ 7 hari</option>
                    </select>
                </div>
                <DataTable columns={columns} rows={list.rows} rowKey={(p) => p.id} loading={list.loading} pagination={list.pagination} onPageChange={list.setPage} emptyText="Tidak ada hutang" />
            </Card>
            <MarkPaidModal purchase={paying} supplierName={paying?.supplier_name} onClose={() => setPaying(null)} onPaid={list.reload} />
        </>
    );
};

export default PayableIndex;
