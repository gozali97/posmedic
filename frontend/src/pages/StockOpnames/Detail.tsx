import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import ProductPicker from '@/components/ProductPicker';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { cellInputClass } from '@/components/ui/filters';
import IconButton from '@/components/ui/IconButton';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import { errorMessage } from '@/services/api.service';
import { opnameService } from '@/services/stock.service';
import type { ProductItem } from '@/types/master.types';
import type { OpnameDetail, OpnameItem, OpnameItemsPayload } from '@/types/stock.types';
import { formatDate, formatDateTime, formatNumber } from '@/utils/format';
import { confirmDialog, toast } from '@/utils/toast';

interface NewRow {
    key: string;
    product: ProductItem;
    batch_number: string;
    expiration_date: string;
    cost_price: string;
    counted: string;
}

let keySeq = 0;

const isWholeNonNegative = (s: string) => s !== '' && Number.isInteger(Number(s)) && Number(s) >= 0;

const Diff = ({ value }: { value: number | null }) =>
    value === null ? (
        <span className="text-gray-500">-</span>
    ) : (
        <span className={value < 0 ? 'text-danger-500 font-medium' : value > 0 ? 'text-success-600 font-medium' : ''}>
            {value > 0 ? '+' : ''}
            {formatNumber(value)}
        </span>
    );

const th = 'font-medium text-left px-[10px] py-[10px] bg-gray-50 dark:bg-[#15203c] whitespace-nowrap';
const td = 'px-[10px] py-[8px] border-b border-gray-100 dark:border-[#172036]';

