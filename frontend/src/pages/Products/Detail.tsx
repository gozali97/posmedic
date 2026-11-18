import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { DrugClassBadge, ExpiryBadge, StockStatusBadge } from '@/components/ProductBadges';
import Badge, { type BadgeColor } from '@/components/ui/Badge';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import PageHeader from '@/components/ui/PageHeader';
import { storageUrl } from '@/config/api';
import ProductImage from '@/components/ProductImage';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { errorMessage } from '@/services/api.service';
import { productService } from '@/services/master.service';
import type { ProductBatch, ProductDetail, ProductUnit, StockMovement, StockMovementListData } from '@/types/master.types';
import { ADJUSTMENT_REASONS } from '@/types/stock.types';
import { formatDate, formatDateTime, formatNumber, formatRupiah } from '@/utils/format';
import { formatStock, formatStockFull } from '@/utils/stock';
import BarcodePrint from './BarcodePrint';

const MOVEMENT: Record<string, { label: string; color: BadgeColor }> = {
    purchase: { label: 'Penerimaan', color: 'success' },
    sale: { label: 'Penjualan', color: 'primary' },
    void: { label: 'Void', color: 'gray' },
    return: { label: 'Retur', color: 'info' },
    adjustment: { label: 'Penyesuaian', color: 'warning' },
    opname: { label: 'Opname', color: 'purple' },
};

const reasonLabel = (r: string | null) => ADJUSTMENT_REASONS.find((a) => a.value === r)?.label ?? r;

const Info = ({ label, children }: { label: string; children: ReactNode }) => (
    <div>
        <dt className="text-sm text-gray-500">{label}</dt>
        <dd className="text-black dark:text-white font-medium">{children}</dd>
    </div>
);

const StockMovements = ({ productId, units }: { productId: number; units: ProductUnit[] }) => {
    const list = usePaginatedList<StockMovement, StockMovementListData>({
        fetcher: (params, signal) => productService.stockMovements(productId, params, signal),
        select: (d) => d.stock_movements,
    });
    const columns: Column<StockMovement>[] = [
        { key: 'created_at', header: 'Waktu', render: (m) => formatDateTime(m.created_at) },
        {
            key: 'type',
            header: 'Jenis',
            render: (m) => (
                <div className="flex flex-wrap gap-[4px]">
                    <Badge color={MOVEMENT[m.type]?.color ?? 'gray'}>{MOVEMENT[m.type]?.label ?? m.type}</Badge>
                    {m.reason && <Badge color="gray">{reasonLabel(m.reason)}</Badge>}
                </div>
            ),
        },
        { key: 'batch', header: 'Batch', render: (m) => m.batch_number ?? '-' },
        {
            key: 'quantity',
            header: 'Qty',
            className: 'text-right',
            render: (m) => <span className={m.quantity < 0 ? 'text-danger-500' : 'text-success-600'}>{`${m.quantity > 0 ? '+' : ''}${formatStock(m.quantity, units)}`}</span>,
        },
        { key: 'stock_after', header: 'Stok batch setelah', className: 'text-right', render: (m) => formatNumber(m.stock_after) },
        { key: 'user', header: 'User', render: (m) => m.username ?? '-' },
        { key: 'note', header: 'Catatan', render: (m) => <span className="block max-w-[260px] truncate">{m.note ?? '-'}</span> },
    ];
    return <DataTable columns={columns} rows={list.rows} rowKey={(m) => m.id} loading={list.loading} pagination={list.pagination} onPageChange={list.setPage} emptyText="Belum ada pergerakan stok" />;
};

