import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { errorMessage } from '@/services/api.service';
import { tillService } from '@/services/setting.service';
import type { Till } from '@/types/setting.types';
import { confirmDialog, toast } from '@/utils/toast';

interface TillFormState {
    number: string;
    name: string;
}

const iconBtn = 'inline-flex items-center justify-center w-[32px] h-[32px] rounded-md transition-all';

const TillSection = () => {
    const [tills, setTills] = useState<Till[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Till | null>(null);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<TillFormState>({ number: '', name: '' });
    const [errors, setErrors] = useState<Partial<TillFormState>>({});
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await tillService.list();
            setTills(res.data ?? []);
        } catch (err) {
            toast.error(errorMessage(err, 'Gagal memuat till'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openForm = (till: Till | null) => {
        setEditing(till);
        const nextNumber = tills.reduce((max, t) => Math.max(max, t.number), 0) + 1;
        setForm(till ? { number: String(till.number), name: till.name } : { number: String(nextNumber), name: '' });
        setErrors({});
        setOpen(true);
    };

    const validateForm = (): boolean => {
        const next: Partial<TillFormState> = {};
        const n = Number(form.number);
        if (!Number.isInteger(n) || n <= 0) next.number = 'Nomor till harus bilangan bulat > 0';
        if (!form.name.trim()) next.name = 'Nama till wajib diisi';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;
        setSaving(true);
        const body = { number: Number(form.number), name: form.name.trim() };
        try {
            const res = editing ? await tillService.update(editing.id, body) : await tillService.create(body);
            toast.success(res.message);
            setOpen(false);
            load();
        } catch (err) {
            const message = errorMessage(err);
            if (message.startsWith('Nomor till')) setErrors({ number: message });
            else toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (till: Till) => {
        const ok = await confirmDialog({
            title: `Hapus till ${till.number} – ${till.name}?`,
            text: 'Till yang sudah dipakai di shift atau transaksi tidak bisa dihapus.',
            confirmText: 'Hapus',
            danger: true,
        });
        if (!ok) return;
        try {
            const res = await tillService.remove(till.id);
            toast.success(res.message);
            load();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const columns: Column<Till>[] = [
        { key: 'number', header: 'Nomor', render: (t) => <span className="font-medium">{t.number}</span> },
        { key: 'name', header: 'Nama' },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (t) => (
                <div className="flex justify-end gap-[6px]">
                    <button
                        type="button"
                        className={`${iconBtn} text-primary-500 hover:bg-primary-50 dark:hover:bg-[#15203c]`}
                        onClick={() => openForm(t)}
                        aria-label={`Ubah till ${t.number}`}
                        title="Ubah"
                    >
                        <i className="material-symbols-outlined !text-[20px]">edit</i>
                    </button>
                    <button
                        type="button"
                        className={`${iconBtn} text-danger-500 hover:bg-danger-50 dark:hover:bg-[#15203c]`}
                        onClick={() => handleDelete(t)}
                        aria-label={`Hapus till ${t.number}`}
                        title="Hapus"
                    >
                        <i className="material-symbols-outlined !text-[20px]">delete</i>
                    </button>
                </div>
            ),
        },
    ];

    return (
        <Card
            title="Till (mesin kasir)"
            actions={
                <Button size="sm" icon="add" onClick={() => openForm(null)}>
                    Tambah till
                </Button>
            }
        >
            <p className="!mb-[15px]">Setiap browser kasir memilih till-nya sekali di layar POS. Nomor till dipakai di nomor invoice.</p>
            <DataTable columns={columns} rows={tills} rowKey={(t) => t.id} loading={loading} emptyText="Belum ada till. Tambahkan minimal satu sebelum berjualan." />

            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title={editing ? 'Ubah till' : 'Tambah till'}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Batal
                        </Button>
                        <Button type="submit" form="till-form" icon="check" loading={saving}>
                            Simpan
                        </Button>
                    </>
                }
            >
                <form id="till-form" onSubmit={handleSubmit} noValidate>
                    <Input
                        label="Nomor"
                        required
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={form.number}
                        onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                        error={errors.number}
                        wrapperClassName="mb-[20px]"
                    />
                    <Input
                        label="Nama"
                        required
                        maxLength={50}
                        placeholder="mis. Kasir Depan"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        error={errors.name}
                    />
                </form>
            </Modal>
        </Card>
    );
};

export default TillSection;
