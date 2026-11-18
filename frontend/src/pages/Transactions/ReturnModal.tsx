import { useEffect, useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { PAYMENT_METHODS, type PaymentMethod, type ReturnPayload, type Transaction, type TransactionItem } from '@/types/sales.types';
import { formatNumber, formatRupiah } from '@/utils/format';

interface ReturnModalProps {
    open: boolean;
    trx: Transaction;
    currency?: string;
    loading: boolean;
    onClose: () => void;
    onSubmit: (body: ReturnPayload) => void;
}

interface Row {
    qty: string;
    restock: boolean;
}

const soldBase = (it: TransactionItem) => it.quantity * it.conversion_qty;
const remainingBase = (it: TransactionItem) => soldBase(it) - it.returned_base_quantity;

/** Display estimate of BR10; the server computes the actual refund (the last return of a line takes the remainder). */
const estimateRefund = (it: TransactionItem, qty: number) => {
    const net = it.line_total - it.discount_share;
    if (qty >= remainingBase(it)) {
        // Remainder of the line: net minus what earlier returns would have refunded, approximated pro rata.
        return net - Math.round((net * it.returned_base_quantity) / soldBase(it));
    }
    return Math.round((net * qty) / soldBase(it));
};

const cellInput =
    'w-[90px] h-[36px] text-right rounded-md border border-gray-200 dark:border-[#172036] bg-white dark:bg-[#0c1427] text-black dark:text-white px-[8px] outline-0 focus:border-primary-500';

/** F14: choose items and quantities (base units, ≤ sold − returned), restock per item, reason and refund method. */
const ReturnModal = ({ open, trx, currency, loading, onClose, onSubmit }: ReturnModalProps) => {
    const items = (trx.items ?? []).filter((it) => remainingBase(it) > 0);
    const [rows, setRows] = useState<Record<number, Row>>({});
    const [reason, setReason] = useState('');
    const [method, setMethod] = useState<PaymentMethod>(trx.payment_method ?? 'cash');
    const [errors, setErrors] = useState<{ items?: string; reason?: string; rows?: Record<number, string> }>({});

    useEffect(() => {
        if (!open) return;
        setRows(Object.fromEntries((trx.items ?? []).map((it) => [it.id, { qty: '', restock: true }])));
        setReason('');
        setMethod(trx.payment_method ?? 'cash');
        setErrors({});
    }, [open, trx]);

    const update = (id: number, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

    const chosen = items.map((it) => ({ it, qty: Number(rows[it.id]?.qty || 0), restock: rows[it.id]?.restock ?? true })).filter((r) => r.qty > 0);
    const estimate = chosen.reduce((sum, r) => sum + estimateRefund(r.it, Math.min(r.qty, remainingBase(r.it))), 0);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const next: typeof errors = {};
        const rowErrors: Record<number, string> = {};
        for (const it of items) {
            const raw = rows[it.id]?.qty ?? '';
            if (raw === '') continue;
            const q = Number(raw);
            if (!Number.isInteger(q) || q < 0 || q > remainingBase(it)) rowErrors[it.id] = `0–${formatNumber(remainingBase(it))}`;
        }
        if (Object.keys(rowErrors).length) next.rows = rowErrors;
        if (chosen.length === 0) next.items = 'Isi qty retur minimal satu item';
        if (!reason.trim()) next.reason = 'Alasan retur wajib diisi';
        setErrors(next);
        if (Object.keys(next).length) return;
        onSubmit({ items: chosen.map((r) => ({ transaction_item_id: r.it.id, base_quantity: r.qty, restock: r.restock })), reason: reason.trim(), refund_method: method });
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`Retur ${trx.invoice_number ?? ''}`}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Batal
                    </Button>
                    <Button type="submit" form="return-form" variant="danger" icon="assignment_return" loading={loading}>
                        Simpan retur
                    </Button>
                </>
            }
        >
            <form id="return-form" onSubmit={handleSubmit} noValidate>
                <p className="!mb-[15px]">Qty dalam satuan dasar. Item yang tidak kembali ke stok dicatat sebagai rusak. Refund dihitung server dari harga setelah diskon.</p>
                <div className="overflow-x-auto mb-[10px]">
                    <table className="w-full text-black dark:text-white">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-[#15203c] text-left">
                                <th className="font-medium px-[12px] py-[10px]">Item</th>
                                <th className="font-medium px-[12px] py-[10px] text-right">Bisa diretur</th>
                                <th className="font-medium px-[12px] py-[10px] text-right">Qty retur</th>
                                <th className="font-medium px-[12px] py-[10px] text-center">Kembali ke stok</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((it) => (
                                <tr key={it.id} className="border-b border-gray-100 dark:border-[#172036]">
                                    <td className="px-[12px] py-[10px]">
                                        <span className="font-medium block">{it.product_name}</span>
                                        <span className="text-xs text-gray-500">
                                            {formatNumber(it.quantity)} {it.unit_name}
                                            {it.conversion_qty > 1 ? ` × ${formatNumber(it.conversion_qty)}` : ''} · {formatRupiah(it.line_total - it.discount_share, currency)}
                                        </span>
                                    </td>
                                    <td className="px-[12px] py-[10px] text-right whitespace-nowrap">{formatNumber(remainingBase(it))}</td>
                                    <td className="px-[12px] py-[10px] text-right">
                                        <label className="sr-only" htmlFor={`ret-qty-${it.id}`}>
                                            Qty retur {it.product_name}
                                        </label>
                                        <input
                                            id={`ret-qty-${it.id}`}
                                            type="number"
                                            inputMode="numeric"
                                            min={0}
                                            max={remainingBase(it)}
                                            placeholder="0"
                                            value={rows[it.id]?.qty ?? ''}
                                            onChange={(e) => update(it.id, { qty: e.target.value.replace(/\D/g, '') })}
                                            className={`${cellInput} ${errors.rows?.[it.id] ? '!border-danger-500' : ''}`}
                                            aria-invalid={errors.rows?.[it.id] ? true : undefined}
                                        />
                                        {errors.rows?.[it.id] && <span className="block text-xs text-danger-500">{errors.rows[it.id]}</span>}
                                    </td>
                                    <td className="px-[12px] py-[10px] text-center">
                                        <input
                                            type="checkbox"
                                            checked={rows[it.id]?.restock ?? true}
                                            onChange={(e) => update(it.id, { restock: e.target.checked })}
                                            className="w-[18px] h-[18px] accent-primary-500 cursor-pointer"
                                            aria-label={`${it.product_name} kembali ke stok`}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {errors.items && (
                    <p className="!mb-[10px] text-sm text-danger-500" role="alert">
                        {errors.items}
                    </p>
                )}
                <p className="!mb-[20px] text-right">
                    Perkiraan refund: <span className="font-semibold text-black dark:text-white">{formatRupiah(estimate, currency)}</span>
                </p>
                <div className="grid sm:grid-cols-2 gap-[20px]">
                    <Textarea label="Alasan" required rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
                    <Select
                        label="Metode refund"
                        required
                        options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
                        value={method}
                        onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    />
                </div>
            </form>
        </Modal>
    );
};

export default ReturnModal;
