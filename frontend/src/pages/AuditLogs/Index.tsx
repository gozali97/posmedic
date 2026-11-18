import { useEffect, useState } from 'react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { fieldClass } from '@/components/ui/Input';
import PageHeader from '@/components/ui/PageHeader';
import { usePaginatedList } from '@/hooks/usePaginatedList';
import { auditLogService } from '@/services/auditLog.service';
import { userService } from '@/services/user.service';
import { useAppSelector } from '@/store';
import type { User } from '@/types/auth.types';
import type { AuditLog, AuditLogFilters, AuditLogListData } from '@/types/auditLog.types';
import { formatDateTime } from '@/utils/format';
import AuditLogDetail from './AuditLogDetail';
import { ACTION_LABELS, ENTITY_LABELS, actionLabel, entityLabel } from './labels';

const filterClass = `${fieldClass} border-gray-200 dark:border-[#172036] !h-[40px] !px-[12px] text-sm`;

const EMPTY_FILTERS: AuditLogFilters = { user_id: '', entity_type: '', action: '', start_date: '', end_date: '' };

const AuditLogIndex = () => {
    const canListUsers = useAppSelector((s) => s.auth.user?.perm_users ?? false);
    const [users, setUsers] = useState<User[]>([]);
    const [selected, setSelected] = useState<AuditLog | null>(null);
    const list = usePaginatedList<AuditLog, AuditLogListData, AuditLogFilters>({
        fetcher: (params, signal) => auditLogService.list(params, signal),
        select: (d) => d.audit_logs,
        initialFilters: EMPTY_FILTERS,
        perPage: 20,
    });

    // The user filter needs the user list, which only perm_users may read.
    useEffect(() => {
        if (!canListUsers) return;
        userService
            .list({ per_page: 100 })
            .then((res) => setUsers(res.data?.users ?? []))
            .catch(() => setUsers([]));
    }, [canListUsers]);

    const { filters, setFilters } = list;
    const hasFilters = Object.values(filters).some((v) => v !== '' && v !== undefined);

    const columns: Column<AuditLog>[] = [
        { key: 'created_at', header: 'Waktu', render: (l) => formatDateTime(l.created_at) },
        { key: 'username', header: 'User', render: (l) => l.username ?? (l.user_id ? `#${l.user_id}` : <span className="text-gray-500">-</span>) },
        {
            key: 'action',
            header: 'Aksi',
            render: (l) => {
                const a = actionLabel(l.action);
                return <Badge color={a.color}>{a.label}</Badge>;
            },
        },
        { key: 'entity', header: 'Entitas', render: (l) => `${entityLabel(l.entity_type)}${l.entity_id !== null ? ` #${l.entity_id}` : ''}` },
        { key: 'ip', header: 'IP', render: (l) => l.ip || '-' },
        {
            key: 'detail',
            header: <span className="sr-only">Detail</span>,
            className: 'text-right',
            render: (l) => (
                <button type="button" className="text-primary-500 font-medium hover:underline" onClick={() => setSelected(l)}>
                    Detail
                </button>
            ),
        },
    ];

    return (
        <>
            <PageHeader title="Audit Log" breadcrumbs={[{ label: 'Sistem' }, { label: 'Audit Log' }]} />
            <Card title="Riwayat perubahan">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-[12px] mb-[20px]">
                    {canListUsers && (
                        <select
                            aria-label="Filter user"
                            className={filterClass}
                            value={filters.user_id ?? ''}
                            onChange={(e) => setFilters({ user_id: e.target.value === '' ? '' : Number(e.target.value) })}
                        >
                            <option value="">Semua user</option>
                            {users.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.username} – {u.fullname}
                                </option>
                            ))}
                        </select>
                    )}
                    <select aria-label="Filter entitas" className={filterClass} value={filters.entity_type ?? ''} onChange={(e) => setFilters({ entity_type: e.target.value })}>
                        <option value="">Semua entitas</option>
                        {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                    <select aria-label="Filter aksi" className={filterClass} value={filters.action ?? ''} onChange={(e) => setFilters({ action: e.target.value })}>
                        <option value="">Semua aksi</option>
                        {Object.entries(ACTION_LABELS).map(([value, { label }]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                    <input
                        type="date"
                        aria-label="Dari tanggal"
                        className={filterClass}
                        value={filters.start_date ?? ''}
                        max={filters.end_date || undefined}
                        onChange={(e) => setFilters({ start_date: e.target.value })}
                    />
                    <input
                        type="date"
                        aria-label="Sampai tanggal"
                        className={filterClass}
                        value={filters.end_date ?? ''}
                        min={filters.start_date || undefined}
                        onChange={(e) => setFilters({ end_date: e.target.value })}
                    />
                </div>
                {hasFilters && (
                    <div className="mb-[15px]">
                        <Button size="sm" variant="secondary" icon="filter_alt_off" onClick={() => setFilters(EMPTY_FILTERS)}>
                            Reset filter
                        </Button>
                    </div>
                )}
                <DataTable
                    columns={columns}
                    rows={list.rows}
                    rowKey={(l) => l.id}
                    loading={list.loading}
                    pagination={list.pagination}
                    onPageChange={list.setPage}
                    emptyText="Tidak ada catatan audit"
                />
            </Card>
            <AuditLogDetail log={selected} onClose={() => setSelected(null)} />
        </>
    );
};

export default AuditLogIndex;
