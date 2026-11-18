import { useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import FileUploader from '@/components/ui/FileUploader';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { storageUrl } from '@/config/api';
import { errorMessage } from '@/services/api.service';
import { settingService } from '@/services/setting.service';
import { useAppDispatch } from '@/store';
import { setStoreSetting } from '@/store/settingSlice';
import type { StoreSetting } from '@/types/setting.types';
import { toast } from '@/utils/toast';

interface FormState {
    store_name: string;
    address_one: string;
    address_two: string;
    contact: string;
    sia_number: string;
    pharmacist_name: string;
    sipa_number: string;
    tax_number: string;
    is_pkp: boolean;
    ppn_rate: string;
    currency_symbol: string;
    quick_billing: boolean;
    expiry_warning_days: string;
    receipt_footer: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const toForm = (s: StoreSetting | null): FormState => ({
    store_name: s?.store_name ?? '',
    address_one: s?.address_one ?? '',
    address_two: s?.address_two ?? '',
    contact: s?.contact ?? '',
    sia_number: s?.sia_number ?? '',
    pharmacist_name: s?.pharmacist_name ?? '',
    sipa_number: s?.sipa_number ?? '',
    tax_number: s?.tax_number ?? '',
    is_pkp: s?.is_pkp ?? false,
    ppn_rate: String(s?.ppn_rate ?? 11),
    currency_symbol: s?.currency_symbol ?? 'Rp',
    quick_billing: s?.quick_billing ?? false,
    expiry_warning_days: String(s?.expiry_warning_days ?? 90),
    receipt_footer: s?.receipt_footer ?? '',
});

const REQUIRED: { key: keyof FormState; label: string }[] = [
    { key: 'store_name', label: 'Nama toko' },
    { key: 'address_one', label: 'Alamat 1' },
    { key: 'contact', label: 'Kontak' },
    { key: 'sia_number', label: 'No. SIA' },
    { key: 'pharmacist_name', label: 'Apoteker penanggung jawab' },
    { key: 'sipa_number', label: 'No. SIPA' },
    { key: 'currency_symbol', label: 'Simbol mata uang' },
];

interface StoreSettingFormProps {
    setting: StoreSetting | null;
    onSaved: (setting: StoreSetting) => void;
}

const StoreSettingForm = ({ setting, onSaved }: StoreSettingFormProps) => {
    const dispatch = useAppDispatch();
    const [form, setForm] = useState<FormState>(() => toForm(setting));
    const [errors, setErrors] = useState<FormErrors>({});
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [removeLogo, setRemoveLogo] = useState(false);
    const [saving, setSaving] = useState(false);

    const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors((e) => ({ ...e, [key]: undefined }));
    };

    const validateForm = (): boolean => {
        const next: FormErrors = {};
        REQUIRED.forEach(({ key, label }) => {
            if (!String(form[key]).trim()) next[key] = `${label} wajib diisi`;
        });
        const days = Number(form.expiry_warning_days);
        if (!Number.isInteger(days) || days < 1 || days > 730) next.expiry_warning_days = 'Isi 1–730 hari';
        const rate = Number(form.ppn_rate);
        if (form.ppn_rate.trim() === '' || Number.isNaN(rate) || rate < 0 || rate >= 100) next.ppn_rate = 'Tarif PPN 0–99,99';
        if (form.is_pkp && !form.tax_number.trim()) next.tax_number = 'NPWP wajib diisi untuk toko PKP';
        if (form.is_pkp && rate <= 0) next.ppn_rate = 'Tarif PPN wajib diisi untuk toko PKP';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!validateForm()) {
            toast.error('Periksa kembali isian yang ditandai');
            return;
        }
        const body = new FormData();
        Object.entries(form).forEach(([key, value]) => body.append(key, typeof value === 'boolean' ? String(value) : value.trim()));
        if (logoFile) body.append('logo', logoFile);
        else if (removeLogo) body.append('remove_logo', 'true');

        setSaving(true);
        try {
            const res = await settingService.update(body);
            dispatch(setStoreSetting(res.data!));
            onSaved(res.data!);
            setLogoFile(null);
            setRemoveLogo(false);
            toast.success(res.message);
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const currentLogo = removeLogo ? null : storageUrl(setting?.logo);

    return (
        <form onSubmit={handleSubmit} noValidate>
            <Card title="Identitas apotek">
                <div className="sm:grid sm:grid-cols-2 sm:gap-[25px]">
                    <Input
                        label="Nama toko"
                        required
                        maxLength={150}
                        value={form.store_name}
                        onChange={(e) => setField('store_name', e.target.value)}
                        error={errors.store_name}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Input
                        label="Kontak (telepon)"
                        required
                        maxLength={50}
                        value={form.contact}
                        onChange={(e) => setField('contact', e.target.value)}
                        error={errors.contact}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Input
                        label="Alamat 1"
                        required
                        maxLength={255}
                        value={form.address_one}
                        onChange={(e) => setField('address_one', e.target.value)}
                        error={errors.address_one}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Input label="Alamat 2" maxLength={255} value={form.address_two} onChange={(e) => setField('address_two', e.target.value)} wrapperClassName="mb-[20px] sm:mb-0" />
                    <Input
                        label="No. SIA"
                        required
                        maxLength={50}
                        value={form.sia_number}
                        onChange={(e) => setField('sia_number', e.target.value)}
                        error={errors.sia_number}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <div className="hidden sm:block" />
                    <Input
                        label="Apoteker penanggung jawab"
                        required
                        maxLength={100}
                        value={form.pharmacist_name}
                        onChange={(e) => setField('pharmacist_name', e.target.value)}
                        error={errors.pharmacist_name}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Input
                        label="No. SIPA"
                        required
                        maxLength={50}
                        value={form.sipa_number}
                        onChange={(e) => setField('sipa_number', e.target.value)}
                        error={errors.sipa_number}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <div className="sm:col-span-2">
                        <FileUploader
                            label="Logo (struk & sidebar)"
                            file={logoFile}
                            currentUrl={currentLogo}
                            onChange={(f) => {
                                setLogoFile(f);
                                if (f) setRemoveLogo(false);
                            }}
                            onRemoveCurrent={() => setRemoveLogo(true)}
                        />
                    </div>
                </div>
            </Card>

            <Card title="Pajak">
                <Checkbox
                    label="Toko PKP (Pengusaha Kena Pajak)"
                    description="Struk menampilkan NPWP, DPP, dan PPN. Harga jual tetap sudah termasuk PPN."
                    checked={form.is_pkp}
                    onChange={(e) => setField('is_pkp', e.target.checked)}
                    className="mb-[20px]"
                />
                <div className="sm:grid sm:grid-cols-2 sm:gap-[25px]">
                    <Input
                        label="NPWP"
                        required={form.is_pkp}
                        maxLength={30}
                        value={form.tax_number}
                        onChange={(e) => setField('tax_number', e.target.value)}
                        error={errors.tax_number}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Input
                        label="Tarif PPN (%)"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={99.99}
                        step="0.01"
                        value={form.ppn_rate}
                        onChange={(e) => setField('ppn_rate', e.target.value)}
                        error={errors.ppn_rate}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                </div>
            </Card>

            <Card title="Kasir & struk">
                <div className="sm:grid sm:grid-cols-2 sm:gap-[25px]">
                    <Input
                        label="Simbol mata uang"
                        required
                        maxLength={5}
                        value={form.currency_symbol}
                        onChange={(e) => setField('currency_symbol', e.target.value)}
                        error={errors.currency_symbol}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Input
                        label="Peringatan ED (hari)"
                        required
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={730}
                        value={form.expiry_warning_days}
                        onChange={(e) => setField('expiry_warning_days', e.target.value)}
                        error={errors.expiry_warning_days}
                        hint="Batch dengan ED kurang dari jumlah hari ini ditandai hampir kedaluwarsa."
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <div className="sm:col-span-2 mb-[20px] sm:mb-0">
                        <Checkbox
                            label="Quick billing"
                            description="Tombol Bayar langsung mencatat pembayaran tunai uang pas, tanpa modal pembayaran."
                            checked={form.quick_billing}
                            onChange={(e) => setField('quick_billing', e.target.checked)}
                        />
                    </div>
                    <Textarea
                        label="Footer struk"
                        maxLength={500}
                        value={form.receipt_footer}
                        onChange={(e) => setField('receipt_footer', e.target.value)}
                        placeholder="mis. Terima kasih, semoga lekas sembuh"
                        wrapperClassName="sm:col-span-2"
                    />
                </div>
            </Card>

            <div className="mb-[25px]">
                <Button type="submit" icon="check" loading={saving}>
                    Simpan pengaturan
                </Button>
            </div>
        </form>
    );
};

export default StoreSettingForm;
