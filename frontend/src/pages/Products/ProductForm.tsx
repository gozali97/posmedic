import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import FileUploader from '@/components/ui/FileUploader';
import { cellInputClass } from '@/components/ui/filters';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { storageUrl } from '@/config/api';
import { categoryService } from '@/services/master.service';
import { DRUG_CLASSES, type CategoryItem, type ProductItem, type ProductUnitInput } from '@/types/master.types';

interface UnitRow {
    /** Local key for React; units from the server keep their id. */
    key: string;
    id: number;
    name: string;
    conversion_qty: string;
    price: string;
    barcode: string;
    is_base: boolean;
}

interface FormState {
    name: string;
    generic_name: string;
    category_id: string;
    drug_class: string;
    shelf_location: string;
    min_stock: string;
    track_stock: boolean;
}

type FieldErrors = Partial<Record<keyof FormState | 'units', string>>;

let keySeq = 0;
const newKey = () => `u${++keySeq}`;

const toRows = (p?: ProductItem): UnitRow[] =>
    p && p.units.length > 0
        ? [...p.units]
              .sort((a, b) => a.conversion_qty - b.conversion_qty)
              .map((u) => ({ key: newKey(), id: u.id, name: u.name, conversion_qty: String(u.conversion_qty), price: String(u.price), barcode: u.barcode ?? '', is_base: u.is_base }))
        : [{ key: newKey(), id: 0, name: '', conversion_qty: '1', price: '', barcode: '', is_base: true }];

const toForm = (p?: ProductItem): FormState => ({
    name: p?.name ?? '',
    generic_name: p?.generic_name ?? '',
    category_id: p?.category_id ? String(p.category_id) : '',
    drug_class: p?.drug_class ?? 'bebas',
    shelf_location: p?.shelf_location ?? '',
    min_stock: String(p?.min_stock ?? 0),
    track_stock: p?.track_stock ?? true,
});

/** Same rules as backend parseUnits: one base unit with conversion 1, unique names and barcodes, price ≥ 0. */
const validateUnits = (rows: UnitRow[]): string | null => {
    if (rows.length === 0) return 'Minimal satu satuan';
    const names = new Set<string>();
    const barcodes = new Set<string>();
    for (const [i, r] of rows.entries()) {
        const name = r.name.trim();
        const conv = Number(r.conversion_qty);
        const price = Number(r.price);
        if (!name) return `Satuan ${i + 1}: nama wajib diisi`;
        if (names.has(name.toLowerCase())) return `Nama satuan ${name} dipakai dua kali`;
        names.add(name.toLowerCase());
        if (!Number.isInteger(conv) || conv <= 0) return `Satuan ${name}: konversi harus bilangan bulat > 0`;
        if (r.price === '' || !Number.isInteger(price) || price < 0) return `Satuan ${name}: harga jual wajib diisi (≥ 0)`;
        if (r.is_base && conv !== 1) return `Satuan dasar ${name} harus berkonversi 1`;
        const code = r.barcode.trim();
        if (code) {
            if (barcodes.has(code)) return `Barcode ${code} dipakai dua kali`;
            barcodes.add(code);
        }
    }
    if (rows.filter((r) => r.is_base).length !== 1) return 'Harus ada tepat satu satuan dasar (konversi 1)';
    return null;
};

interface ProductFormProps {
    /** Set when editing. */
    product?: ProductItem;
    saving: boolean;
    onSubmit: (form: FormData) => void;
}

