import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAppDispatch, useAppSelector } from '@/store';
import { login } from '@/store/authSlice';
import './login.css';

interface FormErrors {
    username?: string;
    password?: string;
}

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
        <div className="auth-main-content pharmacy-login">
            <section className="login-identity" aria-labelledby="login-brand-title">
                <Link to="/" className="login-brand" aria-label="POS Apotek, beranda">
                    <span className="login-brand-mark material-symbols-outlined" aria-hidden="true">
                        local_pharmacy
                    </span>
                    <span>POS APOTEK</span>
                </Link>
                <div className="login-title">
                    <span className="login-eyebrow">DI BALIK SETIAP PELAYANAN</span>
                    <h1 id="login-brand-title">
                        POS Apotek<span>.</span>
                    </h1>
                    <p>Hari yang baik dimulai dengan pelayanan yang baik.</p>
                </div>
                <figure className="login-photo">
                    <img src="/images/landing/1ZOMOXPNDS.jpg" alt="Obat tablet dalam kemasan blister" width={960} height={640} />
                    <figcaption>
                        <span>KESEHATAN, SETIAP HARI.</span>
                        <span className="material-symbols-outlined" aria-hidden="true">
                            add
                        </span>
                    </figcaption>
                </figure>
                <div className="login-identity-footer">
                    <span>Untuk tim apotek.</span>
                    <span>Dengan penuh perhatian.</span>
                </div>
            </section>
            <section className="login-access" aria-labelledby="login-form-title">
                <Link to="/" className="login-back">
                    <span className="material-symbols-outlined" aria-hidden="true">
                        arrow_back
                    </span>
                    Beranda
                </Link>
                <div className="login-form-wrap">
                    <div className="login-form-heading">
                        <span className="login-eyebrow">AKSES STAF</span>
                        <h2 id="login-form-title">
                            Selamat datang
                            <br />
                            kembali.
                        </h2>
                        <p>Masuk ke akun apotek Anda.</p>
                    </div>

                    <div>
                        <form onSubmit={handleSubmit} noValidate>
                            {serverError && (
                                <div className="login-error" role="alert">
                                    <i className="material-symbols-outlined !text-[20px]" aria-hidden="true">
                                        error
                                    </i>
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
                                wrapperClassName="login-field"
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
                                wrapperClassName="login-field"
                            />

                            <Button type="submit" loading={loading} className="login-submit" aria-busy={loading}>
                                {loading ? 'Memeriksa akun...' : 'Masuk'}
                                {!loading && (
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                        arrow_forward
                                    </span>
                                )}
                            </Button>
                        </form>
                    </div>
                    <div className="login-help">
                        <span className="material-symbols-outlined" aria-hidden="true">
                            support_agent
                        </span>
                        <p>
                            Lupa password atau perlu akses?
                            <br />
                            <strong>Hubungi admin apotek Anda.</strong>
                        </p>
                    </div>
                </div>
                <footer className="login-footer">
                    <span>POS Apotek</span>
                    <span>Khusus pengguna berwenang</span>
                </footer>
            </section>
        </div>
    );
};

export default Login;
