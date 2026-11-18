import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import ReceiptModal from '@/components/print/ReceiptModal';
import { ReturnReceipt, TransactionReceipt, returnQtyText } from '@/components/print/Receipts';
import { DrugClassBadge } from '@/components/ProductBadges';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import IconButton from '@/components/ui/IconButton';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import Textarea from '@/components/ui/Textarea';
import { errorMessage } from '@/services/api.service';
import { salesReturnService, transactionService } from '@/services/sales.service';
import { useAppSelector } from '@/store';
import { paymentMethodLabel, type ReturnPayload, type SalesReturn, type Transaction } from '@/types/sales.types';
import { formatDateTime, formatNumber, formatRupiah } from '@/utils/format';
import { toast } from '@/utils/toast';
import ReturnModal from './ReturnModal';
import StatusBadge from './StatusBadge';

const th = 'font-medium text-left px-[15px] py-[11px] bg-gray-50 dark:bg-[#15203c] whitespace-nowrap';
const td = 'px-[15px] py-[12px] border-b border-gray-100 dark:border-[#172036]';

type Printing = { kind: 'sale' } | { kind: 'return'; ret: SalesReturn | null } | null;

/** F14/F15: receipt and reprint, void (same open shift, no returns, BR7), partial returns with return receipts. */
const TransactionDetail = () => {
    const { id } = useParams();
    const store = useAppSelector((s) => s.setting.store);
    const currency = store?.currency_symbol;
    const money = (n: number) => formatRupiah(n, currency);
    const [trx, setTrx] = useState<Transaction | null>(null);
    const [error, setError] = useState('');
    const [modal, setModal] = useState<'void' | 'return' | null>(null);
    const [voidReason, setVoidReason] = useState('');
    const [voidError, setVoidError] = useState('');
    const [busy, setBusy] = useState(false);
    const [printing, setPrinting] = useState<Printing>(null);

    const load = useCallback(() => {
        const controller = new AbortController();
        transactionService
            .detail(Number(id), controller.signal)
            .then((res) => setTrx(res.data ?? null))
            .catch((err) => {
                if (!controller.signal.aborted) setError(errorMessage(err, 'Gagal memuat transaksi'));
            });
        return () => controller.abort();
    }, [id]);

    useEffect(load, [load]);

    if (error) {
        return (
            <>
                <PageHeader title="Transaksi" breadcrumbs={[{ label: 'Transaksi', to: '/transactions' }, { label: `#${id}` }]} />
                <Card>
                    <p className="!mb-0">{error}</p>
                </Card>
            </>
        );
    }
    if (!trx) return <p className="text-center py-[40px] text-gray-500">Memuat transaksi…</p>;

    const returns = trx.returns ?? [];
    const canVoid = trx.status === 'paid' && returns.length === 0;
    const canReturn = trx.status === 'paid' && (trx.items ?? []).some((it) => it.quantity * it.conversion_qty > it.returned_base_quantity);
    const title = trx.invoice_number ?? trx.ref_number ?? `#${trx.id}`;

    const handleVoid = async (e: FormEvent) => {
        e.preventDefault();
        if (!voidReason.trim()) {
            setVoidError('Alasan void wajib diisi');
            return;
        }
        setBusy(true);
        try {
            const res = await transactionService.void(trx.id, { reason: voidReason.trim() });
            toast.success(res.message);
            if (res.data) setTrx(res.data);
            setModal(null);
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const handleReturn = async (body: ReturnPayload) => {
        setBusy(true);
        try {
            const res = await transactionService.createReturn(trx.id, body);
            toast.success(res.message);
            setModal(null);
            load();
            if (res.data) setPrinting({ kind: 'return', ret: res.data });
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const printReturn = async (retId: number) => {
        setPrinting({ kind: 'return', ret: null });
        try {
            const res = await salesReturnService.detail(retId);
            setPrinting({ kind: 'return', ret: res.data ?? null });
        } catch (err) {
            toast.error(errorMessage(err));
            setPrinting(null);
        }
    };

    return (
        <>
            <PageHeader
                title={title}
                breadcrumbs={[{ label: 'Transaksi & Laporan', to: '/transactions' }, { label: title }]}
                actions={
                    <>
                        {trx.status !== 'held' && (
                            <Button variant="outline" size="sm" icon="print" onClick={() => setPrinting({ kind: 'sale' })}>
                                Cetak ulang struk
                            </Button>
                        )}
                        {canReturn && (
                            <Button variant="secondary" size="sm" icon="assignment_return" onClick={() => setModal('return')}>
                                Retur
                            </Button>
                        )}
                        {canVoid && (
                            <Button
                                variant="danger"
                                size="sm"
                                icon="block"
                                onClick={() => {
                                    setVoidReason('');
                                    setVoidError('');
                                    setModal('void');
                                }}
                            >
                                Void
                            </Button>
                        )}
                    </>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-[25px]">
                <Card title="Info" className="lg:col-span-1">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-[15px] gap-y-[8px] text-sm">
                        <dt>Status</dt>
                        <dd>
                            <StatusBadge status={trx.status} returnCount={returns.length} />
                        </dd>
                        <dt>Tanggal</dt>
                        <dd className="text-black dark:text-white">{formatDateTime(trx.paid_at ?? trx.created_at)}</dd>
                        {trx.ref_number && (
                            <>
                                <dt>No. ref</dt>
                                <dd className="text-black dark:text-white">{trx.ref_number}</dd>
                            </>
                        )}
                        <dt>Kasir</dt>
                        <dd className="text-black dark:text-white">{trx.cashier?.fullname ?? trx.creator?.fullname ?? '-'}</dd>
                        <dt>Till</dt>
                        <dd className="text-black dark:text-white">{trx.till ? `${trx.till.number} – ${trx.till.name}` : trx.till_id}</dd>
                        <dt>Shift</dt>
                        <dd className="text-black dark:text-white">{trx.shift_id ? `#${trx.shift_id}` : '-'}</dd>
                        <dt>Pelanggan</dt>
                        <dd className="text-black dark:text-white">{trx.customer?.name ?? '-'}</dd>
                        {(trx.prescription_number || trx.prescription_note) && (
                            <>
                                <dt>Resep</dt>
                                <dd className="text-black dark:text-white">
                                    {trx.prescription_number ?? '-'}
                                    {trx.prescription_note && <span className="block text-gray-500">{trx.prescription_note}</span>}
                                </dd>
                            </>
                        )}
                        <dt>Pembayaran</dt>
                        <dd className="text-black dark:text-white">
                            {paymentMethodLabel(trx.payment_method)}
                            {trx.payment_info && <span className="block text-gray-500">{trx.payment_info}</span>}
                        </dd>
                        {trx.status === 'void' && (
                            <>
                                <dt>Void</dt>
                                <dd className="text-danger-500">
                                    {formatDateTime(trx.voided_at)} · {trx.void_reason}
                                </dd>
                            </>
                        )}
                    </dl>
                </Card>

                <Card title="Item" className="lg:col-span-2">
                    <div className="overflow-x-auto">
                        <table className="w-full text-black dark:text-white">
                            <thead>
                                <tr>
                                    <th className={`${th} rounded-tl-md`}>Produk</th>
                                    <th className={`${th} text-right`}>Qty</th>
                                    <th className={`${th} text-right`}>Harga</th>
                                    <th className={`${th} text-right`}>Diskon</th>
                                    <th className={`${th} text-right rounded-tr-md`}>Jumlah</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(trx.items ?? []).map((it) => (
                                    <tr key={it.id}>
                                        <td className={td}>
                                            <span className="font-medium">{it.product_name}</span> {it.drug_class !== 'bebas' && <DrugClassBadge value={it.drug_class} />}
                                            {it.returned_base_quantity > 0 && (
                                                <span className="block text-xs text-warning-900 dark:text-warning-300">Diretur {returnQtyText(it.returned_base_quantity, it)}</span>
                                            )}
                                        </td>
                                        <td className={`${td} text-right whitespace-nowrap`}>
                                            {formatNumber(it.quantity)} {it.unit_name}
                                        </td>
                                        <td className={`${td} text-right whitespace-nowrap`}>{money(it.price)}</td>
                                        <td className={`${td} text-right whitespace-nowrap`}>{it.discount_share ? `-${money(it.discount_share)}` : '-'}</td>
                                        <td className={`${td} text-right whitespace-nowrap`}>{money(it.line_total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <dl className="mt-[15px] ml-auto max-w-[320px] space-y-[6px]">
                        <div className="flex justify-between">
                            <dt>Subtotal</dt>
                            <dd className="text-black dark:text-white">{money(trx.subtotal)}</dd>
                        </div>
                        {trx.discount > 0 && (
                            <div className="flex justify-between">
                                <dt>Diskon</dt>
                                <dd className="text-black dark:text-white">-{money(trx.discount)}</dd>
                            </div>
                        )}
                        <div className="flex justify-between font-semibold text-lg">
                            <dt className="text-black dark:text-white">Total</dt>
                            <dd className="text-black dark:text-white">{money(trx.total)}</dd>
                        </div>
                        {trx.ppn_rate > 0 && (
                            <div className="flex justify-between text-sm">
                                <dt>DPP / PPN {formatNumber(trx.ppn_rate)}% (termasuk)</dt>
                                <dd>
                                    {money(trx.dpp)} / {money(trx.ppn)}
                                </dd>
                            </div>
                        )}
                        {trx.payment_method && (
                            <>
                                <div className="flex justify-between">
                                    <dt>Dibayar</dt>
                                    <dd className="text-black dark:text-white">{money(trx.paid)}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt>Kembali</dt>
                                    <dd className="text-black dark:text-white">{money(trx.change)}</dd>
                                </div>
                            </>
                        )}
                    </dl>
                </Card>
            </div>

            {returns.length > 0 && (
                <Card title="Retur">
                    <div className="overflow-x-auto">
                        <table className="w-full text-black dark:text-white">
                            <thead>
                                <tr>
                                    <th className={`${th} rounded-tl-md`}>No. retur</th>
                                    <th className={th}>Tanggal</th>
                                    <th className={th}>Petugas</th>
                                    <th className={th}>Alasan</th>
                                    <th className={th}>Metode</th>
                                    <th className={`${th} text-right`}>Refund</th>
                                    <th className={`${th} rounded-tr-md`}>
                                        <span className="sr-only">Aksi</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {returns.map((r) => (
                                    <tr key={r.id}>
                                        <td className={`${td} font-medium whitespace-nowrap`}>{r.return_number}</td>
                                        <td className={`${td} whitespace-nowrap`}>{formatDateTime(r.created_at)}</td>
                                        <td className={td}>{r.user?.fullname ?? '-'}</td>
                                        <td className={td}>{r.reason}</td>
                                        <td className={td}>
                                            <Badge color="gray">{paymentMethodLabel(r.refund_method)}</Badge>
                                        </td>
                                        <td className={`${td} text-right whitespace-nowrap`}>{money(r.total_refund)}</td>
                                        <td className={`${td} text-right`}>
                                            <IconButton icon="print" label={`Cetak struk retur ${r.return_number}`} onClick={() => printReturn(r.id)} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            <Modal
                open={modal === 'void'}
                onClose={() => setModal(null)}
                title={`Void ${title}`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModal(null)}>
                            Batal
                        </Button>
                        <Button type="submit" form="void-form" variant="danger" icon="block" loading={busy}>
                            Void transaksi
                        </Button>
                    </>
                }
            >
                <form id="void-form" onSubmit={handleVoid} noValidate className="space-y-[15px]">
                    <p className="!mb-0">Stok dikembalikan ke batch asal. Void hanya bisa selama shift transaksi masih terbuka dan belum ada retur; setelah itu gunakan retur.</p>
                    <Textarea
                        label="Alasan"
                        required
                        rows={3}
                        maxLength={500}
                        value={voidReason}
                        onChange={(e) => {
                            setVoidReason(e.target.value);
                            setVoidError('');
                        }}
                        error={voidError}
                        autoFocus
                    />
                </form>
            </Modal>

            <ReturnModal open={modal === 'return'} trx={trx} currency={currency} loading={busy} onClose={() => setModal(null)} onSubmit={handleReturn} />

            <ReceiptModal open={printing !== null} onClose={() => setPrinting(null)} title={printing?.kind === 'return' ? `Struk retur ${printing.ret?.return_number ?? ''}` : `Struk ${title}`}>
                {printing?.kind === 'sale' ? <TransactionReceipt trx={trx} store={store} /> : printing?.kind === 'return' && printing.ret ? <ReturnReceipt ret={printing.ret} store={store} /> : null}
            </ReceiptModal>
        </>
    );
};

export default TransactionDetail;
