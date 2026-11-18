import { apiService } from './api.service';
import type { StoreSetting, Till, TillPayload } from '@/types/setting.types';

export const settingService = {
    /** `data` is null until the store settings are filled for the first time. */
    get: () => apiService.get<StoreSetting | null>('/settings'),
    /** multipart/form-data: setting fields + optional `logo` file + `remove_logo`. */
    update: (form: FormData) => apiService.put<StoreSetting>('/settings', form),
};

export const tillService = {
    list: () => apiService.get<Till[]>('/tills'),
    create: (body: TillPayload) => apiService.post<Till>('/tills', body),
    update: (id: number, body: TillPayload) => apiService.put<Till>(`/tills/${id}`, body),
    remove: (id: number) => apiService.delete<null>(`/tills/${id}`),
};
