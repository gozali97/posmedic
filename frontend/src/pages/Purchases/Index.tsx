import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { filterClass } from '@/components/ui/filters';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { supplierService } from '@/services/master.service';
import { purchaseService } from '@/services/stock.service';
import type { Supplier } from '@/types/master.types';
import type { PurchaseListData, PurchaseListItem, PurchaseListParams } from '@/types/stock.types';
import { formatDate, formatNumber, formatRupiah } from '@/utils/format';
import PaymentBadge from './PaymentBadge';

type Filters = Required<Omit<PurchaseListParams, 'search'>>;

const EMPTY_FILTERS: Filters = { supplier_id: '', payment_status: '', start_date: '', end_date: '' };

const PurchaseIndex = () => {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const list = usePaginatedList<PurchaseListItem, PurchaseListData, Filters>({
        fetcher: (params, signal) => purchaseService.list(params, signal),
        select: (d) => d.purchases,
        initialFilters: EMPTY_FILTERS,
    });
    const { filters, setFilters } = list;
    const hasFilters = Object.values(filters).some((v) => v !== '');

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
        { key: 'due_date', header: 'Jatuh tempo', render: (p) => formatDate(p.due_date) },
        { key: 'item_count', header: 'Item', className: 'text-right', render: (p) => formatNumber(p.item_count) },
        { key: 'total', header: 'Total', className: 'text-right', render: (p) => formatRupiah(p.total) },
        { key: 'status', header: 'Pembayaran', render: (p) => <PaymentBadge status={p.payment_status} overdue={p.is_overdue} /> },
    ];

    return (
        <>
            <PageHeader title="Penerimaan Barang" breadcrumbs={[{ label: 'Pembelian' }, { label: 'Penerimaan Barang' }]} />
            <Card
                title="Daftar penerimaan"
                actions={
                    <>
                        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cari no. faktur…" />
                        <Link
                            to="/purchases/create"
                            className="inline-flex items-center gap-[6px] whitespace-nowrap font-medium rounded-md py-[7px] px-[16px] bg-primary-500 text-white transition-all hover:bg-primary-400"
                        >
                            <i className="material-symbols-outlined !text-[20px]">add</i>
                            Input penerimaan
                        </Link>
                    </>
                }
            >
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
                    <select
                        aria-label="Filter status pembayaran"
                        className={filterClass}
                        value={filters.payment_status}
                        onChange={(e) => setFilters({ payment_status: e.target.value as Filters['payment_status'] })}
                    >
                        <option value="">Semua status</option>
                        <option value="unpaid">Belum lunas</option>
                        <option value="paid">Lunas</option>
                    </select>
                    <input
                        type="date"
                        aria-label="Tanggal faktur dari"
                        className={filterClass}
                        value={filters.start_date}
                        max={filters.end_date || undefined}
                        onChange={(e) => setFilters({ start_date: e.target.value })}
                    />
                    <input
                        type="date"
                        aria-label="Tanggal faktur sampai"
                        className={filterClass}
                        value={filters.end_date}
                        min={filters.start_date || undefined}
                        onChange={(e) => setFilters({ end_date: e.target.value })}
                    />
                </div>
                {hasFilters && (
                    <div className="mb-[15px]">
                        <Button size="sm" variant="secondary" icon="filter_alt_off" onClick={() => setFilters(EMPTY_FILTERS)}>
                            Reset filter
                        </Button>
                    </div>
                )}
                <DataTable columns={columns} rows={list.rows} rowKey={(p) => p.id} loading={list.loading} pagination={list.pagination} onPageChange={list.setPage} emptyText="Belum ada penerimaan" />
            </Card>
        </>
    );
};

export default PurchaseIndex;