const OpnameDetailPage = () => {
    const { id } = useParams();
    const opnameId = Number(id);
    const [detail, setDetail] = useState<OpnameDetail | null>(null);
    const [loadError, setLoadError] = useState('');
    const [counts, setCounts] = useState<Record<number, string>>({});
    const [removed, setRemoved] = useState<number[]>([]);
    const [newRows, setNewRows] = useState<NewRow[]>([]);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState<'save' | 'post' | null>(null);

    const apply = useCallback((d: OpnameDetail) => {
        setDetail(d);
        setCounts(Object.fromEntries(d.items.map((i) => [i.id, i.counted_quantity === null ? '' : String(i.counted_quantity)])));
        setRemoved([]);
        setNewRows([]);
    }, []);

    useEffect(() => {
        if (!Number.isInteger(opnameId) || opnameId <= 0) {
            setLoadError('ID opname tidak valid');
            return;
        }
        const controller = new AbortController();
        opnameService
            .detail(opnameId, controller.signal)
            .then((res) => apply(res.data!))
            .catch((err) => {
                if (!controller.signal.aborted) setLoadError(errorMessage(err));
            });
        return () => controller.abort();
    }, [opnameId, apply]);

    const changedCounts = useMemo(
        () => (detail ? detail.items.filter((i) => !removed.includes(i.id) && (counts[i.id] ?? '') !== (i.counted_quantity === null ? '' : String(i.counted_quantity))) : []),
        [detail, counts, removed],
    );
    const dirty = changedCounts.length > 0 || removed.length > 0 || newRows.length > 0;

    const visibleItems = useMemo(() => {
        const term = search.trim().toLowerCase();
        const items = (detail?.items ?? []).filter((i) => !removed.includes(i.id));
        return term ? items.filter((i) => i.product_name.toLowerCase().includes(term) || i.batch_number.toLowerCase().includes(term)) : items;
    }, [detail, removed, search]);

    if (loadError || !detail) {
        return (
            <>
                <PageHeader title="Stok Opname" breadcrumbs={[{ label: 'Stok Opname', to: '/stock-opnames' }, { label: 'Detail' }]} />
                <Card>{loadError ? <p className="text-danger-500 !mb-0">{loadError}</p> : <p className="!mb-0">Memuat sesi opname…</p>}</Card>
            </>
        );
    }

    const isDraft = detail.status === 'draft';
    const countedCount = detail.items.filter((i) => !removed.includes(i.id) && (counts[i.id] ?? '') !== '').length + newRows.length;
    const totalCount = detail.items.length - removed.length + newRows.length;

    const updateRow = (key: string, patch: Partial<NewRow>) => setNewRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

    /** Validates and builds the save payload; null (with a toast) when something is wrong. */
    const buildPayload = (): OpnameItemsPayload | null => {
        const reject = (message: string) => {
            toast.error(message);
            return null;
        };
        const bad = changedCounts.find((i) => counts[i.id] !== '' && !isWholeNonNegative(counts[i.id]));
        if (bad) return reject(`Qty fisik ${bad.product_name} batch ${bad.batch_number} harus bilangan bulat ≥ 0`);
        for (const [n, r] of newRows.entries()) {
            const label = `Batch baru ${n + 1} (${r.product.name})`;
            if (!r.batch_number.trim()) return reject(`${label}: no. batch wajib diisi`);
            if (!r.expiration_date) return reject(`${label}: ED wajib diisi`);
            if (!isWholeNonNegative(r.cost_price)) return reject(`${label}: harga beli wajib diisi (≥ 0)`);
            if (!isWholeNonNegative(r.counted)) return reject(`${label}: qty fisik wajib diisi (≥ 0)`);
        }
        return {
            items: changedCounts.map((i) => ({ id: i.id, counted_quantity: counts[i.id] === '' ? null : Number(counts[i.id]) })),
            new_items: newRows.map((r) => ({
                product_id: r.product.id,
                batch_number: r.batch_number.trim(),
                expiration_date: r.expiration_date,
                cost_price: Number(r.cost_price),
                counted_quantity: Number(r.counted),
            })),
            remove_item_ids: removed,
        };
    };

    /** Saves pending changes; resolves false when nothing could be saved. */
    const save = async (): Promise<boolean> => {
        const payload = buildPayload();
        if (!payload) return false;
        try {
            const res = await opnameService.saveItems(detail.id, payload);
            apply(res.data!);
            toast.success(res.message);
            return true;
        } catch (err) {
            toast.error(errorMessage(err));
            return false;
        }
    };

    const handleSave = async () => {
        setBusy('save');
        await save();
        setBusy(null);
    };

    const handlePost = async () => {
        const ok = await confirmDialog({
            title: `Posting ${detail.opname_number}?`,
            text: `${formatNumber(countedCount)} dari ${formatNumber(totalCount)} baris terisi; baris kosong dilewati. Selisih = qty fisik − stok sistem saat posting, dan sesi tidak bisa diubah lagi.`,
            confirmText: 'Posting',
        });
        if (!ok) return;
        setBusy('post');
        try {
            if (dirty && !(await save())) return;
            const res = await opnameService.post(detail.id);
            apply(res.data!);
            toast.success(res.message);
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setBusy(null);
        }
    };

    const addProduct = (p: ProductItem) => setNewRows((rows) => [...rows, { key: `n${++keySeq}`, product: p, batch_number: '', expiration_date: '', cost_price: '', counted: '' }]);

    const draftRow = (i: OpnameItem) => {
        const value = counts[i.id] ?? '';
        const preview =
            value !== '' && isWholeNonNegative(value) && i.current_quantity !== null
                ? Number(value) - i.current_quantity
                : value !== '' && isWholeNonNegative(value) && i.product_batch_id === null
                  ? Number(value)
                  : null;
        return (
            <tr key={i.id}>
                <td className={td}>
                    <span className="font-medium text-black dark:text-white block">{i.product_name}</span>
                    {i.shelf_location && <span className="text-xs text-gray-500">Rak {i.shelf_location}</span>}
                </td>
                <td className={td}>
                    {i.batch_number}
                    {i.product_batch_id === null && (
                        <Badge color="info" className="ml-[6px]">
                            Batch baru
                        </Badge>
                    )}
                </td>
                <td className={td}>{formatDate(i.expiration_date)}</td>
                <td className={`${td} text-right`}>{i.current_quantity === null ? '-' : `${formatNumber(i.current_quantity)} ${i.base_unit ?? ''}`}</td>
                <td className={td}>
                    <input
                        className={`${cellInputClass} !w-[110px]`}
                        aria-label={`Qty fisik ${i.product_name} batch ${i.batch_number}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder="belum"
                        value={value}
                        onChange={(e) => setCounts((c) => ({ ...c, [i.id]: e.target.value }))}
                    />
                </td>
                <td className={`${td} text-right`}>
                    <Diff value={preview} />
                </td>
                <td className={`${td} text-right`}>
                    {i.product_batch_id === null && <IconButton icon="delete" tone="danger" label={`Hapus batch baru ${i.batch_number}`} onClick={() => setRemoved((r) => [...r, i.id])} />}
                </td>
            </tr>
        );
    };

    const postedRow = (i: OpnameItem) => (
        <tr key={i.id}>
            <td className={td}>
                <span className="font-medium text-black dark:text-white">{i.product_name}</span>
            </td>
            <td className={td}>{i.batch_number}</td>
            <td className={td}>{formatDate(i.expiration_date)}</td>
            <td className={`${td} text-right`}>{i.system_quantity === null ? '-' : formatNumber(i.system_quantity)}</td>
            <td className={`${td} text-right`}>{i.counted_quantity === null ? <span className="text-gray-500">dilewati</span> : formatNumber(i.counted_quantity)}</td>
            <td className={`${td} text-right`}>
                <Diff value={i.difference} />
                {i.base_unit && i.difference !== null ? ` ${i.base_unit}` : ''}
            </td>
        </tr>
    );

    const scope = [detail.category_name && `Kategori ${detail.category_name}`, detail.shelf_location && `Rak ${detail.shelf_location}`].filter(Boolean).join(' · ') || 'Semua produk';

    return (
        <>
            <PageHeader
                title={`Stok Opname ${detail.opname_number}`}
                breadcrumbs={[{ label: 'Stok Opname', to: '/stock-opnames' }, { label: detail.opname_number }]}
                actions={
                    isDraft && (
                        <>
                            <Button variant="outline" icon="save" loading={busy === 'save'} disabled={!dirty || busy !== null} onClick={handleSave}>
                                Simpan
                            </Button>
                            <Button icon="fact_check" loading={busy === 'post'} disabled={busy !== null} onClick={handlePost}>
                                Posting
                            </Button>
                        </>
                    )
                }
            />
            <Card>
                <div className="flex flex-wrap items-center gap-x-[30px] gap-y-[8px]">
                    <span>{isDraft ? <Badge color="warning">Draft</Badge> : <Badge color="success">Diposting</Badge>}</span>
                    <span>{scope}</span>
                    <span>
                        Terisi {formatNumber(countedCount)} / {formatNumber(totalCount)}
                    </span>
                    <span>Dibuat {formatDateTime(detail.created_at)}</span>
                    {detail.posted_at && <span>Diposting {formatDateTime(detail.posted_at)}</span>}
                    {dirty && <span className="text-warning-900 dark:text-warning-300 font-medium">Ada perubahan belum disimpan</span>}
                </div>
                {detail.note && <p className="!mt-[10px] !mb-0">{detail.note}</p>}
            </Card>

            <Card title={isDraft ? 'Isi qty fisik' : 'Hasil opname'} actions={<SearchInput value={search} onChange={setSearch} placeholder="Cari produk atau batch…" />}>
                {isDraft && <p className="!mb-[15px]">Kosongkan qty fisik untuk melewati batch. Selisih di bawah adalah perkiraan terhadap stok sekarang; angka final dihitung saat posting.</p>}
                <div className="table-responsive overflow-x-auto">
                    <table className="w-full">
                        <thead className="text-black dark:text-white">
                            <tr>
                                <th scope="col" className={th}>
                                    Produk
                                </th>
                                <th scope="col" className={th}>
                                    Batch
                                </th>
                                <th scope="col" className={th}>
                                    ED
                                </th>
                                <th scope="col" className={`${th} text-right`}>
                                    {isDraft ? 'Stok sistem' : 'Sistem'}
                                </th>
                                <th scope="col" className={th}>
                                    {isDraft ? 'Qty fisik' : <span className="block text-right">Fisik</span>}
                                </th>
                                <th scope="col" className={`${th} text-right`}>
                                    Selisih
                                </th>
                                {isDraft && (
                                    <th scope="col" className={th}>
                                        <span className="sr-only">Aksi</span>
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="text-black dark:text-white">
                            {visibleItems.length === 0 && newRows.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className={`${td} text-center text-gray-500`}>
                                        {search ? 'Tidak ada baris yang cocok' : 'Tidak ada batch berstok di cakupan ini. Tambahkan batch yang ditemukan di rak.'}
                                    </td>
                                </tr>
                            ) : (
                                visibleItems.map((i) => (isDraft ? draftRow(i) : postedRow(i)))
                            )}
                            {isDraft &&
                                newRows.map((r, n) => (
                                    <tr key={r.key} className="bg-info-50/40 dark:bg-[#15203c]/40">
                                        <td className={td}>
                                            <span className="font-medium block">{r.product.name}</span>
                                            <Badge color="info">Batch baru (belum disimpan)</Badge>
                                        </td>
                                        <td className={td}>
                                            <input
                                                className={`${cellInputClass} !w-[130px]`}
                                                aria-label={`No. batch baru ${n + 1}`}
                                                maxLength={50}
                                                value={r.batch_number}
                                                onChange={(e) => updateRow(r.key, { batch_number: e.target.value })}
                                            />
                                        </td>
                                        <td className={td}>
                                            <input
                                                className={`${cellInputClass} !w-[150px]`}
                                                aria-label={`ED batch baru ${n + 1}`}
                                                type="date"
                                                value={r.expiration_date}
                                                onChange={(e) => updateRow(r.key, { expiration_date: e.target.value })}
                                            />
                                        </td>
                                        <td className={td}>
                                            <input
                                                className={`${cellInputClass} !w-[120px]`}
                                                aria-label={`Harga beli per satuan dasar batch baru ${n + 1}`}
                                                title="Harga beli per satuan dasar"
                                                placeholder="HPP/satuan"
                                                type="number"
                                                inputMode="numeric"
                                                min={0}
                                                value={r.cost_price}
                                                onChange={(e) => updateRow(r.key, { cost_price: e.target.value })}
                                            />
                                        </td>
                                        <td className={td}>
                                            <input
                                                className={`${cellInputClass} !w-[110px]`}
                                                aria-label={`Qty fisik batch baru ${n + 1}`}
                                                type="number"
                                                inputMode="numeric"
                                                min={0}
                                                value={r.counted}
                                                onChange={(e) => updateRow(r.key, { counted: e.target.value })}
                                            />
                                        </td>
                                        <td className={`${td} text-right`}>
                                            <Diff value={isWholeNonNegative(r.counted) ? Number(r.counted) : null} />
                                        </td>
                                        <td className={`${td} text-right`}>
                                            <IconButton icon="delete" tone="danger" label={`Batalkan batch baru ${n + 1}`} onClick={() => setNewRows((rows) => rows.filter((x) => x.key !== r.key))} />
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
                {isDraft && (
                    <div className="mt-[20px] max-w-[480px]">
                        <p className="!mb-[8px] font-medium text-black dark:text-white">Barang fisik yang tidak tercatat</p>
                        <ProductPicker trackedOnly label="Tambah batch baru: cari produk" placeholder="Tambah batch baru: cari produk…" onSelect={addProduct} />
                    </div>
                )}
            </Card>
        </>
    );
};

export default OpnameDetailPage;
