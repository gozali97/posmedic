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
import { supplierService } from '@/services/master.service';
import type { ApiResponse, PaginationMeta } from '@/types/api.types';
import type { Supplier, SupplierListData } from '@/types/master.types';
import { confirmDialog, toast } from '@/utils/toast';

interface FormState {
    name: string;
    address: string;
    phone: string;
    contact_name: string;
    tax_number: string;
    payment_term_days: string;
}

const EMPTY: FormState = { name: '', address: '', phone: '', contact_name: '', tax_number: '', payment_term_days: '30' };

type PagedSuppliers = SupplierListData & { pagination: PaginationMeta };

const SupplierIndex = () => {
    const list = usePaginatedList<Supplier, PagedSuppliers>({
        // Without all=1 the backend always paginates.
        fetcher: (params, signal) => supplierService.list(params, signal) as Promise<ApiResponse<PagedSuppliers>>,
        select: (d) => d.suppliers,
    });
    const [editing, setEditing] = useState<Supplier | null>(null);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [errors, setErrors] = useState<Partial<FormState>>({});
    const [saving, setSaving] = useState(false);

    const setField = (key: keyof FormState, value: string) => {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors((e) => ({ ...e, [key]: undefined }));
    };

    const openForm = (s: Supplier | null) => {
        setEditing(s);
        setForm(
            s
                ? {
                      name: s.name,
                      address: s.address ?? '',
                      phone: s.phone ?? '',
                      contact_name: s.contact_name ?? '',
                      tax_number: s.tax_number ?? '',
                      payment_term_days: String(s.payment_term_days),
                  }
                : EMPTY,
        );
        setErrors({});
        setOpen(true);
    };

    const validateForm = (): boolean => {
        const next: Partial<FormState> = {};
        if (!form.name.trim()) next.name = 'Nama supplier wajib diisi';
        const term = Number(form.payment_term_days);
        if (form.payment_term_days === '' || !Number.isInteger(term) || term < 0 || term > 365) next.payment_term_days = 'Termin 0–365 hari';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;
        setSaving(true);
        const body = {
            name: form.name.trim(),
            address: nullable(form.address),
            phone: nullable(form.phone),
            contact_name: nullable(form.contact_name),
            tax_number: nullable(form.tax_number),
            payment_term_days: Number(form.payment_term_days),
        };
        try {
            const res = editing ? await supplierService.update(editing.id, body) : await supplierService.create(body);
            toast.success(res.message);
            setOpen(false);
            list.reload();
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (s: Supplier) => {
        const ok = await confirmDialog({ title: `Hapus supplier ${s.name}?`, text: 'Supplier yang sudah punya penerimaan barang tidak bisa dihapus.', confirmText: 'Hapus', danger: true });
        if (!ok) return;
        try {
            const res = await supplierService.remove(s.id);
            toast.success(res.message);
            list.reload();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const columns: Column<Supplier>[] = [
        {
            key: 'name',
            header: 'Nama',
            render: (s) => (
                <div>
                    <span className="font-medium block">{s.name}</span>
                    {s.address && <span className="text-sm text-gray-500 block max-w-[320px] truncate">{s.address}</span>}
                </div>
            ),
        },
        { key: 'contact', header: 'Kontak', render: (s) => [s.contact_name, s.phone].filter(Boolean).join(' · ') || '-' },
        { key: 'tax_number', header: 'NPWP', render: (s) => s.tax_number ?? '-' },
        { key: 'payment_term_days', header: 'Termin', className: 'text-right', render: (s) => `${s.payment_term_days} hari` },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (s) => (
                <div className="flex justify-end gap-[6px]">
                    <IconButton icon="edit" label={`Ubah ${s.name}`} onClick={() => openForm(s)} />
                    <IconButton icon="delete" tone="danger" label={`Hapus ${s.name}`} onClick={() => handleDelete(s)} />
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader title="Supplier" breadcrumbs={[{ label: 'Pembelian' }, { label: 'Supplier' }]} />
            <Card
                title="Daftar supplier (PBF)"
                actions={
                    <>
                        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cari supplier…" />
                        <Button size="sm" icon="add" onClick={() => openForm(null)}>
                            Tambah supplier
                        </Button>
                    </>
                }
            >
                <DataTable
                    columns={columns}
                    rows={list.rows}
                    rowKey={(s) => s.id}
                    loading={list.loading}
                    pagination={list.pagination}
                    onPageChange={list.setPage}
                    emptyText="Supplier tidak ditemukan"
                />
            </Card>

            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title={editing ? 'Ubah supplier' : 'Tambah supplier'}
                size="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Batal
                        </Button>
                        <Button type="submit" form="supplier-form" icon="check" loading={saving}>
                            Simpan
                        </Button>
                    </>
                }
            >
                <form id="supplier-form" onSubmit={handleSubmit} noValidate>
                    <div className="sm:grid sm:grid-cols-2 sm:gap-[20px]">
                        <Input label="Nama" required maxLength={150} value={form.name} onChange={(e) => setField('name', e.target.value)} error={errors.name} wrapperClassName="mb-[20px]" />
                        <Input label="Nama sales/kontak" maxLength={100} value={form.contact_name} onChange={(e) => setField('contact_name', e.target.value)} wrapperClassName="mb-[20px]" />
                        <Input label="Telepon" type="tel" maxLength={30} value={form.phone} onChange={(e) => setField('phone', e.target.value)} wrapperClassName="mb-[20px]" />
                        <Input label="NPWP" maxLength={30} value={form.tax_number} onChange={(e) => setField('tax_number', e.target.value)} wrapperClassName="mb-[20px]" />
                        <Input
                            label="Termin pembayaran (hari)"
                            required
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={365}
                            value={form.payment_term_days}
                            onChange={(e) => setField('payment_term_days', e.target.value)}
                            error={errors.payment_term_days}
                            hint="Dipakai untuk jatuh tempo default saat penerimaan barang."
                            wrapperClassName="mb-[20px]"
                        />
                    </div>
                    <Textarea label="Alamat" maxLength={500} value={form.address} onChange={(e) => setField('address', e.target.value)} />
                </form>
            </Modal>
        </>
    );
};

export default SupplierIndex;
