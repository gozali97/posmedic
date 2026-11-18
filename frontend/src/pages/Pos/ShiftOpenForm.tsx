import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { TOKEN_KEYS } from '@/config/api';
import { errorMessage, tokenStorage } from '@/services/api.service';
import { shiftService } from '@/services/sales.service';
import { tillService } from '@/services/setting.service';
import { useAppSelector } from '@/store';
import type { Shift } from '@/types/sales.types';
import type { Till } from '@/types/setting.types';
import { toast } from '@/utils/toast';

/** F9/F10: shown on the POS until the cashier opens a shift with the opening cash in the drawer. */
const ShiftOpenForm = ({ onOpened }: { onOpened: (shift: Shift) => void }) => {
    const user = useAppSelector((s) => s.auth.user);
    const canManageTills = user?.perm_settings ?? false;
    const [tills, setTills] = useState<Till[] | null>(null);
    const [loadError, setLoadError] = useState('');
    const [reload, setReload] = useState(0);
    const [tillId, setTillId] = useState('');
    const [cash, setCash] = useState('');
    const [errors, setErrors] = useState<{ till?: string; cash?: string }>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let active = true;
        setTills(null);
        setLoadError('');
        tillService
            .list()
            .then((res) => {
                if (!active) return;
                const list = res.data ?? [];
                setTills(list);
                // This browser's till is remembered (one choice per cashier machine).
                const saved = tokenStorage.get(TOKEN_KEYS.till);
                const pick = list.find((t) => String(t.id) === saved) ?? (list.length === 1 ? list[0] : undefined);
                if (pick) setTillId(String(pick.id));
            })
            .catch((err) => {
                if (active) setLoadError(errorMessage(err, 'Gagal memuat mesin kasir'));
            });
        return () => {
            active = false;
        };
    }, [reload]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const next: typeof errors = {};
        const amount = Number(cash);
        if (!tills?.some((till) => String(till.id) === tillId)) next.till = 'Pilih mesin kasir yang tersedia';
        if (cash.trim() === '' || !Number.isInteger(amount) || amount < 0) next.cash = 'Isi modal awal (rupiah, ≥ 0)';
        setErrors(next);
        if (Object.keys(next).length) return;
        setSaving(true);
        try {
            const res = await shiftService.open(Number(tillId), amount);
            tokenStorage.set(TOKEN_KEYS.till, tillId);
            toast.success(res.message);
            if (res.data) onOpened(res.data);
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="w-full min-w-0 space-y-6 pb-6">
            <section className="border-b border-gray-200 dark:border-gray-700 pb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="!mb-2 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
                        <i className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                            point_of_sale
                        </i>
                        Persiapan kasir
                    </p>
                    <h2 className="!text-2xl md:!text-3xl !mb-2">Selamat bekerja, {user?.fullname || 'Kasir'}.</h2>
                    <p className="!mb-0 text-gray-600 dark:text-gray-300">Belum ada shift aktif. Siapkan mesin kasir dan modal awal untuk mulai melayani.</p>
                </div>
                <Link to="/shifts" className="inline-flex shrink-0 items-center gap-2 min-h-11 font-medium text-primary-600 dark:text-primary-300 hover:underline">
                    <i className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                        history
                    </i>
                    Riwayat shift
                </Link>
            </section>

            <dl className="grid sm:grid-cols-3 gap-4">
                {[
                    { icon: 'lock_clock', label: 'Status shift', value: 'Belum dibuka', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
                    {
                        icon: 'point_of_sale',
                        label: 'Mesin kasir',
                        value: loadError ? 'Gagal dimuat' : tills === null ? 'Memuat...' : `${tills.length} tersedia`,
                        tone: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
                    },
                    { icon: 'person', label: 'Petugas kasir', value: user?.fullname || 'Kasir', tone: 'bg-primary-50 text-primary-700 dark:bg-primary-900 dark:text-primary-100' },
                ].map((item) => (
                    <div key={item.label} className="flex items-center gap-4 rounded-md bg-white dark:bg-[#0c1427] p-5 border border-gray-100 dark:border-gray-800 min-w-0">
                        <span className={`flex size-11 shrink-0 items-center justify-center rounded-md ${item.tone}`}>
                            <i className="material-symbols-outlined" aria-hidden="true">
                                {item.icon}
                            </i>
                        </span>
                        <div className="min-w-0">
                            <dt className="text-sm text-gray-600 dark:text-gray-300">{item.label}</dt>
                            <dd className="font-semibold text-lg text-black dark:text-white break-words">{item.value}</dd>
                        </div>
                    </div>
                ))}
            </dl>

            <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)] bg-white dark:bg-[#0c1427] border-y border-gray-100 dark:border-gray-800">
                <section aria-labelledby="open-shift-title" className="p-5 sm:p-8 lg:pr-10">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="size-10 flex items-center justify-center rounded-md bg-emerald-700 text-white">
                            <i className="material-symbols-outlined" aria-hidden="true">
                                lock_open
                            </i>
                        </span>
                        <div>
                            <h3 id="open-shift-title" className="!text-xl !mb-1">
                                Buka shift
                            </h3>
                            <p className="!mb-0 text-sm">Satu sesi kerja, pencatatan kas yang terpisah.</p>
                        </div>
                    </div>
                    {loadError ? (
                        <div role="alert" className="py-6 space-y-4">
                            <h4 className="!text-lg">Mesin kasir belum dapat dimuat</h4>
                            <p>{loadError}</p>
                            <Button icon="refresh" variant="outline" onClick={() => setReload((value) => value + 1)}>
                                Coba lagi
                            </Button>
                        </div>
                    ) : tills === null ? (
                        <p role="status" className="py-10 flex items-center gap-3">
                            <i className="material-symbols-outlined animate-spin" aria-hidden="true">
                                progress_activity
                            </i>
                            Memuat mesin kasir...
                        </p>
                    ) : tills.length === 0 ? (
                        <div className="py-4">
                            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-medium mb-4">
                                <i className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                                    info
                                </i>
                                Pengaturan awal diperlukan
                            </div>
                            <h4 className="!text-xl !mb-3">Mesin kasir belum ditambahkan</h4>
                            <p className="max-w-[480px] text-gray-600 dark:text-gray-300">Mesin kasir (till) diperlukan untuk mencatat transaksi dan saldo tunai pada shift Anda.</p>
                            {canManageTills ? (
                                <Link
                                    to="/settings"
                                    className="inline-flex min-h-11 items-center justify-center gap-2 px-5 py-3 mt-2 rounded-md bg-emerald-700 text-white font-medium hover:bg-emerald-800"
                                >
                                    <i className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                                        add
                                    </i>
                                    Tambahkan mesin kasir
                                </Link>
                            ) : (
                                <p className="font-medium text-black dark:text-white">Hubungi admin untuk menambahkan mesin kasir.</p>
                            )}
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} noValidate className="space-y-5">
                            <Select
                                label="Mesin kasir (till)"
                                required
                                placeholder="Pilih mesin kasir"
                                options={(tills ?? []).map((t) => ({ value: t.id, label: `${t.number} – ${t.name}` }))}
                                value={tillId}
                                onChange={(e) => setTillId(e.target.value)}
                                error={errors.till}
                            />
                            <Input
                                label="Modal awal tunai (Rp)"
                                required
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={1}
                                placeholder="mis. 200000"
                                value={cash}
                                onChange={(e) => setCash(e.target.value)}
                                error={errors.cash}
                            />
                            <p className="!mb-0 text-sm">Masukkan jumlah uang yang tersedia di laci kasir, bukan target penjualan.</p>
                            <Button type="submit" icon="lock_open" loading={saving} className="w-full !bg-emerald-700 !border-emerald-700 hover:!bg-emerald-800">
                                Buka shift
                            </Button>
                        </form>
                    )}
                </section>
                <aside aria-labelledby="shift-preparation" className="bg-gray-50 dark:bg-[#101a2c] border-t lg:border-t-0 lg:border-l border-gray-100 dark:border-gray-800 p-5 sm:p-8">
                    <h3 id="shift-preparation" className="!text-lg !mb-6">
                        Sebelum transaksi pertama
                    </h3>
                    <ol className="space-y-6">
                        {[
                            { title: 'Mesin kasir', text: 'Terdaftar sesuai lokasi Anda bekerja.', icon: 'point_of_sale' },
                            { title: 'Modal awal', text: 'Sesuai jumlah uang tunai di laci.', icon: 'payments' },
                            { title: 'Shift aktif', text: 'Transaksi tercatat atas nama petugas yang masuk.', icon: 'receipt_long' },
                        ].map((item, index) => (
                            <li key={item.title} className="flex gap-3">
                                <span className="size-8 shrink-0 flex items-center justify-center border border-gray-300 dark:border-gray-600 rounded-full text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    {index + 1}
                                </span>
                                <div>
                                    <h4 className="!text-base !mb-1">{item.title}</h4>
                                    <p className="!mb-0 text-sm text-gray-600 dark:text-gray-300">{item.text}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                    <p className="!mb-0 mt-7 pt-5 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">Shift yang sudah ditutup tidak dapat dibuka kembali.</p>
                </aside>
            </div>

            <nav aria-label="Akses cepat kasir" className="grid sm:grid-cols-2 gap-x-8">
                {[
                    { to: '/held', icon: 'pending_actions', title: 'Pesanan tertunda', text: 'Daftar pesanan yang belum diselesaikan.' },
                    { to: '/customers', icon: 'group', title: 'Data pelanggan', text: 'Kontak dan informasi pelanggan apotek.' },
                ].map((item) => (
                    <Link key={item.to} to={item.to} className="group flex items-center gap-4 py-4 border-b border-gray-200 dark:border-gray-700 hover:text-primary-600 dark:hover:text-primary-300">
                        <i className="material-symbols-outlined text-gray-600 dark:text-gray-300" aria-hidden="true">
                            {item.icon}
                        </i>
                        <div className="flex-1">
                            <span className="font-semibold text-black dark:text-white group-hover:underline">{item.title}</span>
                            <p className="!mb-0 text-sm">{item.text}</p>
                        </div>
                        <i className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                            chevron_right
                        </i>
                    </Link>
                ))}
            </nav>
        </div>
    );
};

export default ShiftOpenForm;
