import { useNavigate } from 'react-router';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import IconButton from '@/components/ui/IconButton';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { errorMessage } from '@/services/api.service';
import { transactionService } from '@/services/sales.service';
import { useAppSelector } from '@/store';
import type { HeldItem, HeldListData } from '@/types/sales.types';
import { formatDateTime, formatNumber, formatRupiah } from '@/utils/format';
import { confirmDialog, toast } from '@/utils/toast';

const TABS = [
    { value: 'tab', label: 'Open Tab', hint: 'Pesanan dengan no. referensi' },
    { value: 'customer', label: 'Pesanan Pelanggan', hint: 'Pesanan atas nama pelanggan, tanpa no. referensi' },
] as const;

type Tab = (typeof TABS)[number]['value'];

/** F12: held orders in two lists; load into the POS cart, pay, or delete. */
const HeldIndex = () => {
    const navigate = useNavigate();
    const currency = useAppSelector((s) => s.setting.store?.currency_symbol);
    const list = usePaginatedList<HeldItem, HeldListData, { type: Tab }>({
        fetcher: (params, signal) => transactionService.held(params, signal),
        select: (d) => d.transactions,
        initialFilters: { type: 'tab' },
    });

    const handleDelete = async (h: HeldItem) => {
        const ok = await confirmDialog({
            title: `Hapus pesanan ${h.ref_number ?? h.customer_name ?? `#${h.id}`}?`,
            text: 'Pesanan tertunda yang dihapus tidak bisa dikembalikan.',
            confirmText: 'Hapus',
            danger: true,
        });
        if (!ok) return;
        try {
            const res = await transactionService.removeHeld(h.id);
            toast.success(res.message);
            list.reload();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const columns: Column<HeldItem>[] = [
        {
            key: 'name',
            header: list.filters.type === 'tab' ? 'No. referensi' : 'Pelanggan',
            render: (h) => (
                <div>
                    <span className="font-medium">{h.ref_number ?? h.customer_name ?? `#${h.id}`}</span>
                    {h.ref_number && h.customer_name && <span className="block text-xs text-gray-500">{h.customer_name}</span>}
                </div>
            ),
        },
        { key: 'item_count', header: 'Item', className: 'text-right', render: (h) => formatNumber(h.item_count) },
        { key: 'total', header: 'Total', className: 'text-right', render: (h) => formatRupiah(h.total, currency) },
        { key: 'creator_name', header: 'Dibuat oleh' },
        { key: 'created_at', header: 'Waktu', render: (h) => formatDateTime(h.created_at) },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (h) => {
                const name = h.ref_number ?? h.customer_name ?? `#${h.id}`;
                return (
                    <div className="flex justify-end gap-[6px]">
                        <IconButton icon="shopping_cart" label={`Muat ${name} ke keranjang`} onClick={() => navigate('/app', { state: { heldId: h.id } })} />
                        <IconButton icon="payments" tone="success" label={`Bayar ${name}`} onClick={() => navigate('/app', { state: { heldId: h.id, pay: true } })} />
                        <IconButton icon="delete" tone="danger" label={`Hapus ${name}`} onClick={() => handleDelete(h)} />
                    </div>
                );
            },
        },
    ];

    const active = TABS.find((t) => t.value === list.filters.type)!;

    return (
        <>
            <PageHeader title="Pesanan Tertunda" breadcrumbs={[{ label: 'Kasir' }, { label: 'Pesanan Tertunda' }]} />
            <Card>
                <div className="sm:flex items-center justify-between gap-[15px] mb-[20px]">
                    <div role="tablist" aria-label="Jenis pesanan" className="flex gap-[6px] mb-[12px] sm:mb-0">
                        {TABS.map((t) => (
                            <button
                                key={t.value}
                                type="button"
                                role="tab"
                                aria-selected={list.filters.type === t.value}
                                onClick={() => list.setFilters({ type: t.value })}
                                className={`px-[16px] py-[8px] rounded-md font-medium transition-all ${
                                    list.filters.type === t.value ? 'bg-primary-500 text-white' : 'bg-gray-50 dark:bg-[#15203c] text-black dark:text-white hover:bg-gray-100'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cari no. ref atau pelanggan…" />
                </div>
                <p className="!mb-[15px] text-sm">{active.hint}. Stok tidak dipesan; dihitung ulang saat dibayar.</p>
                <div role="tabpanel">
                    <DataTable
                        columns={columns}
                        rows={list.rows}
                        rowKey={(h) => h.id}
                        loading={list.loading}
                        pagination={list.pagination}
                        onPageChange={list.setPage}
                        emptyText="Tidak ada pesanan tertunda"
                    />
                </div>
            </Card>
        </>
    );
};

export default HeldIndex;
