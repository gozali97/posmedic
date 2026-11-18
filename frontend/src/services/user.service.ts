import { apiService } from './api.service';
import type { ListParams } from '@/types/api.types';
import type { User } from '@/types/auth.types';
import type { UserListData, UserPayload } from '@/types/user.types';

export const userService = {
    list: (params: ListParams, signal?: AbortSignal) => apiService.get<UserListData>('/users', { ...params }, signal),
    detail: (id: number) => apiService.get<User>(`/users/${id}`),
    create: (body: UserPayload) => apiService.post<User>('/users', body),
    update: (id: number, body: Partial<UserPayload>) => apiService.put<User>(`/users/${id}`, body),
    remove: (id: number) => apiService.delete<null>(`/users/${id}`),
};
