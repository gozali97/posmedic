import { ApiError } from '@/services/api.service';

/** Maps known backend messages for the user form to a field; others become a toast. */
export const userFieldError = (err: unknown): { username?: string; fullname?: string; password?: string } | null => {
    if (!(err instanceof ApiError)) return null;
    const msg = err.message;
    if (msg.startsWith('Username')) return { username: msg };
    if (msg.startsWith('Nama lengkap')) return { fullname: msg };
    if (msg.startsWith('Password')) return { password: msg };
    return null;
};
