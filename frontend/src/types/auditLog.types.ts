import type { PaginationMeta } from './api.types';

export interface AuditLog {
    id: number;
    user_id: number | null;
    username: string | null;
    action: string;
    entity_type: string;
    entity_id: number | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    ip: string;
    created_at: string;
}

export interface AuditLogListData {
    audit_logs: AuditLog[];
    pagination: PaginationMeta;
}

export interface AuditLogFilters {
    user_id?: number | '';
    entity_type?: string;
    action?: string;
    start_date?: string;
    end_date?: string;
}