const ProductDetailPage = () => {
    const { id } = useParams();
    const productId = Number(id);
    const [product, setProduct] = useState<ProductDetail | null>(null);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        if (!Number.isInteger(productId) || productId <= 0) {
            setLoadError('ID produk tidak valid');
            return;
        }
        const controller = new AbortController();
        productService
            .detail(productId, controller.signal)
            .then((res) => setProduct(res.data!))
            .catch((err) => {
                if (!controller.signal.aborted) setLoadError(errorMessage(err));
            });
        return () => controller.abort();
    }, [productId]);

    if (loadError || !product) {
        return (
            <>
                <PageHeader title="Detail Produk" breadcrumbs={[{ label: 'Produk', to: '/products' }, { label: 'Detail' }]} />
                <Card>{loadError ? <p className="text-danger-500 !mb-0">{loadError}</p> : <p className="!mb-0">Memuat data produk…</p>}</Card>
            </>
        );
    }

    const img = storageUrl(product.image);
    const units = [...product.units].sort((a, b) => a.conversion_qty - b.conversion_qty);
    const baseUnit = units.find((u) => u.is_base)?.name ?? '';

    const unitColumns: Column<ProductUnit>[] = [
        { key: 'name', header: 'Satuan', render: (u) => <span className="font-medium">{u.name}</span> },
        {
            key: 'conversion_qty',
            header: 'Konversi',
            className: 'text-right',
            render: (u) => (u.is_base ? <Badge color="primary">Satuan dasar</Badge> : `${formatNumber(u.conversion_qty)} ${baseUnit}`),
        },
        { key: 'price', header: 'Harga jual', className: 'text-right', render: (u) => formatRupiah(u.price) },
        { key: 'barcode', header: 'Barcode', render: (u) => u.barcode ?? '-' },
    ];

    const batchColumns: Column<ProductBatch>[] = [
        { key: 'batch_number', header: 'No. batch', render: (b) => <span className="font-medium">{b.batch_number}</span> },
        { key: 'expiration_date', header: 'ED', render: (b) => formatDate(b.expiration_date) },
        { key: 'quantity', header: 'Qty', className: 'text-right', render: (b) => formatStock(b.quantity, units) },
        { key: 'cost_price', header: `HPP / ${baseUnit}`, className: 'text-right', render: (b) => formatRupiah(b.cost_price) },
        { key: 'source', header: 'Asal', render: (b) => (b.source === 'purchase' ? 'Penerimaan' : 'Opname') },
    ];

    return (
        <>
            <PageHeader
                title={product.name}
                breadcrumbs={[{ label: 'Produk', to: '/products' }, { label: product.name }]}
                actions={
                    <Link
                        to={`/products/${product.id}/edit`}
                        className="inline-flex items-center gap-[6px] whitespace-nowrap font-medium rounded-md py-[8px] px-[16px] bg-primary-500 text-white transition-all hover:bg-primary-400"
                    >
                        <i className="material-symbols-outlined !text-[20px]">edit</i>
                        Ubah produk
                    </Link>
                }
            />
            <Card>
                <div className="flex flex-col sm:flex-row gap-[25px]">
                    <div className="w-[120px] h-[120px] shrink-0 rounded-md bg-gray-50 dark:bg-[#15203c] flex items-center justify-center overflow-hidden">
                        <ProductImage src={img} alt={product.name} className="max-w-full max-h-full object-contain" />
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[15px] flex-1">
                        <Info label="Nama generik">{product.generic_name ?? '-'}</Info>
                        <Info label="Kategori">{product.category_name ?? '-'}</Info>
                        <Info label="Golongan">
                            <DrugClassBadge value={product.drug_class} />
                        </Info>
                        <Info label="Lokasi rak">{product.shelf_location ?? '-'}</Info>
                        <Info label="Stok minimum">{product.track_stock ? `${formatNumber(product.min_stock)} ${baseUnit}` : '-'}</Info>
                        <Info label="Stok">
                            {product.track_stock ? (
                                <span className="flex flex-wrap items-center gap-[6px]">
                                    {formatStockFull(product.stock, units)} <StockStatusBadge status={product.stock_status} />
                                </span>
                            ) : (
                                'Tidak dilacak (jasa)'
                            )}
                        </Info>
                        {product.track_stock && product.sellable_stock !== product.stock && <Info label="Bisa dijual (belum ED)">{formatStockFull(product.sellable_stock, units)}</Info>}
                        <Info label="ED terdekat">
                            <ExpiryBadge status={product.expiry_status} date={product.nearest_expiry} />
                        </Info>
                    </dl>
                </div>
            </Card>

            <Card title="Satuan & harga">
                <DataTable columns={unitColumns} rows={units} rowKey={(u) => u.id} />
            </Card>

            <Card title="Cetak barcode">
                <BarcodePrint product={product} />
            </Card>

            {product.track_stock && (
                <Card title="Batch berstok">
                    <DataTable columns={batchColumns} rows={product.batches} rowKey={(b) => b.id} emptyText="Belum ada batch berstok" />
                </Card>
            )}

            <Card title="Riwayat pergerakan stok">
                <StockMovements productId={product.id} units={units} />
            </Card>
        </>
    );
};

export default ProductDetailPage;
