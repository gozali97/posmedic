import { useEffect, useRef, useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { PAYMENT_METHODS, type PaymentMethod, type PaymentPayload } from '@/types/sales.types';
import { formatNumber, formatRupiah } from '@/utils/format';

interface PaymentModalProps {
    open: boolean;
    total: number;
    currency?: string;
    loading: boolean;
    onClose: () => void;
    onSubmit: (payment: PaymentPayload) => void;
}

const DENOMINATIONS = [5000, 10000, 20000, 50000, 100000];

/** "Uang pas" plus the next round amounts a customer is likely to hand over. */
export const quickAmounts = (total: number): number[] => {
    const set = new Set<number>([total]);
    for (const d of DENOMINATIONS) {
        const v = Math.ceil(total / d) * d;
        if (v > total) set.add(v);
        if (set.size >= 4) break;
    }
    return [...set].sort((a, b) => a - b);
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back'] as const;

const keyBtn =
    'h-[48px] rounded-md border border-gray-200 dark:border-[#172036] text-lg font-semibold text-black dark:text-white transition-all hover:bg-primary-50 dark:hover:bg-[#15203c] active:bg-primary-100';

/** F11: cash with keypad and change, card or QRIS (paid = total). No split payments. */
const PaymentModal = ({ open, total, currency, loading, onClose, onSubmit }: PaymentModalProps) => {
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [amount, setAmount] = useState('');
    const [info, setInfo] = useState('');
    const amountRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setMethod('cash');
            setAmount('');
            setInfo('');
        }
    }, [open]);

    const paid = method === 'cash' ? Number(amount || 0) : total;
    const change = paid - total;
    const canPay = method !== 'cash' || (amount !== '' && paid >= total);

    const press = (k: (typeof KEYS)[number]) => {
        setAmount((a) => {
            if (k === 'back') return a.slice(0, -1);
            const next = (a + k).replace(/^0+(?=\d)/, '');
            return next.length > 12 ? a : next;
        });
        amountRef.current?.focus();
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!canPay || loading) return;
        onSubmit({ method, paid, info: method === 'cash' ? '' : info.trim() });
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Pembayaran"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Batal
                    </Button>
                    <Button type="submit" form="payment-form" variant="success" icon="payments" loading={loading} disabled={!canPay}>
                        Bayar {formatRupiah(total, currency)}
                    </Button>
                </>
            }
        >
            <form id="payment-form" onSubmit={handleSubmit} noValidate>
                <div className="text-center mb-[20px]">
                    <span className="block text-sm text-gray-500">Total</span>
                    <span className="block text-[32px] font-bold text-black dark:text-white leading-tight" data-testid="pay-total">
                        {formatRupiah(total, currency)}
                    </span>
                </div>

                <fieldset className="grid grid-cols-3 gap-[8px] mb-[20px]">
                    <legend className="sr-only">Metode bayar</legend>
                    {PAYMENT_METHODS.map((m) => (
                        <label
                            key={m.value}
                            className={`cursor-pointer rounded-md border text-center py-[10px] font-medium transition-all has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary-500 ${
                                method === m.value ? 'border-primary-500 bg-primary-50 text-primary-600 dark:bg-[#15203c] dark:text-primary-300' : 'border-gray-200 dark:border-[#172036]'
                            }`}
                        >
                            <input type="radio" name="method" value={m.value} checked={method === m.value} onChange={() => setMethod(m.value)} className="sr-only" />
                            {m.label}
                        </label>
                    ))}
                </fieldset>

                {method === 'cash' ? (
                    <>
                        <Input
                            ref={amountRef}
                            label="Uang diterima"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                            className="!text-right !text-xl font-semibold"
                            autoFocus
                            wrapperClassName="mb-[12px]"
                        />
                        <div className="flex flex-wrap gap-[8px] mb-[12px]">
                            {quickAmounts(total).map((v) => (
                                <Button key={v} size="sm" variant="outline" onClick={() => setAmount(String(v))}>
                                    {v === total ? 'Uang pas' : formatNumber(v)}
                                </Button>
                            ))}
                        </div>
                        <div className="grid grid-cols-3 gap-[8px] mb-[15px]">
                            {KEYS.map((k) => (
                                <button key={k} type="button" className={keyBtn} onClick={() => press(k)} aria-label={k === 'back' ? 'Hapus angka terakhir' : k} tabIndex={-1}>
                                    {k === 'back' ? <i className="material-symbols-outlined align-middle">backspace</i> : k}
                                </button>
                            ))}
                        </div>
                        <div
                            className={`flex justify-between items-center rounded-md px-[15px] py-[12px] ${change >= 0 && amount !== '' ? 'bg-success-50 dark:bg-success-900/40' : 'bg-gray-50 dark:bg-[#15203c]'}`}
                            aria-live="polite"
                        >
                            <span className="font-medium">{change >= 0 || amount === '' ? 'Kembalian' : 'Kurang'}</span>
                            <span className="text-xl font-bold text-black dark:text-white" data-testid="pay-change">
                                {amount === '' ? '-' : formatRupiah(Math.abs(change), currency)}
                            </span>
                        </div>
                    </>
                ) : (
                    <Input
                        label={method === 'card' ? 'Info kartu (opsional)' : 'No. referensi (opsional)'}
                        placeholder={method === 'card' ? 'mis. BCA debit ••1234' : 'mis. ID transaksi QRIS'}
                        maxLength={100}
                        value={info}
                        onChange={(e) => setInfo(e.target.value)}
                        hint="Dibayar pas sebesar total."
                        autoFocus
                    />
                )}
            </form>
        </Modal>
    );
};

export default PaymentModal;
