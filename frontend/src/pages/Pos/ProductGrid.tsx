import { useEffect, useState } from 'react';
import { DrugClassBadge } from '@/components/ProductBadges';
import ProductImage from '@/components/ProductImage';
import Pagination from '@/components/ui/Pagination';
import SearchInput from '@/components/ui/SearchInput';
import { storageUrl } from '@/config/api';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { categoryService, productService } from '@/services/master.service';
import type { CategoryItem, ProductItem, ProductListData } from '@/types/master.types';
import { formatRupiah } from '@/utils/format';
import { formatStock } from '@/utils/stock';

interface ProductGridProps {
    onPick: (product: ProductItem) => void;
    /** Bump to refetch (stock changed after a sale). */
    reloadKey: number;
    currency?: string;
}

/** Right side of the POS (F10), from Trezo eCommerce/ProductsGrid: search by brand, generic name or barcode, filter by category. */
const ProductGrid = ({ onPick, reloadKey, currency }: ProductGridProps) => {
    const [categories, setCategories] = useState<CategoryItem[]>([]);
    const list = usePaginatedList<ProductItem, ProductListData, { category_id: number | '' }>({
        fetcher: (params, signal) => productService.list(params, signal),
        select: (d) => d.products,
        initialFilters: { category_id: '' },
        perPage: 24,
    });
    const { reload } = list;

    useEffect(() => {
        categoryService
            .all()
            .then((res) => setCategories(res.data?.categories ?? []))
            .catch(() => setCategories([]));
    }, []);

    useEffect(() => {
        if (reloadKey > 0) reload();
    }, [reloadKey, reload]);

    return (
        <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
            <div className="flex flex-wrap gap-[10px] mb-[20px]">
                <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cari nama, zat aktif, atau barcode…" className="flex-1 min-w-[220px]" />
                <label className="sr-only" htmlFor="pos-category">
                    Kategori
                </label>
                <select
                    id="pos-category"
                    className="bg-gray-50 border border-gray-50 h-[36px] text-xs rounded-md px-[10px] text-black dark:bg-[#15203c] dark:text-white dark:border-[#15203c] outline-0 focus:border-primary-500"
                    value={list.filters.category_id}
                    onChange={(e) => list.setFilters({ category_id: e.target.value ? Number(e.target.value) : '' })}
                >
                    <option value="">Semua kategori</option>
                    {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                        </option>
                    ))}
                </select>
            </div>

            {list.loading && list.rows.length === 0 ? (
                <p className="text-center py-[40px] !mb-0 text-gray-500">Memuat produk…</p>
            ) : list.rows.length === 0 ? (
                <p className="text-center py-[40px] !mb-0 text-gray-500">Produk tidak ditemukan</p>
            ) : (
                <ul className={`grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-[12px] ${list.loading ? 'opacity-60' : ''}`} aria-busy={list.loading}>
                    {list.rows.map((p) => {
                        const base = p.units.find((u) => u.is_base);
                        const soldOut = p.track_stock && p.sellable_stock <= 0;
                        const image = storageUrl(p.image);
                        return (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => onPick(p)}
                                    disabled={soldOut}
                                    className="w-full h-full text-left rounded-md border border-gray-100 dark:border-[#172036] p-[10px] transition-all hover:border-primary-500 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-100 flex flex-col"
                                    aria-label={`${p.name}${soldOut ? ', stok habis' : ''}`}
                                >
                                    <div className="aspect-[4/3] rounded-md bg-gray-50 dark:bg-[#15203c] mb-[8px] flex items-center justify-center overflow-hidden">
                                        <ProductImage src={image} alt="" loading="lazy" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="font-semibold text-black dark:text-white leading-tight line-clamp-2">{p.name}</span>
                                    {p.generic_name && <span className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{p.generic_name}</span>}
                                    <span className="flex flex-wrap items-center gap-[4px] mt-[6px]">
                                        <DrugClassBadge value={p.drug_class} />
                                        {p.shelf_location && <span className="text-xs text-gray-500">Rak {p.shelf_location}</span>}
                                    </span>
                                    <span className="mt-auto pt-[6px] flex items-end justify-between gap-[6px]">
                                        <span className="text-primary-500 font-semibold">
                                            {formatRupiah(base?.price, currency)}
                                            <span className="text-xs text-gray-500 font-normal">/{base?.name}</span>
                                        </span>
                                    </span>
                                    <span className={`text-xs ${soldOut ? 'text-danger-500' : p.stock_status === 'low' ? 'text-warning-900 dark:text-warning-300' : 'text-gray-500'}`}>
                                        {!p.track_stock ? 'Tanpa stok' : soldOut ? 'Stok habis' : `Stok ${formatStock(p.sellable_stock, p.units)}`}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {list.pagination && list.pagination.total_pages > 1 && (
                <div className="mt-[15px]">
                    <Pagination meta={list.pagination} onPageChange={list.setPage} />
                </div>
            )}
        </div>
    );
};

export default ProductGrid;
