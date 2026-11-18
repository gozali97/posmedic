import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import ReceiptModal from '@/components/print/ReceiptModal';
import { ShiftRecapReceipt } from '@/components/print/Receipts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import PageHeader from '@/components/ui/PageHeader';
import Textarea from '@/components/ui/Textarea';
import { errorMessage } from '@/services/api.service';
import { shiftService } from '@/services/sales.service';
import { useAppSelector } from '@/store';
import { paymentMethodLabel, type ShiftDetail as ShiftDetailData } from '@/types/sales.types';
import { formatDateTime, formatNumber, formatRupiah } from '@/utils/format';
import { confirmDialog, toast } from '@/utils/toast';

const th = 'font-medium text-left px-[15px] py-[11px] bg-gray-50 dark:bg-[#15203c] whitespace-nowrap';
const td = 'px-[15px] py-[12px] border-b border-gray-100 dark:border-[#172036] whitespace-nowrap';

/** F9: recap per payment method, expected cash (BR12), closing by the owner, printable recap. */
const ShiftDetail = () => {
    const { id } = useParams();
    const user = useAppSelector((s) => s.auth.user);
    const store = useAppSelector((s) => s.setting.store);
    const currency = store?.currency_symbol;
    const [shift, setShift] = useState<ShiftDetailData | null>(null);
    const [error, setError] = useState('');
    const [counted, setCounted] = useState('');
    const [note, setNote] = useState('');
    const [countedError, setCountedError] = useState('');
    const [closing, setClosing] = useState(false);
    const [printOpen, setPrintOpen] = useState(false);

    const load = useCallback(() => {
        const controller = new AbortController();
        shiftService
            .detail(Number(id), controller.signal)
            .then((res) => setShift(res.data ?? null))
            .catch((err) => {
                if (!controller.signal.aborted) setError(errorMessage(err, 'Gagal memuat shift'));
            });
        return () => controller.abort();
    }, [id]);

    useEffect(load, [load]);

    const money = (n: number) => formatRupiah(n, currency);

    if (error) {
        return (
            <>
                <PageHeader title="Shift" breadcrumbs={[{ label: 'Shift', to: '/shifts' }, { label: `#${id}` }]} />
                <Card>
                    <p className="!mb-0">{error}</p>
                </Card>
            </>
        );
    }
    if (!shift) return <p className="text-center py-[40px] text-gray-500">Memuat shift…</p>;

    const recap = shift.recap;
    const expected = shift.expected_cash ?? recap?.expected_cash ?? 0;
    const countedValue = counted.trim() === '' ? null : Number(counted);
    const liveDiff = countedValue === null || Number.isNaN(countedValue) ? null : countedValue - expected;
    const canClose = shift.status === 'open' && shift.user_id === user?.id;

    const handleClose = async (e: FormEvent) => {
        e.preventDefault();
        if (countedValue === null || !Number.isInteger(countedValue) || countedValue < 0) {
            setCountedError('Isi kas fisik di laci (rupiah, ≥ 0)');
            return;
        }
        const ok = await confirmDialog({
            title: 'Tutup shift?',
            text: `Kas fisik ${money(countedValue)}, selisih ${money(countedValue - expected)}. Shift yang ditutup tidak bisa dibuka lagi.`,
            confirmText: 'Tutup shift',
            danger: true,
        });
        if (!ok) return;
        setClosing(true);
        try {
            const res = await shiftService.close(shift.id, { counted_cash: countedValue, note: note.trim() });
            toast.success(res.message);
            if (res.data) setShift(res.data);
            setPrintOpen(true);
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setClosing(false);
        }
    };

    return (
        <>
            <PageHeader
                title={`Shift #${shift.id}`}
                breadcrumbs={[{ label: 'Shift', to: '/shifts' }, { label: `#${shift.id}` }]}
                actions={
                    <>
                        {user?.perm_transactions && (
                            <Link to={`/transactions?shift_id=${shift.id}`} className="text-sm font-medium text-primary-500 hover:underline">
                                Transaksi shift ini
                            </Link>
                        )}
                        <Button variant="outline" icon="print" size="sm" onClick={() => setPrintOpen(true)}>
                            Cetak rekap
                        </Button>
                    </>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-[25px]">
                <Card title="Info" className="lg:col-span-1">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-[15px] gap-y-[8px]">
                        <dt>Status</dt>
                        <dd>{shift.status === 'open' ? <Badge color="success">Terbuka</Badge> : <Badge color="gray">Ditutup</Badge>}</dd>
                        <dt>Kasir</dt>
                        <dd className="text-black dark:text-white">{shift.user?.fullname ?? '-'}</dd>
                        <dt>Till</dt>
                        <dd className="text-black dark:text-white">{shift.till ? `${shift.till.number} – ${shift.till.name}` : shift.till_id}</dd>
                        <dt>Dibuka</dt>
                        <dd className="text-black dark:text-white">{formatDateTime(shift.opened_at)}</dd>
                        <dt>Ditutup</dt>
                        <dd className="text-black dark:text-white">{formatDateTime(shift.closed_at)}</dd>
                        {shift.note && (
                            <>
                                <dt>Catatan</dt>
                                <dd className="text-black dark:text-white whitespace-pre-line">{shift.note}</dd>
                            </>
                        )}
                    </dl>
                </Card>

                <Card title="Rekap per metode bayar" className="lg:col-span-2">
                    <div className="overflow-x-auto">
                        <table className="w-full text-black dark:text-white">
                            <thead>
                                <tr>
                                    <th className={`${th} rounded-tl-md`}>Metode</th>
                                    <th className={`${th} text-right`}>Penjualan</th>
                                    <th className={`${th} text-right`}>Void</th>
                                    <th className={`${th} text-right`}>Retur</th>
                                    <th className={`${th} text-right rounded-tr-md`}>Bersih</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(recap?.methods ?? []).map((m) => (
                                    <tr key={m.method}>
                                        <td className={`${td} font-medium`}>{paymentMethodLabel(m.method)}</td>
                                        <td className={`${td} text-right`}>
                                            {money(m.sales_total)} <span className="text-gray-500 text-xs">({formatNumber(m.sales_count)})</span>
                                        </td>
                                        <td className={`${td} text-right`}>
                                            {money(m.void_total)} <span className="text-gray-500 text-xs">({formatNumber(m.void_count)})</span>
                                        </td>
                                        <td className={`${td} text-right`}>
                                            {m.refund_total > 0 ? `-${money(m.refund_total)}` : money(0)} <span className="text-gray-500 text-xs">({formatNumber(m.refund_count)})</span>
                                        </td>
                                        <td className={`${td} text-right font-semibold`}>{money(m.net_received)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="!mt-[10px] !mb-0 text-sm text-gray-500">Transaksi void sudah tidak dihitung di penjualan; kolom Void hanya informasi.</p>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px]">
                <Card title="Kas tunai">
                    <dl className="space-y-[8px]">
                        <div className="flex justify-between">
                            <dt>Modal awal</dt>
                            <dd className="text-black dark:text-white">{money(recap?.opening_cash ?? shift.opening_cash)}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt>+ Penjualan tunai</dt>
                            <dd className="text-black dark:text-white">{money(recap?.cash_sales ?? 0)}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt>− Refund tunai</dt>
                            <dd className="text-black dark:text-white">{money(recap?.cash_refunds ?? 0)}</dd>
                        </div>
                        <div className="flex justify-between border-t border-gray-100 dark:border-[#172036] pt-[8px] font-semibold">
                            <dt className="text-black dark:text-white">Kas seharusnya</dt>
                            <dd className="text-black dark:text-white text-lg" data-testid="expected-cash">
                                {money(expected)}
                            </dd>
                        </div>
                        {shift.status === 'closed' && (
                            <>
                                <div className="flex justify-between">
                                    <dt>Kas fisik</dt>
                                    <dd className="text-black dark:text-white">{money(shift.counted_cash ?? 0)}</dd>
                                </div>
                                <div className="flex justify-between font-semibold">
                                    <dt>Selisih</dt>
                                    <dd className={(shift.cash_difference ?? 0) < 0 ? 'text-danger-500' : 'text-black dark:text-white'}>{money(shift.cash_difference ?? 0)}</dd>
                                </div>
                            </>
                        )}
                    </dl>
                </Card>

                {canClose ? (
                    <Card title="Tutup shift">
                        <form onSubmit={handleClose} noValidate className="space-y-[20px]">
                            <Input
                                label="Kas fisik di laci"
                                required
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={counted}
                                onChange={(e) => {
                                    setCounted(e.target.value.replace(/\D/g, ''));
                                    setCountedError('');
                                }}
                                error={countedError}
                                hint={
                                    liveDiff === null
                                        ? 'Hitung uang tunai di laci, termasuk modal awal.'
                                        : `Selisih ${money(liveDiff)}${liveDiff === 0 ? ' (pas)' : liveDiff < 0 ? ' (kurang)' : ' (lebih)'}`
                                }
                            />
                            <Textarea label="Catatan" maxLength={500} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. selisih karena uang kembalian" />
                            <Button type="submit" variant="danger" icon="lock" loading={closing}>
                                Tutup shift
                            </Button>
                        </form>
                    </Card>
                ) : (
                    shift.status === 'open' && (
                        <Card title="Tutup shift">
                            <p className="!mb-0">Shift hanya bisa ditutup oleh kasir pemiliknya ({shift.user?.fullname ?? `user #${shift.user_id}`}).</p>
                        </Card>
                    )
                )}
            </div>

            <ReceiptModal open={printOpen} onClose={() => setPrintOpen(false)} title={`Rekap shift #${shift.id}`}>
                <ShiftRecapReceipt shift={shift} store={store} />
            </ReceiptModal>
        </>
    );
};

export default ShiftDetail;
