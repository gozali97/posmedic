import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ExpiryBadge } from '@/components/ProductBadges';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { filterClass } from '@/components/ui/filters';
import IconButton from '@/components/ui/IconButton';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import { useDebounce } from '@/hooks/useDebounce';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { errorMessage } from '@/services/api.service';
import { batchService } from '@/services/stock.service';
import { useAppSelector } from '@/store';
import type { BatchItem, BatchListData, BatchListParams } from '@/types/stock.types';
import { formatNumber, formatRupiah, toJakartaDateString } from '@/utils/format';
import { toast } from '@/utils/toast';
import AdjustModal from './AdjustModal';

type Filters = Required<Omit<BatchListParams, 'search' | 'product_id' | 'shelf_location'>> & { shelf_location: string };

const EMPTY_FILTERS: Filters = { expiry_status: '', in_stock: '1', shelf_location: '' };

const daysText = (days: number) => (days < 0 ? `lewat ${formatNumber(-days)} hari` : days === 0 ? 'hari ini' : `${formatNumber(days)} hari lagi`);

const BatchIndex = () => {
    const warningDays = useAppSelector((s) => s.setting.store?.expiry_warning_days);
    const [shelfInput, setShelfInput] = useState('');
    const [adjusting, setAdjusting] = useState<BatchItem | null>(null);
    const [exporting, setExporting] = useState(false);
    const list = usePaginatedList<BatchItem, BatchListData, Filters>({
        fetcher: (params, signal) => batchService.list(params, signal),
        select: (d) => d.batches,
        initialFilters: EMPTY_FILTERS,
        perPage: 20,
    });
    const { filters, setFilters } = list;

    // Shelf is free text: debounce it like the search box.
    const shelf = useDebounce(shelfInput).trim();
    useEffect(() => {
        if (shelf !== filters.shelf_location) setFilters({ shelf_location: shelf });
        // Only the debounced input drives this; a reset clears both sides itself.
    }, [shelf]);

    const hasFilters = filters.expiry_status !== '' || filters.in_stock !== '1' || filters.shelf_location !== '';

    const handleExport = async () => {
        setExporting(true);
        try {
            await batchService.export({ ...filters, search: list.search.trim() }, `stok-batch-${toJakartaDateString()}.xlsx`);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal export stok batch'));
        } finally {
            setExporting(false);
        }
    };

    const columns: Column<BatchItem>[] = [
        {
            key: 'product',
            header: 'Produk',
            render: (b) => (
                <div>
                    <Link to={`/products/${b.product_id}`} className="font-medium hover:text-primary-500">
                        {b.product_name}
                    </Link>
                    {b.generic_name && <span className="block text-sm text-gray-500">{b.generic_name}</span>}
                </div>
            ),
        },
        { key: 'shelf', header: 'Rak', render: (b) => b.shelf_location ?? '-' },
        { key: 'batch_number', header: 'No. batch', render: (b) => <span className="font-medium">{b.batch_number}</span> },
        {
            key: 'expiry',
            header: 'ED',
            render: (b) => (
                <div>
                    <ExpiryBadge status={b.expiry_status} date={b.expiration_date} />
                    <span className="block text-sm text-gray-500">{daysText(b.days_to_expiry)}</span>
                </div>
            ),
        },
        { key: 'quantity', header: 'Qty', className: 'text-right', render: (b) => `${formatNumber(b.quantity)} ${b.base_unit ?? ''}` },
        { key: 'cost_price', header: 'HPP / satuan dasar', className: 'text-right', render: (b) => formatRupiah(b.cost_price) },
        { key: 'value', header: 'Nilai stok', className: 'text-right', render: (b) => formatRupiah(b.quantity * b.cost_price) },
        { key: 'source', header: 'Asal', render: (b) => (b.source === 'purchase' ? 'Penerimaan' : 'Opname') },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (b) => <IconButton icon="tune" label={`Sesuaikan stok batch ${b.batch_number} ${b.product_name}`} onClick={() => setAdjusting(b)} />,
        },
    ];

    return (
        <>
            <PageHeader title="Stok per Batch" breadcrumbs={[{ label: 'Inventori' }, { label: 'Stok per Batch' }]} />
            <Card
                title="Daftar batch"
                actions={
                    <>
                        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cari produk atau no. batch…" />
                        <Button size="sm" variant="outline" icon="download" loading={exporting} onClick={handleExport}>
                            Export Excel
                        </Button>
                    </>
                }
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[12px] mb-[20px]">
                    <select
                        aria-label="Filter status ED"
                        className={filterClass}
                        value={filters.expiry_status}
                        onChange={(e) => setFilters({ expiry_status: e.target.value as Filters['expiry_status'] })}
                    >
                        <option value="">Semua ED</option>
                        <option value="expired">Kedaluwarsa</option>
                        <option value="30">ED ≤ 30 hari</option>
                        <option value="warning">ED ≤ {warningDays ?? 'batas peringatan'} hari</option>
                    </select>
                    <select aria-label="Filter stok" className={filterClass} value={filters.in_stock} onChange={(e) => setFilters({ in_stock: e.target.value as Filters['in_stock'] })}>
                        <option value="1">Hanya yang berstok</option>
                        <option value="0">Termasuk batch kosong</option>
                    </select>
                    <input aria-label="Filter rak" className={filterClass} placeholder="Rak, mis. A-03" maxLength={30} value={shelfInput} onChange={(e) => setShelfInput(e.target.value)} />
                </div>
                {hasFilters && (
                    <div className="mb-[15px]">
                        <Button
                            size="sm"
                            variant="secondary"
                            icon="filter_alt_off"
                            onClick={() => {
                                setShelfInput('');
                                setFilters(EMPTY_FILTERS);
                            }}
                        >
                            Reset filter
                        </Button>
                    </div>
                )}
                <DataTable columns={columns} rows={list.rows} rowKey={(b) => b.id} loading={list.loading} pagination={list.pagination} onPageChange={list.setPage} emptyText="Batch tidak ditemukan" />
            </Card>
            <AdjustModal batch={adjusting} onClose={() => setAdjusting(null)} onSaved={list.reload} />
        </>
    );
};

export default BatchIndex;
