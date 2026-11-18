import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import Input from '@/components/ui/Input';
import { ADMIN_USER_ID, PERMISSIONS, type Perm, type User } from '@/types/auth.types';
import type { UserPayload } from '@/types/user.types';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,50}$/;
const MIN_PASSWORD = 8;

type FormErrors = Partial<Record<'username' | 'fullname' | 'password', string>>;

export const emptyUserPayload = (): UserPayload => ({
    username: '',
    fullname: '',
    password: '',
    is_active: true,
    perm_products: false,
    perm_purchases: false,
    perm_categories: false,
    perm_transactions: false,
    perm_users: false,
    perm_settings: false,
});

export const userToPayload = (u: User): UserPayload => ({
    username: u.username,
    fullname: u.fullname,
    password: '',
    is_active: u.is_active,
    perm_products: u.perm_products,
    perm_purchases: u.perm_purchases,
    perm_categories: u.perm_categories,
    perm_transactions: u.perm_transactions,
    perm_users: u.perm_users,
    perm_settings: u.perm_settings,
});

interface UserFormProps {
    initial: UserPayload;
    /** Set when editing. */
    userId?: number;
    currentUserId: number;
    saving: boolean;
    /** Field errors coming back from the server (e.g. username taken). */
    serverErrors?: FormErrors;
    onSubmit: (payload: UserPayload) => void;
}

const UserForm = ({ initial, userId, currentUserId, saving, serverErrors, onSubmit }: UserFormProps) => {
    const isEdit = userId !== undefined;
    const isAdmin = userId === ADMIN_USER_ID;
    const isSelf = userId === currentUserId;
    const [form, setForm] = useState<UserPayload>(initial);
    const [errors, setErrors] = useState<FormErrors>({});
    const shownErrors = { ...serverErrors, ...errors };

    const setField = <K extends keyof UserPayload>(key: K, value: UserPayload[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors((e) => ({ ...e, [key]: undefined }));
    };

    const validateForm = (): boolean => {
        const next: FormErrors = {};
        const username = form.username.trim().toLowerCase();
        if (!USERNAME_PATTERN.test(username)) next.username = 'Username 3–50 karakter: huruf kecil, angka, titik, minus, atau garis bawah';
        if (!form.fullname.trim()) next.fullname = 'Nama lengkap wajib diisi';
        if (!isEdit && form.password.length < MIN_PASSWORD) next.password = `Password minimal ${MIN_PASSWORD} karakter`;
        if (isEdit && form.password !== '' && form.password.length < MIN_PASSWORD) next.password = `Password minimal ${MIN_PASSWORD} karakter`;
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;
        onSubmit({ ...form, username: form.username.trim().toLowerCase(), fullname: form.fullname.trim() });
    };

    const passwordHint = !isEdit
        ? `Minimal ${MIN_PASSWORD} karakter. User wajib menggantinya saat login pertama.`
        : isSelf
          ? 'Kosongkan jika tidak diubah.'
          : 'Kosongkan jika tidak diubah. Jika diisi, user dikeluarkan dan wajib ganti password saat login.';

    return (
        <form onSubmit={handleSubmit} noValidate>
            <Card title="Data user">
                <div className="sm:grid sm:grid-cols-2 sm:gap-[25px]">
                    <Input
                        label="Username"
                        required
                        autoCapitalize="none"
                        autoComplete="off"
                        maxLength={50}
                        value={form.username}
                        onChange={(e) => setField('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
                        error={shownErrors.username}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Input
                        label="Nama lengkap"
                        required
                        maxLength={100}
                        value={form.fullname}
                        onChange={(e) => setField('fullname', e.target.value)}
                        error={shownErrors.fullname}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Input
                        label={isEdit ? 'Password baru' : 'Password'}
                        type="password"
                        required={!isEdit}
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(e) => setField('password', e.target.value)}
                        error={shownErrors.password}
                        hint={passwordHint}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <div className="sm:pt-[38px]">
                        <Checkbox
                            label="Akun aktif"
                            description={isAdmin ? 'Admin bawaan selalu aktif.' : isSelf ? 'Tidak bisa menonaktifkan akun sendiri.' : 'User nonaktif tidak bisa login.'}
                            checked={form.is_active}
                            disabled={isAdmin || isSelf}
                            onChange={(e) => setField('is_active', e.target.checked)}
                        />
                    </div>
                </div>
            </Card>

            <Card title="Izin akses">
                <p className="!mb-[20px]">
                    {isAdmin ? 'Admin bawaan selalu memiliki semua izin.' : 'Semua user boleh membuka shift, berjualan, mengelola pesanan tertunda dan pelanggan. Centang izin tambahan di bawah.'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[20px]">
                    {PERMISSIONS.map((p) => (
                        <Checkbox
                            key={p.key}
                            label={p.label}
                            description={p.description}
                            checked={form[p.key as Perm]}
                            disabled={isAdmin}
                            onChange={(e) => setField(p.key as Perm, e.target.checked)}
                        />
                    ))}
                </div>
            </Card>

            <div className="flex flex-wrap gap-[12px] mb-[25px]">
                <Button type="submit" icon="check" loading={saving}>
                    {isEdit ? 'Simpan perubahan' : 'Simpan user'}
                </Button>
                <Link
                    to="/users"
                    className="inline-flex items-center rounded-md border border-gray-200 dark:border-[#172036] py-[10px] md:py-[12px] px-[20px] transition-all hover:border-primary-500 hover:text-primary-500"
                >
                    Batal
                </Link>
            </div>
        </form>
    );
};

export default UserForm;
