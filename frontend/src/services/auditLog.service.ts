import { apiService } from './api.service';
import type { ListParams } from '@/types/api.types';
import type { AuditLogFilters, AuditLogListData } from '@/types/auditLog.types';

export const auditLogService = {
    list: (params: ListParams & AuditLogFilters, signal?: AbortSignal) => apiService.get<AuditLogListData>('/audit-logs', { ...params }, signal),
};
