import type { ReactNode } from 'react';
import type { PaginationMeta } from '@/types/api.types';
import Pagination from './Pagination';

export interface Column<T> {
    key: string;
    header: ReactNode;
    render?: (row: T, index: number) => ReactNode;
    /** Applied to both th and td, e.g. "text-right". */
    className?: string;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    rows: T[];
    rowKey: (row: T) => string | number;
    loading?: boolean;
    emptyText?: string;
    pagination?: PaginationMeta | null;
    onPageChange?: (page: number) => void;
}

const cell = 'text-left whitespace-nowrap px-[20px] py-[15px] border-b border-gray-100 dark:border-[#172036] first:border-l last:border-r';

/**
 * Ported from Trezo Tables/DataTable: same markup, but columns are passed in and paging/search happen on the server.
 * Put search inputs and filters around it (see ListToolbar).
 */
const DataTable = <T,>({ columns, rows, rowKey, loading = false, emptyText = 'Belum ada data', pagination, onPageChange }: DataTableProps<T>) => (
    <div>
        <div className="table-responsive overflow-x-auto">
            <table className="w-full">
                <thead className="text-black dark:text-white">
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                scope="col"
                                className={`font-medium text-left px-[20px] py-[11px] bg-gray-50 dark:bg-[#15203c] whitespace-nowrap first:rounded-tl-md last:rounded-tr-md ${col.className ?? ''}`}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="text-black dark:text-white" aria-busy={loading}>
                    {loading && rows.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className={`${cell} text-center !text-gray-500`}>
                                Memuat data…
                            </td>
                        </tr>
                    ) : rows.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} className={`${cell} text-center !text-gray-500`}>
                                {emptyText}
                            </td>
                        </tr>
                    ) : (
                        rows.map((row, i) => (
                            <tr key={rowKey(row)} className={loading ? 'opacity-60' : ''}>
                                {columns.map((col) => (
                                    <td key={col.key} className={`${cell} ${col.className ?? ''}`}>
                                        {col.render ? col.render(row, i) : String((row as Record<string, unknown>)[col.key] ?? '-')}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
        {pagination && onPageChange && <Pagination meta={pagination} onPageChange={onPageChange} />}
    </div>
);

export default DataTable;
