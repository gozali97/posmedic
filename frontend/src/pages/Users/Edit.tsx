import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import { errorMessage } from '@/services/api.service';
import { userService } from '@/services/user.service';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchMe } from '@/store/authSlice';
import { ADMIN_USER_ID, PERMISSIONS, type User } from '@/types/auth.types';
import type { UserPayload } from '@/types/user.types';
import { toast } from '@/utils/toast';
import { userFieldError } from './serverErrors';
import UserForm, { userToPayload } from './UserForm';

/** Sends only what may change: the built-in admin's flags and the actor's own is_active are locked server-side. */
const buildUpdate = (payload: UserPayload, userId: number, currentUserId: number): Partial<UserPayload> => {
    const body: Partial<UserPayload> = { username: payload.username, fullname: payload.fullname };
    if (payload.password) body.password = payload.password;
    if (userId !== ADMIN_USER_ID) {
        PERMISSIONS.forEach((p) => {
            body[p.key] = payload[p.key];
        });
        if (userId !== currentUserId) body.is_active = payload.is_active;
    }
    return body;
};

const UserEdit = () => {
    const { id } = useParams();
    const userId = Number(id);
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const currentUserId = useAppSelector((s) => s.auth.user!.id);
    const [user, setUser] = useState<User | null>(null);
    const [loadError, setLoadError] = useState('');
    const [saving, setSaving] = useState(false);
    const [serverErrors, setServerErrors] = useState<ReturnType<typeof userFieldError>>(null);

    useEffect(() => {
        if (!Number.isInteger(userId) || userId <= 0) {
            setLoadError('ID user tidak valid');
            return;
        }
        userService
            .detail(userId)
            .then((res) => setUser(res.data!))
            .catch((err) => setLoadError(errorMessage(err)));
    }, [userId]);

    const handleSubmit = async (payload: UserPayload) => {
        setSaving(true);
        setServerErrors(null);
        try {
            const res = await userService.update(userId, buildUpdate(payload, userId, currentUserId));
            toast.success(res.message);
            if (userId === currentUserId) dispatch(fetchMe());
            navigate('/users');
        } catch (err) {
            const fieldErr = userFieldError(err);
            if (fieldErr) setServerErrors(fieldErr);
            else toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <PageHeader title="Ubah User" breadcrumbs={[{ label: 'User', to: '/users' }, { label: user ? user.username : 'Ubah' }]} />
            {loadError ? (
                <Card>
                    <p className="text-danger-500 !mb-0">{loadError}</p>
                </Card>
            ) : !user ? (
                <Card>
                    <p className="!mb-0">Memuat data user…</p>
                </Card>
            ) : (
                <UserForm initial={userToPayload(user)} userId={user.id} currentUserId={currentUserId} saving={saving} serverErrors={serverErrors ?? undefined} onSubmit={handleSubmit} />
            )}
        </>
    );
};

export default UserEdit;
