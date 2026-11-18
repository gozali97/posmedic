import { useEffect, useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { errorMessage } from '@/services/api.service';
import { batchService } from '@/services/stock.service';
import { ADJUSTMENT_REASONS, type AdjustmentReason, type BatchItem } from '@/types/stock.types';
import { formatDate, formatNumber } from '@/utils/format';
import { toast } from '@/utils/toast';

interface AdjustModalProps {
    batch: BatchItem | null;
    onClose: () => void;
    onSaved: () => void;
}

type Direction = 'out' | 'in';

/** F8: per-batch stock adjustment in base units with a required reason and note. */
const AdjustModal = ({ batch, onClose, onSaved }: AdjustModalProps) => {
    const [direction, setDirection] = useState<Direction>('out');
    const [qty, setQty] = useState('');
    const [reason, setReason] = useState<AdjustmentReason>('correction');
    const [note, setNote] = useState('');
    const [errors, setErrors] = useState<{ qty?: string; note?: string }>({});
    const [saving, setSaving] = useState(false);
    // Keeps the content while the dialog fades out after `batch` becomes null.
    const [shown, setShown] = useState(batch);
    if (batch && batch !== shown) setShown(batch);

    useEffect(() => {
        if (!batch) return;
        // An expired batch is usually taken out entirely (destruction).
        const expired = batch.expiry_status === 'expired';
        setDirection('out');
        setQty(expired ? String(batch.quantity) : '');
        setReason(expired ? 'expired' : 'correction');
        setNote('');
        setErrors({});
    }, [batch]);

    const unit = batch?.base_unit ?? '';
    const n = Number(qty);
    const signed = direction === 'out' ? -n : n;
    const after = batch && Number.isInteger(n) && n > 0 ? batch.quantity + signed : null;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!batch) return;
        const next: typeof errors = {};
        if (!Number.isInteger(n) || n <= 0) next.qty = 'Qty harus bilangan bulat > 0';
        else if (direction === 'out' && n > batch.quantity) next.qty = `Maksimal ${formatNumber(batch.quantity)} ${unit}`;
        if (!note.trim()) next.note = 'Catatan wajib diisi';
        setErrors(next);
        if (Object.keys(next).length > 0) return;
        setSaving(true);
        try {
            const res = await batchService.adjust(batch.id, { quantity: signed, reason, note: note.trim() });
            toast.success(res.message);
            onSaved();
            onClose();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={batch !== null}
            onClose={onClose}
            title="Penyesuaian stok"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Batal
                    </Button>
                    <Button type="submit" form="adjust-form" icon="check" loading={saving}>
                        Simpan penyesuaian
                    </Button>
                </>
            }
        >
            {shown && (
                <form id="adjust-form" onSubmit={handleSubmit} noValidate>
                    <p className="!mb-[20px]">
                        <strong>{shown.product_name}</strong> · batch {shown.batch_number} · ED {formatDate(shown.expiration_date)}
                        <br />
                        Stok batch sekarang: {formatNumber(shown.quantity)} {unit}
                    </p>
                    <fieldset className="mb-[20px]">
                        <legend className="mb-[10px] text-black dark:text-white font-medium">Arah</legend>
                        <div className="flex flex-wrap gap-[20px]">
                            <label className="flex items-center gap-[8px] cursor-pointer">
                                <input type="radio" name="adjust-direction" checked={direction === 'out'} onChange={() => setDirection('out')} />
                                Kurangi stok
                            </label>
                            <label className="flex items-center gap-[8px] cursor-pointer">
                                <input type="radio" name="adjust-direction" checked={direction === 'in'} onChange={() => setDirection('in')} />
                                Tambah stok
                            </label>
                        </div>
                    </fieldset>
                    <div className="sm:grid sm:grid-cols-2 sm:gap-[20px]">
                        <Input
                            label={`Qty (${unit || 'satuan dasar'})`}
                            required
                            type="number"
                            inputMode="numeric"
                            min={1}
                            value={qty}
                            onChange={(e) => {
                                setQty(e.target.value);
                                setErrors((x) => ({ ...x, qty: undefined }));
                            }}
                            error={errors.qty}
                            hint={after !== null && after >= 0 ? `Stok batch menjadi ${formatNumber(after)} ${unit}` : undefined}
                            wrapperClassName="mb-[20px]"
                        />
                        <Select
                            label="Alasan"
                            required
                            options={ADJUSTMENT_REASONS.map((r) => ({ value: r.value, label: r.label }))}
                            value={reason}
                            onChange={(e) => setReason(e.target.value as AdjustmentReason)}
                            wrapperClassName="mb-[20px]"
                        />
                    </div>
                    <Textarea
                        label="Catatan"
                        required
                        maxLength={500}
                        placeholder="mis. berita acara pemusnahan no. 12"
                        value={note}
                        onChange={(e) => {
                            setNote(e.target.value);
                            setErrors((x) => ({ ...x, note: undefined }));
                        }}
                        error={errors.note}
                    />
                </form>
            )}
        </Modal>
    );
};

export default AdjustModal;
