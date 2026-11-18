import type { ReactNode } from 'react';
import { storageUrl } from '@/config/api';
import { paymentMethodLabel, type SalesReturn, type ShiftDetail, type Transaction, type TransactionItem } from '@/types/sales.types';
import type { StoreSetting } from '@/types/setting.types';
import { formatDateTime, formatNumber } from '@/utils/format';

/** Receipt content for 58/80 mm paper (F13). Plain black text; sized by the print root (usePrint) or the preview box. */

const Divider = () => <div style={{ borderTop: '1px dashed #000', margin: '1.5mm 0' }} />;

const Row = ({ label, value, bold = false }: { label: ReactNode; value: ReactNode; bold?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2mm', fontWeight: bold ? 700 : 400 }}>
        <span>{label}</span>
        <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
);

const StoreHeader = ({ store }: { store: StoreSetting | null }) => {
    if (!store) return null;
    const logo = storageUrl(store.logo);
    return (
        <div style={{ textAlign: 'center', lineHeight: 1.35 }}>
            {logo && <img src={logo} alt="" style={{ maxWidth: '60%', maxHeight: '18mm', margin: '0 auto 1mm', display: 'block', filter: 'grayscale(1)' }} />}
            <div style={{ fontWeight: 700, fontSize: '1.2em' }}>{store.store_name}</div>
            <div>{store.address_one}</div>
            {store.address_two && <div>{store.address_two}</div>}
            <div>Telp. {store.contact}</div>
            <div>SIA: {store.sia_number}</div>
            <div>
                Apoteker: {store.pharmacist_name} · SIPA: {store.sipa_number}
            </div>
            {store.is_pkp && store.tax_number && <div>NPWP: {store.tax_number}</div>}
        </div>
    );
};

const Footer = ({ store }: { store: StoreSetting | null }) =>
    store?.receipt_footer ? (
        <>
            <Divider />
            <div style={{ textAlign: 'center', whiteSpace: 'pre-line' }}>{store.receipt_footer}</div>
        </>
    ) : null;

const money = (n: number) => formatNumber(n);
/** Deduction shown with a minus sign, except zero. */
const minus = (n: number) => (n ? `-${money(n)}` : money(0));

interface TransactionReceiptProps {
    trx: Transaction;
    store: StoreSetting | null;
    /** Pre-bill printed from the cart before payment. */
    draft?: boolean;
}

export const TransactionReceipt = ({ trx, store, draft = false }: TransactionReceiptProps) => (
    <div style={{ fontFamily: 'inherit', lineHeight: 1.35 }}>
        <StoreHeader store={store} />
        <Divider />
        {draft && <div style={{ textAlign: 'center', fontWeight: 700 }}>PRA-STRUK · BELUM DIBAYAR</div>}
        {trx.status === 'void' && <div style={{ textAlign: 'center', fontWeight: 700 }}>*** VOID ***</div>}
        {trx.invoice_number && <Row label="No." value={trx.invoice_number} />}
        {trx.ref_number && <Row label="Ref." value={trx.ref_number} />}
        <Row label="Tanggal" value={formatDateTime(trx.paid_at ?? trx.created_at)} />
        {(trx.cashier ?? trx.creator) && <Row label="Kasir" value={(trx.cashier ?? trx.creator)!.fullname} />}
        {trx.till && <Row label="Till" value={`${trx.till.number} – ${trx.till.name}`} />}
        {trx.customer && <Row label="Pelanggan" value={trx.customer.name} />}
        {trx.prescription_number && <Row label="No. resep" value={trx.prescription_number} />}
        <Divider />
        {(trx.items ?? []).map((it) => (
            <div key={it.id} style={{ marginBottom: '1mm' }}>
                <div>{it.product_name}</div>
                <Row label={`${formatNumber(it.quantity)} ${it.unit_name} × ${money(it.price)}`} value={money(it.line_total)} />
            </div>
        ))}
        <Divider />
        <Row label="Subtotal" value={money(trx.subtotal)} />
        {trx.discount > 0 && <Row label="Diskon" value={`-${money(trx.discount)}`} />}
        <Row label="TOTAL" value={money(trx.total)} bold />
        {trx.ppn_rate > 0 && (
            <>
                <Row label="DPP" value={money(trx.dpp)} />
                <Row label={`PPN ${formatNumber(trx.ppn_rate)}% (termasuk)`} value={money(trx.ppn)} />
            </>
        )}
        {!draft && trx.payment_method && (
            <>
                <Divider />
                <Row label={paymentMethodLabel(trx.payment_method)} value={money(trx.paid)} />
                {trx.payment_info && <Row label="Info" value={trx.payment_info} />}
                <Row label="Kembali" value={money(trx.change)} />
            </>
        )}
        {trx.status === 'void' && trx.void_reason && (
            <>
                <Divider />
                <div>Alasan void: {trx.void_reason}</div>
            </>
        )}
        <Footer store={store} />
    </div>
);

/** Returned quantity in the sold unit when it divides evenly, else in base units. */
export const returnQtyText = (baseQty: number, item?: Pick<TransactionItem, 'unit_name' | 'conversion_qty'>): string => {
    if (!item) return `${formatNumber(baseQty)} satuan dasar`;
    if (item.conversion_qty === 1) return `${formatNumber(baseQty)} ${item.unit_name}`;
    if (baseQty % item.conversion_qty === 0) return `${formatNumber(baseQty / item.conversion_qty)} ${item.unit_name}`;
    return `${formatNumber(baseQty)} satuan dasar`;
};

export const ReturnReceipt = ({ ret, store }: { ret: SalesReturn; store: StoreSetting | null }) => (
    <div style={{ lineHeight: 1.35 }}>
        <StoreHeader store={store} />
        <Divider />
        <div style={{ textAlign: 'center', fontWeight: 700 }}>STRUK RETUR</div>
        <Row label="No. retur" value={ret.return_number} />
        <Row label="Invoice asal" value={ret.transaction?.invoice_number ?? '-'} />
        <Row label="Tanggal" value={formatDateTime(ret.created_at)} />
        {ret.user && <Row label="Petugas" value={ret.user.fullname} />}
        {ret.transaction?.customer && <Row label="Pelanggan" value={ret.transaction.customer.name} />}
        <Divider />
        {(ret.items ?? []).map((it) => (
            <div key={it.id} style={{ marginBottom: '1mm' }}>
                <div>{it.transaction_item?.product_name ?? `Item #${it.transaction_item_id}`}</div>
                <Row label={`${returnQtyText(it.base_quantity, it.transaction_item)}${it.restock ? '' : ' (tidak kembali ke stok)'}`} value={money(it.refund_amount)} />
            </div>
        ))}
        <Divider />
        <Row label="TOTAL REFUND" value={money(ret.total_refund)} bold />
        <Row label="Metode refund" value={paymentMethodLabel(ret.refund_method)} />
        <div style={{ marginTop: '1mm' }}>Alasan: {ret.reason}</div>
        <Footer store={store} />
    </div>
);

export const ShiftRecapReceipt = ({ shift, store }: { shift: ShiftDetail; store: StoreSetting | null }) => {
    const recap = shift.recap;
    return (
        <div style={{ lineHeight: 1.35 }}>
            <StoreHeader store={store} />
            <Divider />
            <div style={{ textAlign: 'center', fontWeight: 700 }}>REKAP SHIFT #{shift.id}</div>
            {shift.user && <Row label="Kasir" value={shift.user.fullname} />}
            {shift.till && <Row label="Till" value={`${shift.till.number} – ${shift.till.name}`} />}
            <Row label="Dibuka" value={formatDateTime(shift.opened_at)} />
            <Row label="Ditutup" value={shift.closed_at ? formatDateTime(shift.closed_at) : 'masih terbuka'} />
            {recap && (
                <>
                    {recap.methods.map((m) => (
                        <div key={m.method}>
                            <Divider />
                            <div style={{ fontWeight: 700 }}>{paymentMethodLabel(m.method)}</div>
                            <Row label={`Penjualan (${m.sales_count})`} value={money(m.sales_total)} />
                            <Row label={`Void (${m.void_count})`} value={money(m.void_total)} />
                            <Row label={`Retur (${m.refund_count})`} value={minus(m.refund_total)} />
                            <Row label="Bersih" value={money(m.net_received)} bold />
                        </div>
                    ))}
                    <Divider />
                    <Row label="Modal awal" value={money(recap.opening_cash)} />
                    <Row label="Penjualan tunai" value={money(recap.cash_sales)} />
                    <Row label="Refund tunai" value={minus(recap.cash_refunds)} />
                    <Row label="Kas seharusnya" value={money(shift.expected_cash ?? recap.expected_cash)} bold />
                </>
            )}
            {shift.status === 'closed' && (
                <>
                    <Row label="Kas fisik" value={money(shift.counted_cash ?? 0)} />
                    <Row label="Selisih" value={money(shift.cash_difference ?? 0)} bold />
                    {shift.note && <div style={{ marginTop: '1mm' }}>Catatan: {shift.note}</div>}
                </>
            )}
            <Divider />
            <div style={{ textAlign: 'center' }}>Dicetak {formatDateTime(new Date())}</div>
        </div>
    );
};
