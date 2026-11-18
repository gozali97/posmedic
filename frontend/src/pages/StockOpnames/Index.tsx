import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { filterClass } from '@/components/ui/filters';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { errorMessage } from '@/services/api.service';
import { categoryService } from '@/services/master.service';
import { opnameService } from '@/services/stock.service';
import type { CategoryItem } from '@/types/master.types';
import type { OpnameListData, OpnameListItem, OpnameStatus } from '@/types/stock.types';
import { formatDateTime, formatNumber } from '@/utils/format';
import { confirmDialog, toast } from '@/utils/toast';

type Filters = { status: OpnameStatus | '' };

const OpnameIndex = () => {
    const navigate = useNavigate();
    const [categories, setCategories] = useState<CategoryItem[]>([]);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ category_id: '', shelf_location: '', note: '' });
    const [saving, setSaving] = useState(false);
    const list = usePaginatedList<OpnameListItem, OpnameListData, Filters>({
        fetcher: (params, signal) => opnameService.list(params, signal),
        select: (d) => d.stock_opnames,
        initialFilters: { status: '' },
    });

    useEffect(() => {
        const controller = new AbortController();
        categoryService
            .all(controller.signal)
            .then((res) => setCategories(res.data?.categories ?? []))
            .catch(() => setCategories([]));
        return () => controller.abort();
    }, []);

    const handleCreate = async (e: FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await opnameService.create({ category_id: form.category_id ? Number(form.category_id) : null, shelf_location: form.shelf_location.trim(), note: form.note.trim() });
            toast.success(res.message);
            navigate(`/stock-opnames/${res.data!.id}`);
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (o: OpnameListItem) => {
        const ok = await confirmDialog({ title: `Hapus sesi ${o.opname_number}?`, text: 'Qty fisik yang sudah diisi ikut terhapus. Stok tidak berubah.', confirmText: 'Hapus', danger: true });
        if (!ok) return;
        try {
            const res = await opnameService.remove(o.id);
            toast.success(res.message);
            list.reload();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const columns: Column<OpnameListItem>[] = [
        {
            key: 'opname_number',
            header: 'No. opname',
            render: (o) => (
                <Link to={`/stock-opnames/${o.id}`} className="font-medium text-primary-500 hover:underline">
                    {o.opname_number}
                </Link>
            ),
        },
        {
            key: 'scope',
            header: 'Cakupan',
            render: (o) => [o.category_name && `Kategori ${o.category_name}`, o.shelf_location && `Rak ${o.shelf_location}`].filter(Boolean).join(' · ') || 'Semua produk',
        },
        { key: 'progress', header: 'Terisi', className: 'text-right', render: (o) => `${formatNumber(o.counted_count)} / ${formatNumber(o.item_count)}` },
        { key: 'status', header: 'Status', render: (o) => (o.status === 'posted' ? <Badge color="success">Diposting</Badge> : <Badge color="warning">Draft</Badge>) },
        { key: 'username', header: 'Dibuat oleh' },
        { key: 'created_at', header: 'Dibuat', render: (o) => formatDateTime(o.created_at) },
        { key: 'posted_at', header: 'Diposting', render: (o) => formatDateTime(o.posted_at) },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (o) => (o.status === 'draft' ? <IconButton icon="delete" tone="danger" label={`Hapus sesi ${o.opname_number}`} onClick={() => handleDelete(o)} /> : null),
        },
    ];

    return (
        <>
            <PageHeader title="Stok Opname" breadcrumbs={[{ label: 'Inventori' }, { label: 'Stok Opname' }]} />
            <Card
                title="Sesi stok opname"
                actions={
                    <>
                        <select
                            aria-label="Filter status"
                            className={`${filterClass} !w-auto`}
                            value={list.filters.status}
                            onChange={(e) => list.setFilters({ status: e.target.value as Filters['status'] })}
                        >
                            <option value="">Semua status</option>
                            <option value="draft">Draft</option>
                            <option value="posted">Diposting</option>
                        </select>
                        <Button
                            size="sm"
                            icon="add"
                            onClick={() => {
                                setForm({ category_id: '', shelf_location: '', note: '' });
                                setOpen(true);
                            }}
                        >
                            Buat sesi
                        </Button>
                    </>
                }
            >
                <p className="!mb-[15px]">
                    Lakukan opname saat toko tutup atau per rak yang sedang tidak dilayani: selisih dihitung terhadap stok saat posting. Saldo awal go-live diinput lewat opname pertama.
                </p>
                <DataTable columns={columns} rows={list.rows} rowKey={(o) => o.id} loading={list.loading} pagination={list.pagination} onPageChange={list.setPage} emptyText="Belum ada sesi opname" />
            </Card>

            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title="Buat sesi stok opname"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Batal
                        </Button>
                        <Button type="submit" form="opname-form" icon="check" loading={saving}>
                            Buat sesi
                        </Button>
                    </>
                }
            >
                <form id="opname-form" onSubmit={handleCreate} noValidate>
                    <p className="!mb-[20px]">Sistem mengisi daftar semua batch berstok. Batasi ke satu kategori atau rak jika opname dilakukan bertahap.</p>
                    <div className="sm:grid sm:grid-cols-2 sm:gap-[20px]">
                        <Select
                            label="Kategori"
                            placeholder="Semua kategori"
                            options={categories.map((c) => ({ value: c.id, label: c.name }))}
                            value={form.category_id}
                            onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                            wrapperClassName="mb-[20px]"
                        />
                        <Input
                            label="Rak"
                            maxLength={30}
                            placeholder="Semua rak"
                            value={form.shelf_location}
                            onChange={(e) => setForm((f) => ({ ...f, shelf_location: e.target.value }))}
                            wrapperClassName="mb-[20px]"
                        />
                    </div>
                    <Textarea label="Catatan" maxLength={500} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
                </form>
            </Modal>
        </>
    );
};

export default OpnameIndex;
