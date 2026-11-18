import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import PageHeader from '@/components/ui/PageHeader';
import { errorMessage } from '@/services/api.service';
import { authService } from '@/services/auth.service';
import { useAppDispatch, useAppSelector } from '@/store';
import { setUser } from '@/store/authSlice';
import { toast } from '@/utils/toast';

const MIN_PASSWORD = 8;

const ProfileForm = () => {
    const dispatch = useAppDispatch();
    const user = useAppSelector((s) => s.auth.user)!;
    const [fullname, setFullname] = useState(user.fullname);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!fullname.trim()) {
            setError('Nama lengkap wajib diisi');
            return;
        }
        setError('');
        setSaving(true);
        try {
            const res = await authService.updateProfile(fullname.trim());
            dispatch(setUser(res.data!));
            toast.success(res.message);
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card title="Profil">
            <form onSubmit={handleSubmit} noValidate>
                <div className="sm:grid sm:grid-cols-2 sm:gap-[25px]">
                    <Input label="Username" value={user.username} disabled hint="Username hanya bisa diubah admin." wrapperClassName="mb-[20px] sm:mb-0" />
                    <Input label="Nama lengkap" required maxLength={100} value={fullname} onChange={(e) => setFullname(e.target.value)} error={error} wrapperClassName="mb-[20px] sm:mb-0" />
                </div>
                <div className="mt-[20px] md:mt-[25px]">
                    <Button type="submit" icon="check" loading={saving} disabled={fullname.trim() === user.fullname}>
                        Simpan profil
                    </Button>
                </div>
            </form>
        </Card>
    );
};

interface PasswordErrors {
    old_password?: string;
    new_password?: string;
    confirm?: string;
}

/** Ported from Trezo Settings/ChangePasswordForm. */
const ChangePasswordForm = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const mustChange = useAppSelector((s) => s.auth.user?.must_change_password ?? false);
    const [form, setForm] = useState({ old_password: '', new_password: '', confirm: '' });
    const [errors, setErrors] = useState<PasswordErrors>({});
    const [saving, setSaving] = useState(false);

    const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const validateForm = (): boolean => {
        const next: PasswordErrors = {};
        if (!form.old_password) next.old_password = 'Password lama wajib diisi';
        if (form.new_password.length < MIN_PASSWORD) next.new_password = `Password baru minimal ${MIN_PASSWORD} karakter`;
        else if (form.new_password === form.old_password) next.new_password = 'Password baru harus berbeda dari password lama';
        if (form.confirm !== form.new_password) next.confirm = 'Konfirmasi password tidak sama';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;
        setSaving(true);
        try {
            const res = await authService.changePassword({ old_password: form.old_password, new_password: form.new_password });
            dispatch(setUser(res.data!));
            setForm({ old_password: '', new_password: '', confirm: '' });
            toast.success(res.message);
            if (mustChange) navigate('/app', { replace: true });
        } catch (err) {
            const message = errorMessage(err);
            if (message === 'Password lama salah') setErrors({ old_password: message });
            else toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card title="Ganti password">
            <form onSubmit={handleSubmit} noValidate>
                <div className="sm:grid sm:grid-cols-2 sm:gap-[25px]">
                    <Input
                        label="Password lama"
                        type="password"
                        required
                        autoComplete="current-password"
                        value={form.old_password}
                        onChange={set('old_password')}
                        error={errors.old_password}
                        wrapperClassName="mb-[20px] sm:mb-0 sm:col-span-2"
                    />
                    <Input
                        label="Password baru"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={form.new_password}
                        onChange={set('new_password')}
                        error={errors.new_password}
                        hint={`Minimal ${MIN_PASSWORD} karakter.`}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                    <Input
                        label="Konfirmasi password baru"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={form.confirm}
                        onChange={set('confirm')}
                        error={errors.confirm}
                        wrapperClassName="mb-[20px] sm:mb-0"
                    />
                </div>
                <div className="mt-[20px] md:mt-[25px]">
                    <Button type="submit" icon="key" loading={saving}>
                        Ganti password
                    </Button>
                </div>
            </form>
        </Card>
    );
};

const Profile = () => {
    const mustChange = useAppSelector((s) => s.auth.user?.must_change_password ?? false);

    return (
        <>
            <PageHeader title="Profil" breadcrumbs={[{ label: 'Kasir', to: '/app' }, { label: 'Profil' }]} />
            {mustChange && (
                <div className="mb-[25px] rounded-md bg-warning-50 dark:bg-warning-900/30 text-warning-900 dark:text-warning-200 px-[20px] py-[15px] flex items-start gap-[10px]" role="alert">
                    <i className="material-symbols-outlined">warning</i>
                    <span>Demi keamanan, ganti password Anda sebelum memakai aplikasi.</span>
                </div>
            )}
            {!mustChange && <ProfileForm />}
            <ChangePasswordForm />
        </>
    );
};

export default Profile;
