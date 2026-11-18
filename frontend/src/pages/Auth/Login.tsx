import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAppDispatch, useAppSelector } from '@/store';
import { login } from '@/store/authSlice';

interface FormErrors {
    username?: string;
    password?: string;
}

/** Ported from Trezo Authentication/SignInForm: username instead of email, no social/sign-up/forgot links. */
const Login = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const loading = useAppSelector((s) => s.auth.loading);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState<FormErrors>({});
    const [serverError, setServerError] = useState('');

    const from = (location.state as { from?: string } | null)?.from;

    const validateForm = (): boolean => {
        const next: FormErrors = {};
        if (!username.trim()) next.username = 'Username wajib diisi';
        if (!password) next.password = 'Password wajib diisi';
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setServerError('');
        if (!validateForm()) return;

        const result = await dispatch(login({ username: username.trim().toLowerCase(), password }));
        if (login.fulfilled.match(result)) {
            const target = result.payload.user.must_change_password ? '/profile' : from && from !== '/login' ? from : '/app';
            navigate(target, { replace: true });
        } else {
            setServerError(result.payload ?? 'Login gagal');
            setPassword('');
        }
    };

    return (
        <div className="auth-main-content bg-gray-50 dark:bg-[#0a0e19] min-h-screen flex items-center justify-center px-[15px] py-[40px]">
            <div className="w-full max-w-[420px]">
                <div className="bg-white dark:bg-[#0c1427] border border-gray-100 dark:border-[#172036] rounded-md shadow-sm p-[25px] md:p-[35px]">
                    <div className="text-center mb-[25px]">
                        <img src="/images/icon.png" alt="" width={72} height={72} className="w-[72px] h-[72px] object-contain mx-auto mb-[10px]" />
                        <p className="font-bold text-black dark:text-white text-lg !mb-[15px]">POS Apotek</p>
                        <h1 className="!font-semibold !text-xl !mb-[5px]">Masuk ke akun Anda</h1>
                        <p className="text-[#445164] dark:text-gray-400 !mb-0">Gunakan username dan password Anda.</p>
                    </div>

                    <div>
                        <form onSubmit={handleSubmit} noValidate>
                            {serverError && (
                                <div
                                    className="mb-[15px] rounded-md bg-danger-50 dark:bg-danger-900/30 text-danger-700 dark:text-danger-300 px-[17px] py-[12px] flex items-center gap-[8px]"
                                    role="alert"
                                >
                                    <i className="material-symbols-outlined !text-[20px]">error</i>
                                    {serverError}
                                </div>
                            )}

                            <Input
                                label="Username"
                                name="username"
                                autoComplete="username"
                                autoCapitalize="none"
                                autoFocus
                                placeholder="mis. kasir1"
                                value={username}
                                onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                                error={errors.username}
                                wrapperClassName="mb-[15px]"
                            />
                            <Input
                                label="Password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                placeholder="Ketik password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                error={errors.password}
                                wrapperClassName="mb-[15px]"
                            />

                            <Button type="submit" icon="login" loading={loading} className="w-full mt-[10px]">
                                Masuk
                            </Button>
                        </form>
                    </div>
                </div>
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-[20px] !mb-0">Lupa password? Hubungi admin apotek.</p>
            </div>
        </div>
    );
};

export default Login;
