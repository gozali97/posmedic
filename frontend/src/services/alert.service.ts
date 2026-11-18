import { apiService } from './api.service';
import type { AlertsData } from '@/types/alert.types';

export const alertService = {
    get: () => apiService.get<AlertsData>('/alerts'),
};
