import { useEffect, useState, type FormEvent } from 'react';
import CustomerSelect, { type CustomerRef } from '@/components/CustomerSelect';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Textarea from '@/components/ui/Textarea';

export interface PrescriptionValue {
    customer: CustomerRef | null;
    number: string;
    note: string;
}

interface PrescriptionModalProps {
    open: boolean;
    initial: PrescriptionValue;
    /** Names of narkotika/psikotropika items: patient and prescription number become required (BR4). */
    strictItems: string[];
    /** Text of the confirm button, e.g. "Lanjut bayar". */
    submitLabel?: string;
    onClose: () => void;
    onSubmit: (value: PrescriptionValue) => void;
}

/** F10: prescription data. Optional for obat keras, required (patient + number) for narkotika/psikotropika. */
const PrescriptionModal = ({ open, initial, strictItems, submitLabel = 'Simpan', onClose, onSubmit }: PrescriptionModalProps) => {
    const [value, setValue] = useState(initial);
    const [errors, setErrors] = useState<{ customer?: string; number?: string }>({});
    const strict = strictItems.length > 0;

    useEffect(() => {
        if (open) {
            setValue(initial);
            setErrors({});
        }
    }, [open, initial]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const next: typeof errors = {};
        if (strict && !value.customer) next.customer = 'Pilih pasien (pelanggan)';
        if (strict && !value.number.trim()) next.number = 'No. resep wajib diisi';
        setErrors(next);
        if (Object.keys(next).length) return;
        onSubmit({ ...value, number: value.number.trim(), note: value.note.trim() });
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Data resep"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Batal
                    </Button>
                    <Button type="submit" form="prescription-form" icon="check">
                        {submitLabel}
                    </Button>
                </>
            }
        >
            <form id="prescription-form" onSubmit={handleSubmit} noValidate className="space-y-[20px]">
                {strict ? (
                    <p className="!mb-0 rounded-md bg-danger-50 dark:bg-danger-900/40 text-danger-700 dark:text-danger-300 px-[15px] py-[10px]" role="note">
                        {strictItems.join(', ')} termasuk narkotika/psikotropika: wajib pasien dan no. resep.
                    </p>
                ) : (
                    <p className="!mb-0">Obat keras wajib dengan resep dokter. No. dan keterangan resep boleh dikosongkan.</p>
                )}
                <CustomerSelect label="Pasien" required={strict} value={value.customer} onChange={(customer) => setValue((v) => ({ ...v, customer }))} error={errors.customer} />
                <Input label="No. resep" required={strict} maxLength={50} value={value.number} onChange={(e) => setValue((v) => ({ ...v, number: e.target.value }))} error={errors.number} />
                <Textarea
                    label="Keterangan resep"
                    maxLength={500}
                    rows={3}
                    placeholder="mis. dr. Andi, RS Sehat"
                    value={value.note}
                    onChange={(e) => setValue((v) => ({ ...v, note: e.target.value }))}
                />
            </form>
        </Modal>
    );
};

export default PrescriptionModal;
