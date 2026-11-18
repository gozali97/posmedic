import { useState } from 'react';
import { useNavigate } from 'react-router';
import PageHeader from '@/components/ui/PageHeader';
import { errorMessage } from '@/services/api.service';
import { userService } from '@/services/user.service';
import { useAppSelector } from '@/store';
import type { UserPayload } from '@/types/user.types';
import { toast } from '@/utils/toast';
import { userFieldError } from './serverErrors';
import UserForm, { emptyUserPayload } from './UserForm';

const UserCreate = () => {
    const navigate = useNavigate();
    const currentUserId = useAppSelector((s) => s.auth.user!.id);
    const [saving, setSaving] = useState(false);
    const [serverErrors, setServerErrors] = useState<ReturnType<typeof userFieldError>>(null);

    const handleSubmit = async (payload: UserPayload) => {
        setSaving(true);
        setServerErrors(null);
        try {
            const res = await userService.create(payload);
            toast.success(res.message);
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
            <PageHeader title="Tambah User" breadcrumbs={[{ label: 'User', to: '/users' }, { label: 'Tambah' }]} />
            <UserForm initial={emptyUserPayload()} currentUserId={currentUserId} saving={saving} serverErrors={serverErrors ?? undefined} onSubmit={handleSubmit} />
        </>
    );
};

export default UserCreate;
