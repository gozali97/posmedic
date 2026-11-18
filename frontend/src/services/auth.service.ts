import { apiService } from './api.service';
import type { ChangePasswordRequest, LoginData, LoginRequest, User } from '@/types/auth.types';

export const authService = {
    login: (body: LoginRequest) => apiService.post<LoginData>('/auth/login', body, { auth: false }),
    me: () => apiService.get<User>('/auth/me'),
    logout: () => apiService.post<null>('/auth/logout'),
    changePassword: (body: ChangePasswordRequest) => apiService.put<User>('/auth/password', body),
    updateProfile: (fullname: string) => apiService.put<User>('/auth/profile', { fullname }),
};
