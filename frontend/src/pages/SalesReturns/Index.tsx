import { useState } from 'react';
import { Link } from 'react-router';
import DateRangeFilter, { rangeFromPreset, type RangeValue } from '@/components/DateRangeFilter';
import ReceiptModal from '@/components/print/ReceiptModal';
import { ReturnReceipt } from '@/components/print/Receipts';
import Badge from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import IconButton from '@/components/ui/IconButton';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { errorMessage } from '@/services/api.service';
import { salesReturnService } from '@/services/sales.service';
import { useAppSelector } from '@/store';
import { paymentMethodLabel, type SalesReturn, type SalesReturnListData, type SalesReturnListItem } from '@/types/sales.types';
import { formatDateTime, formatRupiah } from '@/utils/format';
import { toast } from '@/utils/toast';

/** F14: returns by period; reprint the return receipt. Returns are created from the transaction detail. */
const SalesReturnIndex = () => {
    const store = useAppSelector((s) => s.setting.store);
    const currency = store?.currency_symbol;
    const [range, setRange] = useState<RangeValue>(() => rangeFromPreset('30d'));
    const list = usePaginatedList<SalesReturnListItem, SalesReturnListData, { start_date: string; end_date: string }>({
        fetcher: (p, signal) => salesReturnService.list(p, signal),
        select: (d) => d.sales_returns,
        initialFilters: { start_date: range.start_date, end_date: range.end_date },
    });
    const [printing, setPrinting] = useState<{ open: boolean; ret: SalesReturn | null }>({ open: false, ret: null });

    const changeRange = (v: RangeValue) => {
        setRange(v);
        if (v.preset !== 'custom' || (v.start_date && v.end_date)) list.setFilters({ start_date: v.start_date, end_date: v.end_date });
    };

    const print = async (id: number) => {
        setPrinting({ open: true, ret: null });
        try {
            const res = await salesReturnService.detail(id);
            setPrinting({ open: true, ret: res.data ?? null });
        } catch (err) {
            toast.error(errorMessage(err));
            setPrinting({ open: false, ret: null });
        }
    };

    const columns: Column<SalesReturnListItem>[] = [
        { key: 'return_number', header: 'No. retur', render: (r) => <span className="font-medium">{r.return_number}</span> },
        { key: 'created_at', header: 'Tanggal', render: (r) => formatDateTime(r.created_at) },
        {
            key: 'invoice_number',
            header: 'Invoice asal',
            render: (r) => (
                <Link to={`/transactions/${r.transaction_id}`} className="text-primary-500 hover:underline">
                    {r.invoice_number ?? `#${r.transaction_id}`}
                </Link>
            ),
        },
        { key: 'username', header: 'Petugas' },
        { key: 'till_number', header: 'Till' },
        { key: 'total_refund', header: 'Refund', className: 'text-right', render: (r) => formatRupiah(r.total_refund, currency) },
        { key: 'refund_method', header: 'Metode', render: (r) => <Badge color="gray">{paymentMethodLabel(r.refund_method)}</Badge> },
        {
            key: 'reason',
            header: 'Alasan',
            render: (r) => (
                <span className="block max-w-[280px] truncate" title={r.reason}>
                    {r.reason}
                </span>
            ),
        },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (r) => <IconButton icon="print" label={`Cetak struk retur ${r.return_number}`} onClick={() => print(r.id)} />,
        },
    ];

    return (
        <>
            <PageHeader title="Retur Penjualan" breadcrumbs={[{ label: 'Penjualan' }, { label: 'Retur Penjualan' }]} />
            <Card
                title="Daftar retur"
                actions={
                    <>
                        <DateRangeFilter value={range} onChange={changeRange} />
                        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cari no. retur / invoice…" />
                    </>
                }
            >
                <p className="!mb-[15px] text-sm">Retur dibuat dari detail transaksi lunas (menu Transaksi & Laporan).</p>
                <DataTable
                    columns={columns}
                    rows={list.rows}
                    rowKey={(r) => r.id}
                    loading={list.loading}
                    pagination={list.pagination}
                    onPageChange={list.setPage}
                    emptyText="Belum ada retur pada periode ini"
                />
            </Card>
            <ReceiptModal open={printing.open} onClose={() => setPrinting({ open: false, ret: null })} title={`Struk retur ${printing.ret?.return_number ?? ''}`}>
                {printing.ret && <ReturnReceipt ret={printing.ret} store={store} />}
            </ReceiptModal>
        </>
    );
};

export default SalesReturnIndex;
