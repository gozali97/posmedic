import { useEffect, useState, type FormEvent } from 'react';
import CustomerSelect, { type CustomerRef } from '@/components/CustomerSelect';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface HoldModalProps {
    open: boolean;
    initialRef: string;
    initialCustomer: CustomerRef | null;
    loading: boolean;
    onClose: () => void;
    onSubmit: (refNumber: string, customer: CustomerRef | null) => void;
}

/** F12: a held order needs a reference number (open tab) or a customer. Stock is not reserved. */
const HoldModal = ({ open, initialRef, initialCustomer, loading, onClose, onSubmit }: HoldModalProps) => {
    const [ref, setRef] = useState(initialRef);
    const [customer, setCustomer] = useState<CustomerRef | null>(initialCustomer);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setRef(initialRef);
            setCustomer(initialCustomer);
            setError('');
        }
    }, [open, initialRef, initialCustomer]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!ref.trim() && !customer) {
            setError('Isi no. referensi atau pilih pelanggan');
            return;
        }
        onSubmit(ref.trim(), customer);
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Tahan pesanan"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Batal
                    </Button>
                    <Button type="submit" form="hold-form" icon="pause_circle" loading={loading}>
                        Tahan
                    </Button>
                </>
            }
        >
            <form id="hold-form" onSubmit={handleSubmit} noValidate className="space-y-[20px]">
                <p className="!mb-0">Stok belum dikurangi; harga dan stok dihitung ulang saat dibayar.</p>
                <Input
                    label="No. referensi (open tab)"
                    maxLength={50}
                    placeholder="mis. Meja 3 / Antrian 12"
                    value={ref}
                    onChange={(e) => {
                        setRef(e.target.value);
                        setError('');
                    }}
                    error={error}
                    autoFocus
                />
                <CustomerSelect
                    label="atau pelanggan"
                    value={customer}
                    onChange={(c) => {
                        setCustomer(c);
                        setError('');
                    }}
                />
            </form>
        </Modal>
    );
};

export default HoldModal;
