import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import type { AuditLog } from '@/types/auditLog.types';
import { formatDateTime } from '@/utils/format';
import { actionLabel, entityLabel } from './labels';

const show = (v: unknown): string => {
    if (v === undefined) return '—';
    if (v === null) return 'null';
    if (typeof v === 'object') return JSON.stringify(v, null, 2);
    return String(v);
};

interface AuditLogDetailProps {
    log: AuditLog | null;
    onClose: () => void;
}

/** Field-by-field before/after table; changed rows are highlighted. */
const AuditLogDetail = ({ log, onClose }: AuditLogDetailProps) => {
    const before = log?.before ?? {};
    const after = log?.after ?? {};
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    const action = log ? actionLabel(log.action) : null;

    return (
        <Modal open={log !== null} onClose={onClose} title="Detail audit log" size="lg">
            {log && action && (
                <>
                    <dl className="grid grid-cols-[max-content_1fr] gap-x-[20px] gap-y-[6px] mb-[20px]">
                        <dt className="font-medium text-black dark:text-white">Waktu</dt>
                        <dd>{formatDateTime(log.created_at)}</dd>
                        <dt className="font-medium text-black dark:text-white">User</dt>
                        <dd>{log.username ?? (log.user_id ? `#${log.user_id}` : '-')}</dd>
                        <dt className="font-medium text-black dark:text-white">Aksi</dt>
                        <dd>
                            <Badge color={action.color}>{action.label}</Badge>
                        </dd>
                        <dt className="font-medium text-black dark:text-white">Entitas</dt>
                        <dd>
                            {entityLabel(log.entity_type)}
                            {log.entity_id !== null && ` #${log.entity_id}`}
                        </dd>
                        <dt className="font-medium text-black dark:text-white">IP</dt>
                        <dd>{log.ip || '-'}</dd>
                    </dl>

                    {keys.length === 0 ? (
                        <p className="!mb-0">Tidak ada data perubahan.</p>
                    ) : (
                        <div className="table-responsive overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-black dark:text-white">
                                    <tr>
                                        <th className="font-medium text-left px-[14px] py-[10px] bg-gray-50 dark:bg-[#15203c]">Field</th>
                                        <th className="font-medium text-left px-[14px] py-[10px] bg-gray-50 dark:bg-[#15203c]">Sebelum</th>
                                        <th className="font-medium text-left px-[14px] py-[10px] bg-gray-50 dark:bg-[#15203c]">Sesudah</th>
                                    </tr>
                                </thead>
                                <tbody className="text-black dark:text-white">
                                    {keys.map((k) => {
                                        const b = show(before[k]);
                                        const a = show(after[k]);
                                        const changed = log.before !== null && log.after !== null && b !== a;
                                        return (
                                            <tr key={k} className={changed ? 'bg-warning-50 dark:bg-warning-900/20' : ''}>
                                                <td className="px-[14px] py-[8px] border-b border-gray-100 dark:border-[#172036] font-medium align-top whitespace-nowrap">{k}</td>
                                                <td className="px-[14px] py-[8px] border-b border-gray-100 dark:border-[#172036] align-top">
                                                    <pre className="whitespace-pre-wrap break-all font-mono text-xs">{b}</pre>
                                                </td>
                                                <td className="px-[14px] py-[8px] border-b border-gray-100 dark:border-[#172036] align-top">
                                                    <pre className="whitespace-pre-wrap break-all font-mono text-xs">{a}</pre>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </Modal>
    );
};

export default AuditLogDetail;
