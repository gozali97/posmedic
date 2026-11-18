import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import ProductImage from '@/components/ProductImage';
import { DrugClassBadge, EXPIRY_STATUS_OPTIONS, ExpiryBadge, STOCK_STATUS_OPTIONS, StockStatusBadge } from '@/components/ProductBadges';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { filterClass } from '@/components/ui/filters';
import IconButton, { iconButtonClass } from '@/components/ui/IconButton';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import { storageUrl } from '@/config/api';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { errorMessage } from '@/services/api.service';
import { categoryService, productService } from '@/services/master.service';
import { DRUG_CLASSES, type CategoryItem, type ProductItem, type ProductListData, type ProductListParams } from '@/types/master.types';
import { formatRupiah, toJakartaDateString } from '@/utils/format';
import { formatStock } from '@/utils/stock';
import { confirmDialog, toast } from '@/utils/toast';

type Filters = Required<Omit<ProductListParams, 'search'>>;

const EMPTY_FILTERS: Filters = { category_id: '', drug_class: '', stock_status: '', expiry_status: '' };

const ProductIndex = () => {
    const [categories, setCategories] = useState<CategoryItem[]>([]);
    const [exporting, setExporting] = useState(false);
    const list = usePaginatedList<ProductItem, ProductListData, Filters>({
        fetcher: (params, signal) => productService.list(params, signal),
        select: (d) => d.products,
        initialFilters: EMPTY_FILTERS,
    });
    const { filters, setFilters } = list;
    const hasFilters = Object.values(filters).some((v) => v !== '');

    useEffect(() => {
        const controller = new AbortController();
        categoryService
            .all(controller.signal)
            .then((res) => setCategories(res.data?.categories ?? []))
            .catch(() => setCategories([]));
        return () => controller.abort();
    }, []);

    const handleExport = async () => {
        setExporting(true);
        try {
            await productService.export({ ...filters, search: list.search.trim() }, `produk-${toJakartaDateString()}.xlsx`);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal export produk'));
        } finally {
            setExporting(false);
        }
    };

    const handleDelete = async (p: ProductItem) => {
        const ok = await confirmDialog({ title: `Hapus produk ${p.name}?`, text: 'Produk yang masih punya stok tidak bisa dihapus.', confirmText: 'Hapus', danger: true });
        if (!ok) return;
        try {
            const res = await productService.remove(p.id);
            toast.success(res.message);
            list.reload();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const columns: Column<ProductItem>[] = [
        {
            key: 'name',
            header: 'Produk',
            render: (p) => {
                const img = storageUrl(p.image);
                return (
                    <div className="flex items-center gap-[12px]">
                        <div className="w-[44px] h-[44px] shrink-0 rounded-md bg-gray-50 dark:bg-[#15203c] flex items-center justify-center overflow-hidden">
                            <ProductImage src={img} alt="" className="max-w-full max-h-full object-contain" />
                        </div>
                        <div>
                            <Link to={`/products/${p.id}`} className="font-medium hover:text-primary-500">
                                {p.name}
                            </Link>
                            {p.generic_name && <span className="block text-sm text-gray-500">{p.generic_name}</span>}
                        </div>
                    </div>
                );
            },
        },
        { key: 'category', header: 'Kategori', render: (p) => p.category_name ?? '-' },
        { key: 'drug_class', header: 'Golongan', render: (p) => <DrugClassBadge value={p.drug_class} /> },
        { key: 'shelf', header: 'Rak', render: (p) => p.shelf_location ?? '-' },
        {
            key: 'stock',
            header: 'Stok',
            render: (p) =>
                p.track_stock ? (
                    <div>
                        <div className="flex items-center gap-[6px]">
                            <span>{formatStock(p.stock, p.units)}</span>
                            <StockStatusBadge status={p.stock_status} />
                        </div>
                        {p.sellable_stock !== p.stock && <span className="block text-sm text-gray-500">Bisa dijual: {formatStock(p.sellable_stock, p.units)}</span>}
                    </div>
                ) : (
                    <span className="text-gray-500">Tidak dilacak</span>
                ),
        },
        { key: 'expiry', header: 'ED terdekat', render: (p) => <ExpiryBadge status={p.expiry_status} date={p.nearest_expiry} /> },
        {
            key: 'price',
            header: 'Harga dasar',
            className: 'text-right',
            render: (p) => {
                const base = p.units.find((u) => u.is_base);
                return base ? `${formatRupiah(base.price)} / ${base.name}` : '-';
            },
        },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (p) => (
                <div className="flex justify-end gap-[6px]">
                    <Link to={`/products/${p.id}`} className={iconButtonClass('gray')} aria-label={`Detail ${p.name}`} title="Detail">
                        <i className="material-symbols-outlined !text-[20px]">visibility</i>
                    </Link>
                    <Link to={`/products/${p.id}/edit`} className={iconButtonClass()} aria-label={`Ubah ${p.name}`} title="Ubah">
                        <i className="material-symbols-outlined !text-[20px]">edit</i>
                    </Link>
                    <IconButton icon="delete" tone="danger" label={`Hapus ${p.name}`} disabled={p.stock > 0} onClick={() => handleDelete(p)} />
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader title="Produk" breadcrumbs={[{ label: 'Inventori' }, { label: 'Produk' }]} />
            <Card
                title="Daftar produk"
                actions={
                    <>
                        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cari nama, generik, atau barcode…" />
                        <Button size="sm" variant="outline" icon="download" loading={exporting} onClick={handleExport}>
                            Export Excel
                        </Button>
                        <Link
                            to="/products/create"
                            className="inline-flex items-center gap-[6px] whitespace-nowrap font-medium rounded-md py-[7px] px-[16px] bg-primary-500 text-white transition-all hover:bg-primary-400"
                        >
                            <i className="material-symbols-outlined !text-[20px]">add</i>
                            Tambah produk
                        </Link>
                    </>
                }
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[12px] mb-[20px]">
                    <select
                        aria-label="Filter kategori"
                        className={filterClass}
                        value={filters.category_id}
                        onChange={(e) => setFilters({ category_id: e.target.value === '' ? '' : Number(e.target.value) })}
                    >
                        <option value="">Semua kategori</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                    <select aria-label="Filter golongan" className={filterClass} value={filters.drug_class} onChange={(e) => setFilters({ drug_class: e.target.value })}>
                        <option value="">Semua golongan</option>
                        {DRUG_CLASSES.map((c) => (
                            <option key={c.value} value={c.value}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                    <select aria-label="Filter status stok" className={filterClass} value={filters.stock_status} onChange={(e) => setFilters({ stock_status: e.target.value })}>
                        <option value="">Semua status stok</option>
                        {STOCK_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    <select aria-label="Filter status ED" className={filterClass} value={filters.expiry_status} onChange={(e) => setFilters({ expiry_status: e.target.value })}>
                        <option value="">Semua status ED</option>
                        {EXPIRY_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
                {hasFilters && (
                    <div className="mb-[15px]">
                        <Button size="sm" variant="secondary" icon="filter_alt_off" onClick={() => setFilters(EMPTY_FILTERS)}>
                            Reset filter
                        </Button>
                    </div>
                )}
                <DataTable columns={columns} rows={list.rows} rowKey={(p) => p.id} loading={list.loading} pagination={list.pagination} onPageChange={list.setPage} emptyText="Produk tidak ditemukan" />
            </Card>
        </>
    );
};

export default ProductIndex;
