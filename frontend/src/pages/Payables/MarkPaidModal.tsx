import { useEffect, useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Textarea from '@/components/ui/Textarea';
import { errorMessage } from '@/services/api.service';
import { purchaseService } from '@/services/stock.service';
import type { Purchase } from '@/types/stock.types';
import { formatRupiah, toJakartaDateString } from '@/utils/format';
import { toast } from '@/utils/toast';

interface MarkPaidModalProps {
    /** The payable to settle; null closes the modal. */
    purchase: Pick<Purchase, 'id' | 'invoice_number' | 'total' | 'invoice_date'> | null;
    supplierName?: string;
    onClose: () => void;
    onPaid: () => void;
}

/** F6: mark an unpaid purchase as paid with payment date and note. Used by Payables and the purchase detail. */
const MarkPaidModal = ({ purchase, supplierName, onClose, onPaid }: MarkPaidModalProps) => {
    const [paidAt, setPaidAt] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    // Keeps the content while the dialog fades out after `purchase` becomes null.
    const [shown, setShown] = useState(purchase);
    if (purchase && purchase !== shown) setShown(purchase);

    useEffect(() => {
        if (purchase) {
            setPaidAt(toJakartaDateString());
            setNote('');
            setError('');
        }
    }, [purchase]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!purchase) return;
        if (!paidAt) {
            setError('Tanggal bayar wajib diisi');
            return;
        }
        setSaving(true);
        try {
            const res = await purchaseService.markPaid(purchase.id, { paid_at: paidAt, payment_note: note.trim() });
            toast.success(res.message);
            onPaid();
            onClose();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={purchase !== null}
            onClose={onClose}
            title="Tandai hutang lunas"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Batal
                    </Button>
                    <Button type="submit" form="mark-paid-form" variant="success" icon="check" loading={saving}>
                        Tandai lunas
                    </Button>
                </>
            }
        >
            {shown && (
                <form id="mark-paid-form" onSubmit={handleSubmit} noValidate>
                    <p className="!mb-[20px]">
                        Faktur <strong>{shown.invoice_number}</strong>
                        {supplierName ? ` dari ${supplierName}` : ''} senilai <strong>{formatRupiah(shown.total)}</strong>.
                    </p>
                    <Input
                        label="Tanggal bayar"
                        required
                        type="date"
                        value={paidAt}
                        min={shown.invoice_date}
                        max={toJakartaDateString()}
                        onChange={(e) => {
                            setPaidAt(e.target.value);
                            setError('');
                        }}
                        error={error}
                        wrapperClassName="mb-[20px]"
                    />
                    <Textarea label="Catatan pembayaran" maxLength={500} placeholder="mis. transfer BCA ref 123" value={note} onChange={(e) => setNote(e.target.value)} />
                </form>
            )}
        </Modal>
    );
};

export default MarkPaidModal;
