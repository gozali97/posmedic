import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import Button from '@/components/ui/Button';
import Input, { FieldWrapper, fieldBorder, fieldClass } from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { useDebounce } from '@/hooks/useDebounce';
import { errorMessage } from '@/services/api.service';
import { customerService } from '@/services/master.service';
import type { Customer } from '@/types/master.types';
import { toast } from '@/utils/toast';

export type CustomerRef = Pick<Customer, 'id' | 'name' | 'phone'>;

interface CustomerSelectProps {
    value: CustomerRef | null;
    onChange: (customer: CustomerRef | null) => void;
    label?: string;
    required?: boolean;
    error?: string;
    hint?: string;
    wrapperClassName?: string;
}

/** Sentinel option that opens the quick-add form with the typed name. */
const CREATE_ID = -1;

/** Searches customers by name/phone as you type (F4); can add a new customer (patient) without leaving the POS. */
const CustomerSelect = ({ value, onChange, label = 'Pelanggan', required, error, hint, wrapperClassName }: CustomerSelectProps) => {
    const id = useId();
    const [query, setQuery] = useState('');
    const debounced = useDebounce(query, 250);
    const [options, setOptions] = useState<CustomerRef[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState<{ name: string; phone: string; address: string } | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        customerService
            .list({ search: debounced.trim(), per_page: 8 }, controller.signal)
            .then((res) => setOptions(res.data?.customers ?? []))
            .catch(() => {
                /* aborted or offline: keep the last options */
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [debounced]);

    const handleSelect = (c: CustomerRef | null) => {
        if (c?.id === CREATE_ID) {
            setCreating({ name: query.trim(), phone: '', address: '' });
            return;
        }
        onChange(c);
        setQuery('');
    };

    const handleCreate = async (e: FormEvent) => {
        e.preventDefault();
        e.stopPropagation(); // the select may sit inside another form
        if (!creating?.name.trim()) return;
        setSaving(true);
        try {
            const res = await customerService.create({ name: creating.name.trim(), phone: creating.phone.trim() || null, email: null, address: creating.address.trim() || null });
            if (res.data) onChange(res.data);
            toast.success(res.message);
            setCreating(null);
            setQuery('');
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const showCreate = query.trim().length > 0;

    return (
        <FieldWrapper id={id} label={label} required={required} error={error} hint={hint} className={wrapperClassName}>
            <Combobox value={value} onChange={handleSelect} by="id" onClose={() => setQuery('')} immediate>
                <div className="relative">
                    <ComboboxInput
                        id={id}
                        className={`${fieldClass} ${fieldBorder(error)} pr-[78px]`}
                        placeholder="Cari nama atau telepon…"
                        autoComplete="off"
                        aria-invalid={error ? true : undefined}
                        displayValue={(c: CustomerRef | null) => (c ? `${c.name}${c.phone ? ` · ${c.phone}` : ''}` : '')}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <div className="absolute right-[10px] top-1/2 -translate-y-1/2 flex items-center gap-[2px]">
                        {value && (
                            <button type="button" className="leading-none p-[4px] rounded-md hover:text-danger-500" onClick={() => onChange(null)} aria-label="Kosongkan pelanggan" title="Kosongkan">
                                <i className="material-symbols-outlined !text-[20px]">close</i>
                            </button>
                        )}
                        <ComboboxButton className="leading-none p-[4px]" aria-label="Tampilkan pelanggan">
                            <i className="material-symbols-outlined !text-[20px]">expand_more</i>
                        </ComboboxButton>
                    </div>
                </div>
                <ComboboxOptions
                    anchor={{ to: 'bottom start', gap: 4 }}
                    className="z-[70] w-[var(--input-width)] max-h-[280px] overflow-y-auto rounded-md border border-gray-100 dark:border-[#172036] bg-white dark:bg-[#0c1427] shadow-lg py-[4px] empty:invisible"
                >
                    {options.map((c) => (
                        <ComboboxOption key={c.id} value={c} className="px-[15px] py-[8px] cursor-pointer data-[focus]:bg-primary-50 dark:data-[focus]:bg-[#15203c] data-[selected]:font-semibold">
                            <span className="text-black dark:text-white">{c.name}</span>
                            {c.phone && <span className="text-gray-500 text-sm"> · {c.phone}</span>}
                        </ComboboxOption>
                    ))}
                    {!loading && options.length === 0 && !showCreate && <div className="px-[15px] py-[8px] text-gray-500 text-sm">Belum ada pelanggan</div>}
                    {showCreate && (
                        <ComboboxOption
                            value={{ id: CREATE_ID, name: query, phone: null }}
                            className="px-[15px] py-[8px] cursor-pointer text-primary-500 border-t border-gray-100 dark:border-[#172036] data-[focus]:bg-primary-50 dark:data-[focus]:bg-[#15203c]"
                        >
                            <i className="material-symbols-outlined !text-[18px] align-middle mr-[4px]" aria-hidden="true">
                                person_add
                            </i>
                            Tambah pelanggan “{query.trim()}”
                        </ComboboxOption>
                    )}
                </ComboboxOptions>
            </Combobox>

            <Modal
                open={creating !== null}
                onClose={() => setCreating(null)}
                title="Tambah pelanggan"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setCreating(null)}>
                            Batal
                        </Button>
                        <Button type="submit" form="quick-customer-form" icon="check" loading={saving}>
                            Simpan
                        </Button>
                    </>
                }
            >
                {creating && (
                    <form id="quick-customer-form" onSubmit={handleCreate} noValidate className="space-y-[15px]">
                        <Input label="Nama" required maxLength={100} value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} autoFocus />
                        <Input label="Telepon" maxLength={30} inputMode="tel" value={creating.phone} onChange={(e) => setCreating({ ...creating, phone: e.target.value })} />
                        <Input label="Alamat" maxLength={500} value={creating.address} onChange={(e) => setCreating({ ...creating, address: e.target.value })} />
                    </form>
                )}
            </Modal>
        </FieldWrapper>
    );
};

export default CustomerSelect;