/** Product fields + dynamic units table, sent as multipart (units as a JSON string). Stock is never edited here (F2). */
const ProductForm = ({ product, saving, onSubmit }: ProductFormProps) => {
    const [form, setForm] = useState<FormState>(() => toForm(product));
    const [units, setUnits] = useState<UnitRow[]>(() => toRows(product));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [categories, setCategories] = useState<CategoryItem[]>([]);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [removeImage, setRemoveImage] = useState(false);
    // Stock is kept in base units; the backend refuses a new base once batches exist.
    const baseLocked = (product?.stock ?? 0) > 0;

    useEffect(() => {
        const controller = new AbortController();
        categoryService
            .all(controller.signal)
            .then((res) => setCategories(res.data?.categories ?? []))
            .catch(() => setCategories([]));
        return () => controller.abort();
    }, []);

    const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors((e) => ({ ...e, [key]: undefined }));
    };

    const updateUnit = (key: string, patch: Partial<UnitRow>) => {
        setUnits((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        setErrors((e) => ({ ...e, units: undefined }));
    };

    const setBase = (key: string) => {
        setUnits((rows) => rows.map((r) => (r.key === key ? { ...r, is_base: true, conversion_qty: '1' } : { ...r, is_base: false })));
        setErrors((e) => ({ ...e, units: undefined }));
    };

    const addUnit = () => setUnits((rows) => [...rows, { key: newKey(), id: 0, name: '', conversion_qty: '', price: '', barcode: '', is_base: false }]);

    const removeUnit = (key: string) => setUnits((rows) => rows.filter((r) => r.key !== key));

    const validateForm = (): boolean => {
        const next: FieldErrors = {};
        if (!form.name.trim()) next.name = 'Nama dagang wajib diisi';
        const min = Number(form.min_stock);
        if (form.min_stock === '' || !Number.isInteger(min) || min < 0) next.min_stock = 'Stok minimum harus bilangan bulat ≥ 0';
        const unitError = validateUnits(units);
        if (unitError) next.units = unitError;
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;
        const payload: ProductUnitInput[] = units.map((u) => ({
            id: u.id,
            name: u.name.trim(),
            conversion_qty: Number(u.conversion_qty),
            price: Number(u.price),
            barcode: u.barcode.trim() || null,
            is_base: u.is_base,
        }));
        const body = new FormData();
        body.append('name', form.name.trim());
        body.append('generic_name', form.generic_name.trim());
        // Omitted = no category (the backend clears it on update).
        if (form.category_id) body.append('category_id', form.category_id);
        body.append('drug_class', form.drug_class);
        body.append('shelf_location', form.shelf_location.trim());
        body.append('min_stock', String(Number(form.min_stock)));
        body.append('track_stock', String(form.track_stock));
        body.append('units', JSON.stringify(payload));
        if (imageFile) body.append('image', imageFile);
        else if (removeImage) body.append('remove_image', 'true');
        onSubmit(body);
    };

    const base = units.find((u) => u.is_base);
    const baseName = base?.name.trim() || 'satuan dasar';

    return (
        <form onSubmit={handleSubmit} noValidate>
            <Card title="Data produk">
                <div className="sm:grid sm:grid-cols-2 sm:gap-[25px]">
                    <Input label="Nama dagang" required maxLength={150} value={form.name} onChange={(e) => setField('name', e.target.value)} error={errors.name} wrapperClassName="mb-[20px] sm:mb-0" />
                    <Input
                        label="Nama generik / zat aktif"
                        maxLength={150}
                        placeholder="mis. Paracetamol 500 mg"
                        value={form.generic_name}
                        onChange={(e) => setField('generic_name', e.target.value)}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Select
                        label="Kategori"
                        placeholder="Tanpa kategori"
                        options={categories.map((c) => ({ value: c.id, label: c.name }))}
                        value={form.category_id}
                        onChange={(e) => setField('category_id', e.target.value)}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Select
                        label="Golongan obat"
                        required
                        options={DRUG_CLASSES.map((c) => ({ value: c.value, label: c.label }))}
                        value={form.drug_class}
                        onChange={(e) => setField('drug_class', e.target.value)}
                        hint={form.drug_class === 'narkotika' || form.drug_class === 'psikotropika' ? 'Penjualan wajib pelanggan (pasien) dan no. resep.' : undefined}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Input
                        label="Lokasi rak"
                        maxLength={30}
                        placeholder="mis. A-03"
                        value={form.shelf_location}
                        onChange={(e) => setField('shelf_location', e.target.value)}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Input
                        label={`Stok minimum (${baseName})`}
                        required
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={form.min_stock}
                        onChange={(e) => setField('min_stock', e.target.value)}
                        error={errors.min_stock}
                        hint="Stok jual ≤ angka ini ditandai Menipis."
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <div>
                        <Checkbox
                            label="Lacak stok"
                            description="Matikan untuk jasa (embalase, biaya racik): tanpa batch, tanpa cek stok."
                            checked={form.track_stock}
                            onChange={(e) => setField('track_stock', e.target.checked)}
                        />
                    </div>
                    <FileUploader
                        label="Gambar"
                        file={imageFile}
                        currentUrl={removeImage ? null : storageUrl(product?.image)}
                        onChange={setImageFile}
                        onRemoveCurrent={product?.image ? () => setRemoveImage(true) : undefined}
                    />
                </div>
            </Card>

            <Card
                title="Satuan & harga jual"
                actions={
                    <Button size="sm" variant="outline" icon="add" onClick={addUnit}>
                        Tambah satuan
                    </Button>
                }
            >
                <p className="!mb-[15px]">
                    Satuan dasar = satuan terkecil (konversi 1); stok selalu dihitung dalam satuan ini. Satuan lain diisi kelipatannya, mis. strip = 10 {baseName}. Harga jual sudah termasuk PPN.
                    {baseLocked && ' Satuan dasar tidak bisa diganti karena produk sudah punya stok.'}
                </p>
                <div className="table-responsive overflow-x-auto">
                    <table className="w-full">
                        <thead className="text-black dark:text-white">
                            <tr>
                                {['Dasar', 'Nama satuan', `Konversi (${baseName})`, 'Harga jual', 'Barcode', ''].map((h, i) => (
                                    <th key={i} scope="col" className="font-medium text-left px-[10px] py-[10px] bg-gray-50 dark:bg-[#15203c] whitespace-nowrap">
                                        {h || <span className="sr-only">Aksi</span>}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {units.map((u, i) => (
                                <tr key={u.key} className="border-b border-gray-100 dark:border-[#172036]">
                                    <td className="px-[10px] py-[8px] text-center">
                                        <input
                                            type="radio"
                                            name="base-unit"
                                            aria-label={`Jadikan satuan ${i + 1} satuan dasar`}
                                            checked={u.is_base}
                                            disabled={baseLocked && !u.is_base}
                                            onChange={() => setBase(u.key)}
                                        />
                                    </td>
                                    <td className="px-[10px] py-[8px]">
                                        <input
                                            className={cellInputClass}
                                            aria-label={`Nama satuan ${i + 1}`}
                                            maxLength={30}
                                            placeholder={u.is_base ? 'tablet' : 'strip'}
                                            value={u.name}
                                            onChange={(e) => updateUnit(u.key, { name: e.target.value })}
                                        />
                                    </td>
                                    <td className="px-[10px] py-[8px]">
                                        <input
                                            className={cellInputClass}
                                            aria-label={`Konversi satuan ${i + 1}`}
                                            type="number"
                                            inputMode="numeric"
                                            min={1}
                                            value={u.conversion_qty}
                                            disabled={u.is_base}
                                            onChange={(e) => updateUnit(u.key, { conversion_qty: e.target.value })}
                                        />
                                    </td>
                                    <td className="px-[10px] py-[8px]">
                                        <input
                                            className={cellInputClass}
                                            aria-label={`Harga jual satuan ${i + 1}`}
                                            type="number"
                                            inputMode="numeric"
                                            min={0}
                                            value={u.price}
                                            onChange={(e) => updateUnit(u.key, { price: e.target.value })}
                                        />
                                    </td>
                                    <td className="px-[10px] py-[8px]">
                                        <input
                                            className={cellInputClass}
                                            aria-label={`Barcode satuan ${i + 1}`}
                                            maxLength={64}
                                            placeholder="opsional"
                                            value={u.barcode}
                                            onChange={(e) => updateUnit(u.key, { barcode: e.target.value })}
                                        />
                                    </td>
                                    <td className="px-[10px] py-[8px] text-right">
                                        <IconButton icon="delete" tone="danger" label={`Hapus satuan ${i + 1}`} disabled={u.is_base} onClick={() => removeUnit(u.key)} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {errors.units && (
                    <p className="!mt-[10px] !mb-0 text-sm text-danger-500" role="alert">
                        {errors.units}
                    </p>
                )}
            </Card>

            <div className="flex flex-wrap gap-[12px] mb-[25px]">
                <Button type="submit" icon="check" loading={saving}>
                    {product ? 'Simpan perubahan' : 'Simpan produk'}
                </Button>
                <Link
                    to={product ? `/products/${product.id}` : '/products'}
                    className="inline-flex items-center rounded-md border border-gray-200 dark:border-[#172036] py-[10px] md:py-[12px] px-[20px] transition-all hover:border-primary-500 hover:text-primary-500"
                >
                    Batal
                </Link>
            </div>
        </form>
    );
};

export default ProductForm;
