import { useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { ApiError, errorMessage } from '@/services/api.service';
import { categoryService } from '@/services/master.service';
import type { ApiResponse, PaginationMeta } from '@/types/api.types';
import type { CategoryItem, CategoryListData } from '@/types/master.types';
import { formatNumber } from '@/utils/format';
import { confirmDialog, toast } from '@/utils/toast';

type PagedCategories = CategoryListData & { pagination: PaginationMeta };

const CategoryIndex = () => {
    const list = usePaginatedList<CategoryItem, PagedCategories>({
        // Without all=1 the backend always paginates.
        fetcher: (params, signal) => categoryService.list(params, signal) as Promise<ApiResponse<PagedCategories>>,
        select: (d) => d.categories,
    });
    const [editing, setEditing] = useState<CategoryItem | null>(null);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const openForm = (cat: CategoryItem | null) => {
        setEditing(cat);
        setName(cat?.name ?? '');
        setError('');
        setOpen(true);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const value = name.trim();
        if (!value) {
            setError('Nama kategori wajib diisi');
            return;
        }
        setSaving(true);
        try {
            const res = editing ? await categoryService.update(editing.id, value) : await categoryService.create(value);
            toast.success(res.message);
            setOpen(false);
            list.reload();
        } catch (err) {
            // 409 (name taken) and 422 belong to the only field.
            if (err instanceof ApiError && (err.code === 409 || err.code === 422)) setError(err.message);
            else toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (cat: CategoryItem) => {
        const ok = await confirmDialog({ title: `Hapus kategori ${cat.name}?`, text: 'Kategori yang masih dipakai produk tidak bisa dihapus.', confirmText: 'Hapus', danger: true });
        if (!ok) return;
        try {
            const res = await categoryService.remove(cat.id);
            toast.success(res.message);
            list.reload();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const columns: Column<CategoryItem>[] = [
        { key: 'name', header: 'Nama', render: (c) => <span className="font-medium">{c.name}</span> },
        { key: 'product_count', header: 'Jumlah produk', className: 'text-right', render: (c) => formatNumber(c.product_count) },
        {
            key: 'actions',
            header: <span className="sr-only">Aksi</span>,
            className: 'text-right',
            render: (c) => (
                <div className="flex justify-end gap-[6px]">
                    <IconButton icon="edit" label={`Ubah ${c.name}`} onClick={() => openForm(c)} />
                    <IconButton icon="delete" tone="danger" label={`Hapus ${c.name}`} disabled={c.product_count > 0} onClick={() => handleDelete(c)} />
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader title="Kategori" breadcrumbs={[{ label: 'Inventori' }, { label: 'Kategori' }]} />
            <Card
                title="Daftar kategori"
                actions={
                    <>
                        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cari kategori…" />
                        <Button size="sm" icon="add" onClick={() => openForm(null)}>
                            Tambah kategori
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
                    emptyText="Kategori tidak ditemukan"
                />
            </Card>

            <Modal
                open={open}
                onClose={() => setOpen(false)}
                title={editing ? 'Ubah kategori' : 'Tambah kategori'}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Batal
                        </Button>
                        <Button type="submit" form="category-form" icon="check" loading={saving}>
                            Simpan
                        </Button>
                    </>
                }
            >
                <form id="category-form" onSubmit={handleSubmit} noValidate>
                    <Input
                        label="Nama kategori"
                        required
                        maxLength={100}
                        placeholder="mis. Obat Bebas"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setError('');
                        }}
                        error={error}
                    />
                </form>
            </Modal>
        </>
    );
};

export default CategoryIndex;
