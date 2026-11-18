import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import ProductPicker from '@/components/ProductPicker';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { cellInputClass } from '@/components/ui/filters';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import PageHeader from '@/components/ui/PageHeader';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { errorMessage } from '@/services/api.service';
import { supplierService } from '@/services/master.service';
import { purchaseService } from '@/services/stock.service';
import type { ProductItem, Supplier } from '@/types/master.types';
import type { PurchasePayload } from '@/types/stock.types';
import { formatRupiah, toJakartaDateString } from '@/utils/format';
import { confirmDialog, toast } from '@/utils/toast';

interface ItemRow {
    key: string;
    product: ProductItem;
    unit_id: string;
    quantity: string;
    unit_cost: string;
    batch_number: string;
    expiration_date: string;
}

interface Header {
    supplier_id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    note: string;
}

type HeaderErrors = Partial<Record<keyof Header | 'items', string>>;

/** "YYYY-MM-DD" + n calendar days. */
const addDays = (date: string, days: number): string => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

let keySeq = 0;

const PurchaseCreate = () => {
    const navigate = useNavigate();
    const today = toJakartaDateString();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [header, setHeader] = useState<Header>({ supplier_id: '', invoice_number: '', invoice_date: today, due_date: '', note: '' });
    // Until the user picks a due date, it follows invoice date + supplier term (F6 default).
    const [dueTouched, setDueTouched] = useState(false);
    const [items, setItems] = useState<ItemRow[]>([]);
    const [errors, setErrors] = useState<HeaderErrors>({});
    const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        supplierService
            .all(controller.signal)
            .then((res) => setSuppliers(res.data?.suppliers ?? []))
            .catch((err) => {
                if (!controller.signal.aborted) toast.error(errorMessage(err, 'Gagal memuat supplier'));
            });
        return () => controller.abort();
    }, []);

    const supplier = suppliers.find((s) => String(s.id) === header.supplier_id);
    const autoDue = supplier && header.invoice_date ? addDays(header.invoice_date, supplier.payment_term_days) : '';
    const dueDate = dueTouched ? header.due_date : autoDue;

    const setField = (key: keyof Header, value: string) => {
        setHeader((h) => ({ ...h, [key]: value }));
        setErrors((e) => ({ ...e, [key]: undefined }));
    };

    const addProduct = (p: ProductItem) => {
        // Purchases usually come in the biggest unit (box).
        const unit = [...p.units].sort((a, b) => b.conversion_qty - a.conversion_qty)[0];
        setItems((rows) => [...rows, { key: `r${++keySeq}`, product: p, unit_id: unit ? String(unit.id) : '', quantity: '1', unit_cost: '', batch_number: '', expiration_date: '' }]);
        setErrors((e) => ({ ...e, items: undefined }));
    };

    const updateItem = (key: string, patch: Partial<ItemRow>) => {
        setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        setRowErrors((e) => ({ ...e, [key]: '' }));
    };

    /** Another batch of the same product and unit (one product may arrive in several batches). */
    const duplicateItem = (row: ItemRow) => {
        setItems((rows) => {
            const i = rows.findIndex((r) => r.key === row.key);
            const copy = { ...row, key: `r${++keySeq}`, batch_number: '', expiration_date: '' };
            return [...rows.slice(0, i + 1), copy, ...rows.slice(i + 1)];
        });
    };

    const lineTotal = (r: ItemRow) => (Number(r.quantity) || 0) * (Number(r.unit_cost) || 0);
    const grandTotal = items.reduce((sum, r) => sum + lineTotal(r), 0);

    const validateForm = (): boolean => {
        const next: HeaderErrors = {};
        if (!header.supplier_id) next.supplier_id = 'Pilih supplier';
        if (!header.invoice_number.trim()) next.invoice_number = 'No. faktur wajib diisi';
        if (!header.invoice_date) next.invoice_date = 'Tanggal faktur wajib diisi';
        if (dueDate && header.invoice_date && dueDate < header.invoice_date) next.due_date = 'Jatuh tempo tidak boleh sebelum tanggal faktur';
        if (items.length === 0) next.items = 'Tambahkan minimal satu item';

        const rows: Record<string, string> = {};
        items.forEach((r) => {
            const qty = Number(r.quantity);
            const cost = Number(r.unit_cost);
            if (!r.unit_id) rows[r.key] = 'Pilih satuan';
            else if (!Number.isInteger(qty) || qty <= 0) rows[r.key] = 'Qty harus bilangan bulat > 0';
            else if (r.unit_cost === '' || !Number.isInteger(cost) || cost < 0) rows[r.key] = 'Harga beli wajib diisi (≥ 0)';
            else if (!r.batch_number.trim()) rows[r.key] = 'No. batch wajib diisi';
            else if (!r.expiration_date) rows[r.key] = 'ED wajib diisi';
            else if (r.expiration_date <= today) rows[r.key] = 'ED harus setelah hari ini';
        });
        setErrors(next);
        setRowErrors(rows);
        return Object.keys(next).length === 0 && Object.keys(rows).length === 0;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;
        const ok = await confirmDialog({
            title: 'Posting penerimaan barang?',
            text: `Total ${formatRupiah(grandTotal)}. Stok langsung bertambah dan penerimaan tidak bisa diubah atau dihapus. Salah input dikoreksi lewat penyesuaian stok.`,
            confirmText: 'Posting',
        });
        if (!ok) return;
        const body: PurchasePayload = {
            supplier_id: Number(header.supplier_id),
            invoice_number: header.invoice_number.trim(),
            invoice_date: header.invoice_date,
            note: header.note.trim(),
            items: items.map((r) => ({
                product_unit_id: Number(r.unit_id),
                quantity: Number(r.quantity),
                unit_cost: Number(r.unit_cost),
                batch_number: r.batch_number.trim(),
                expiration_date: r.expiration_date,
            })),
        };
        if (dueDate) body.due_date = dueDate;
        setSaving(true);
        try {
            const res = await purchaseService.create(body);
            toast.success(res.message);
            navigate(`/purchases/${res.data!.id}`);
        } catch (err) {
            const message = errorMessage(err);
            if (message.startsWith('No. faktur')) setErrors((x) => ({ ...x, invoice_number: message }));
            else toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    const th = 'font-medium text-left px-[8px] py-[10px] bg-gray-50 dark:bg-[#15203c] whitespace-nowrap';
    const td = 'px-[8px] py-[8px] align-top';

    return (
        <>
            <PageHeader title="Input Penerimaan Barang" breadcrumbs={[{ label: 'Penerimaan Barang', to: '/purchases' }, { label: 'Input' }]} />
            <form onSubmit={handleSubmit} noValidate>
                <Card title="Faktur supplier">
                    <div className="sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-[25px]">
                        <Select
                            label="Supplier"
                            required
                            placeholder="Pilih supplier"
                            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                            value={header.supplier_id}
                            onChange={(e) => setField('supplier_id', e.target.value)}
                            error={errors.supplier_id}
                            wrapperClassName="mb-[20px] sm:mb-0"
                        />
                        <Input
                            label="No. faktur"
                            required
                            maxLength={50}
                            value={header.invoice_number}
                            onChange={(e) => setField('invoice_number', e.target.value)}
                            error={errors.invoice_number}
                            wrapperClassName="mb-[20px] sm:mb-0"
                        />
                        <Input
                            label="Tanggal faktur"
                            required
                            type="date"
                            max={today}
                            value={header.invoice_date}
                            onChange={(e) => setField('invoice_date', e.target.value)}
                            error={errors.invoice_date}
                            wrapperClassName="mb-[20px] sm:mb-0"
                        />
                        <Input
                            label="Jatuh tempo"
                            type="date"
                            min={header.invoice_date || undefined}
                            value={dueDate}
                            onChange={(e) => {
                                setDueTouched(true);
                                setField('due_date', e.target.value);
                            }}
                            error={errors.due_date}
                            hint={supplier && !dueTouched ? `Tanggal faktur + termin ${supplier.payment_term_days} hari` : undefined}
                            wrapperClassName="mb-[20px] sm:mb-0"
                        />
                    </div>
                    <Textarea label="Catatan" maxLength={500} rows={2} value={header.note} onChange={(e) => setField('note', e.target.value)} wrapperClassName="sm:mt-[20px]" />
                </Card>

                <Card title="Item">
                    <p className="!mb-[15px]">Harga beli per satuan setelah diskon faktur, termasuk PPN. Satu produk boleh beberapa baris dengan batch berbeda.</p>
                    {items.length > 0 && (
                        <div className="table-responsive overflow-x-auto mb-[15px]">
                            <table className="w-full">
                                <thead className="text-black dark:text-white">
                                    <tr>
                                        <th scope="col" className={th}>
                                            Produk
                                        </th>
                                        <th scope="col" className={th}>
                                            Satuan
                                        </th>
                                        <th scope="col" className={th}>
                                            Qty
                                        </th>
                                        <th scope="col" className={th}>
                                            Harga beli / satuan
                                        </th>
                                        <th scope="col" className={th}>
                                            No. batch
                                        </th>
                                        <th scope="col" className={th}>
                                            ED
                                        </th>
                                        <th scope="col" className={`${th} text-right`}>
                                            Subtotal
                                        </th>
                                        <th scope="col" className={th}>
                                            <span className="sr-only">Aksi</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((r, i) => {
                                        const n = i + 1;
                                        const unit = r.product.units.find((u) => String(u.id) === r.unit_id);
                                        return (
                                            <tr key={r.key} className="border-b border-gray-100 dark:border-[#172036]">
                                                <td className={td}>
                                                    <span className="font-medium text-black dark:text-white block">{r.product.name}</span>
                                                    {unit && !unit.is_base && (
                                                        <span className="text-xs text-gray-500">
                                                            1 {unit.name} = {unit.conversion_qty} {r.product.units.find((u) => u.is_base)?.name}
                                                        </span>
                                                    )}
                                                    {rowErrors[r.key] && (
                                                        <span className="block text-sm text-danger-500" role="alert">
                                                            Baris {n}: {rowErrors[r.key]}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className={td}>
                                                    <select
                                                        className={cellInputClass}
                                                        aria-label={`Satuan baris ${n}`}
                                                        value={r.unit_id}
                                                        onChange={(e) => updateItem(r.key, { unit_id: e.target.value })}
                                                    >
                                                        {r.product.units.map((u) => (
                                                            <option key={u.id} value={u.id}>
                                                                {u.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className={td}>
                                                    <input
                                                        className={`${cellInputClass} !w-[90px]`}
                                                        aria-label={`Qty baris ${n}`}
                                                        type="number"
                                                        inputMode="numeric"
                                                        min={1}
                                                        value={r.quantity}
                                                        onChange={(e) => updateItem(r.key, { quantity: e.target.value })}
                                                    />
                                                </td>
                                                <td className={td}>
                                                    <input
                                                        className={`${cellInputClass} !w-[130px]`}
                                                        aria-label={`Harga beli baris ${n}`}
                                                        type="number"
                                                        inputMode="numeric"
                                                        min={0}
                                                        value={r.unit_cost}
                                                        onChange={(e) => updateItem(r.key, { unit_cost: e.target.value })}
                                                    />
                                                </td>
                                                <td className={td}>
                                                    <input
                                                        className={`${cellInputClass} !w-[130px]`}
                                                        aria-label={`No. batch baris ${n}`}
                                                        maxLength={50}
                                                        value={r.batch_number}
                                                        onChange={(e) => updateItem(r.key, { batch_number: e.target.value })}
                                                    />
                                                </td>
                                                <td className={td}>
                                                    <input
                                                        className={`${cellInputClass} !w-[150px]`}
                                                        aria-label={`ED baris ${n}`}
                                                        type="date"
                                                        min={addDays(today, 1)}
                                                        value={r.expiration_date}
                                                        onChange={(e) => updateItem(r.key, { expiration_date: e.target.value })}
                                                    />
                                                </td>
                                                <td className={`${td} text-right whitespace-nowrap pt-[16px]`}>{formatRupiah(lineTotal(r))}</td>
                                                <td className={`${td} whitespace-nowrap`}>
                                                    <IconButton icon="content_copy" tone="gray" label={`Tambah batch lain untuk baris ${n}`} onClick={() => duplicateItem(r)} />
                                                    <IconButton icon="delete" tone="danger" label={`Hapus baris ${n}`} onClick={() => setItems((rows) => rows.filter((x) => x.key !== r.key))} />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={6} className="px-[8px] py-[12px] text-right font-semibold text-black dark:text-white">
                                            Total faktur
                                        </td>
                                        <td className="px-[8px] py-[12px] text-right font-semibold text-black dark:text-white whitespace-nowrap">{formatRupiah(grandTotal)}</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                    <div className="max-w-[480px]">
                        <ProductPicker trackedOnly label="Tambah item: cari produk" placeholder="Tambah item: cari produk (nama, generik, barcode)…" onSelect={addProduct} />
                    </div>
                    {errors.items && (
                        <p className="!mt-[10px] !mb-0 text-sm text-danger-500" role="alert">
                            {errors.items}
                        </p>
                    )}
                </Card>

                <div className="flex flex-wrap gap-[12px] mb-[25px]">
                    <Button type="submit" icon="inventory" loading={saving}>
                        Posting penerimaan
                    </Button>
                    <Link
                        to="/purchases"
                        className="inline-flex items-center rounded-md border border-gray-200 dark:border-[#172036] py-[10px] md:py-[12px] px-[20px] transition-all hover:border-primary-500 hover:text-primary-500"
                    >
                        Batal
                    </Link>
                </div>
            </form>
        </>
    );
};

export default PurchaseCreate;
