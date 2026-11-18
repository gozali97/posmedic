import { useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { nullable } from '@/components/ui/filters';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import Textarea from '@/components/ui/Textarea';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { errorMessage } from '@/services/api.service';
import { customerService } from '@/services/master.service';
import type { Customer, CustomerListData } from '@/types/master.types';
import { confirmDialog, toast } from '@/utils/toast';

interface FormState {
    name: string;
    phone: string;
    email: string;
    address: string;
}

const EMPTY: FormState = { name: '', phone: '', email: '', address: '' };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CustomerIndex = () => {
    const list = usePaginatedList<Customer, CustomerListData>({
        fetcher: (params, signal) => customerService.list(params, signal),
        select: (d) => d.customers,
    });
    const [editing, setEditing] = useState<Customer | null>(null);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [errors, setErrors] = useState<Partial<FormState>>({});
    const [saving, setSaving] = useState(false);

    const setField = (key: keyof FormState, value: string) => {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors((e) => ({ ...e, [key]: undefined }));
    };

    const openForm = (c: Customer | null) => {
        setEditing(c);
        setForm(c ? { name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '' } : EMPTY);
        setErrors({});
        setOpen(true);
    };

    const validateForm = (): boolean => {
        const next: Partial<FormState> = {};
        if (!form.name.trim()) next.name = 'Nama pelanggan wajib diisi';
        if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) next.email = 'Format email tidak valid';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;
        setSaving(true);
        const body = { name: form.name.trim(), phone: nullable(form.phone), email: nullable(form.email), address: nullable(form.address) };
        try {
            const res = editing ? await customerService.update(editing.id, body) : await customerService.create(body);
            toast.success(res.message);
            setOpen(false);
            list.reload();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (c: Customer) => {
        const ok = await confirmDialog({ title: `Hapus pelanggan ${c.name}?`, text: 'Pelanggan yang sudah punya transaksi tidak bisa dihapus.', confirmText: 'Hapus', danger: true });
        if (!ok) return;
        try {
            const res = await customerService.remove(c.id);
            toast.success(res.message);
            list.reload();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const columns: Column<Customer>[] = [
        { key: 'name', header: 'Nama', render: (c) => <span className="font-medium">{c.name}</span> },
        { key: 'phone', header: 'Telepon', render: (c) => c.phone ?? '-' },
        { key: 'email', header: 'Email', render: (c) => c.email ?? '-' },
        { key: 'address', header: 'Alamat', render: (c) => <span className="block max-w-[320px] truncate">{c.address ?? '-'}</span> },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (c) => (
                <div className="flex justify-end gap-[6px]">
                    <IconButton icon="edit" label={`Ubah ${c.name}`} onClick={() => openForm(c)} />
                    <IconButton icon="delete" tone="danger" label={`Hapus ${c.name}`} onClick={() => handleDelete(c)} />
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader title="Pelanggan" breadcrumbs={[{ label: 'Penjualan' }, { label: 'Pelanggan' }]} />
            <Card
                title="Daftar pelanggan"
                actions={
                    <>
                        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cari nama atau telepon…" />
                        <Button size="sm" icon="add" onClick={() => openForm(null)}>
                            Tambah pelanggan
                        </Button>
                    </>
                }
            >
                <DataTable
                    columns={columns}
                    rows={list.rows}
                    rowKey={(c) => c.id}
                    loading={list.loading}
                    pagination={list.pagination}
                    onPageChange={list.setPage}
                    emptyText="Pelanggan tidak ditemukan"
                />
            </Card>

            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title={editing ? 'Ubah pelanggan' : 'Tambah pelanggan'}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Batal
                        </Button>
                        <Button type="submit" form="customer-form" icon="check" loading={saving}>
                            Simpan
                        </Button>
                    </>
                }
            >
                <form id="customer-form" onSubmit={handleSubmit} noValidate>
                    <Input label="Nama" required maxLength={100} value={form.name} onChange={(e) => setField('name', e.target.value)} error={errors.name} wrapperClassName="mb-[20px]" />
                    <div className="sm:grid sm:grid-cols-2 sm:gap-[20px]">
                        <Input label="Telepon" type="tel" maxLength={30} value={form.phone} onChange={(e) => setField('phone', e.target.value)} wrapperClassName="mb-[20px]" />
                        <Input label="Email" type="email" maxLength={100} value={form.email} onChange={(e) => setField('email', e.target.value)} error={errors.email} wrapperClassName="mb-[20px]" />
                    </div>
                    <Textarea label="Alamat" maxLength={500} value={form.address} onChange={(e) => setField('address', e.target.value)} />
                </form>
            </Modal>
        </>
    );
};

export default CustomerIndex;
