import type { PaginationMeta } from './api.types';
import type { Perm, User } from './auth.types';

export interface UserListData {
    users: User[];
    pagination: PaginationMeta;
    filters: { search: string };
}

export type UserPayload = Record<Perm, boolean> & {
    username: string;
    fullname: string;
    /** Required on create; empty on update keeps the current password. */
    password: string;
    is_active: boolean;
};
