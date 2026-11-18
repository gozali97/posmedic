import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import PageHeader from '@/components/ui/PageHeader';
import MarkPaidModal from '@/pages/Payables/MarkPaidModal';
import { errorMessage } from '@/services/api.service';
import { purchaseService } from '@/services/stock.service';
import type { Purchase, PurchaseItem } from '@/types/stock.types';
import { formatDate, formatDateTime, formatNumber, formatRupiah, toJakartaDateString } from '@/utils/format';
import PaymentBadge from './PaymentBadge';

const Info = ({ label, children }: { label: string; children: ReactNode }) => (
    <div>
        <dt className="text-sm text-gray-500">{label}</dt>
        <dd className="text-black dark:text-white font-medium">{children}</dd>
    </div>
);

const PurchaseDetail = () => {
    const { id } = useParams();
    const purchaseId = Number(id);
    const [purchase, setPurchase] = useState<Purchase | null>(null);
    const [loadError, setLoadError] = useState('');
    const [paying, setPaying] = useState(false);

    const load = useCallback(
        (signal?: AbortSignal) => {
            if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
                setLoadError('ID penerimaan tidak valid');
                return;
            }
            purchaseService
                .detail(purchaseId, signal)
                .then((res) => setPurchase(res.data!))
                .catch((err) => {
                    if (!signal?.aborted) setLoadError(errorMessage(err));
                });
        },
        [purchaseId],
    );

    useEffect(() => {
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load]);

    if (loadError || !purchase) {
        return (
            <>
                <PageHeader title="Detail Penerimaan" breadcrumbs={[{ label: 'Penerimaan Barang', to: '/purchases' }, { label: 'Detail' }]} />
                <Card>{loadError ? <p className="text-danger-500 !mb-0">{loadError}</p> : <p className="!mb-0">Memuat data penerimaan…</p>}</Card>
            </>
        );
    }

    const overdue = purchase.payment_status === 'unpaid' && purchase.due_date < toJakartaDateString();

    const columns: Column<PurchaseItem>[] = [
        {
            key: 'product',
            header: 'Produk',
            render: (i) =>
                i.product ? (
                    <Link to={`/products/${i.product_id}`} className="font-medium hover:text-primary-500">
                        {i.product.name}
                    </Link>
                ) : (
                    `#${i.product_id}`
                ),
        },
        { key: 'quantity', header: 'Qty', className: 'text-right', render: (i) => `${formatNumber(i.quantity)} ${i.unit_name}` },
        { key: 'conversion', header: 'Isi', className: 'text-right', render: (i) => (i.conversion_qty > 1 ? `× ${formatNumber(i.conversion_qty)}` : '-') },
        { key: 'unit_cost', header: 'Harga / satuan', className: 'text-right', render: (i) => formatRupiah(i.unit_cost) },
        { key: 'line_total', header: 'Subtotal', className: 'text-right', render: (i) => formatRupiah(i.line_total) },
        { key: 'batch_number', header: 'No. batch' },
        { key: 'expiration_date', header: 'ED', render: (i) => formatDate(i.expiration_date) },
    ];

    return (
        <>
            <PageHeader
                title={`Faktur ${purchase.invoice_number}`}
                breadcrumbs={[{ label: 'Penerimaan Barang', to: '/purchases' }, { label: purchase.invoice_number }]}
                actions={
                    purchase.payment_status === 'unpaid' && (
                        <Button variant="success" icon="payments" onClick={() => setPaying(true)}>
                            Tandai lunas
                        </Button>
                    )
                }
            />
            <Card>
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[15px]">
                    <Info label="Supplier">{purchase.supplier?.name ?? `#${purchase.supplier_id}`}</Info>
                    <Info label="Tanggal faktur">{formatDate(purchase.invoice_date)}</Info>
                    <Info label="Jatuh tempo">{formatDate(purchase.due_date)}</Info>
                    <Info label="Pembayaran">
                        <PaymentBadge status={purchase.payment_status} overdue={overdue} />
                    </Info>
                    <Info label="Total">{formatRupiah(purchase.total)}</Info>
                    <Info label="Diinput oleh">
                        {purchase.user?.fullname ?? '-'} · {formatDateTime(purchase.created_at)}
                    </Info>
                    {purchase.paid_at && <Info label="Tanggal bayar">{formatDate(purchase.paid_at)}</Info>}
                    {purchase.payment_note && <Info label="Catatan pembayaran">{purchase.payment_note}</Info>}
                    {purchase.note && <Info label="Catatan">{purchase.note}</Info>}
                </dl>
            </Card>
            <Card title="Item">
                <DataTable columns={columns} rows={purchase.items ?? []} rowKey={(i) => i.id} />
            </Card>
            <MarkPaidModal purchase={paying ? purchase : null} supplierName={purchase.supplier?.name} onClose={() => setPaying(false)} onPaid={() => load()} />
        </>
    );
};

export default PurchaseDetail;
