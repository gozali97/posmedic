import type { PaginationMeta } from '@/types/api.types';
import { formatNumber } from '@/utils/format';

/** Page numbers around the current page, with null for a "…" gap. */
export const pageWindow = (current: number, total: number, radius = 1): (number | null)[] => {
    if (total <= 1) return [1];
    const pages: (number | null)[] = [];
    const start = Math.max(2, current - radius);
    const end = Math.min(total - 1, current + radius);
    pages.push(1);
    if (start > 2) pages.push(null);
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < total - 1) pages.push(null);
    pages.push(total);
    return pages;
};

const btn =
    'min-w-[31px] h-[31px] px-[6px] inline-flex items-center justify-center rounded-md border border-gray-100 dark:border-[#172036] transition-all hover:bg-primary-500 hover:text-white hover:border-primary-500 disabled:opacity-50 disabled:pointer-events-none';

interface PaginationProps {
    meta: PaginationMeta;
    onPageChange: (page: number) => void;
}

const Pagination = ({ meta, onPageChange }: PaginationProps) => {
    const { current_page: page, total_pages: totalPages } = meta;

    return (
        <div className="px-[20px] py-[12px] md:py-[14px] rounded-b-md border-l border-r border-b border-gray-100 dark:border-[#172036] sm:flex sm:items-center justify-between gap-[10px]">
            <p className="!mb-0 !text-sm">{meta.total === 0 ? 'Tidak ada data' : `Menampilkan ${formatNumber(meta.from)}–${formatNumber(meta.to)} dari ${formatNumber(meta.total)} data`}</p>

            {totalPages > 1 && (
                <nav aria-label="Navigasi halaman" className="mt-[10px] sm:mt-0">
                    <ul className="flex flex-wrap gap-[5px]">
                        <li>
                            <button type="button" className={btn} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Halaman sebelumnya">
                                <i className="material-symbols-outlined !text-[20px]">chevron_left</i>
                            </button>
                        </li>
                        {pageWindow(page, totalPages).map((p, i) =>
                            p === null ? (
                                <li key={`gap-${i}`} className="px-[4px] self-center" aria-hidden="true">
                                    …
                                </li>
                            ) : (
                                <li key={p}>
                                    <button
                                        type="button"
                                        className={`${btn} ${p === page ? '!bg-primary-500 !text-white !border-primary-500' : ''}`}
                                        aria-current={p === page ? 'page' : undefined}
                                        onClick={() => onPageChange(p)}
                                    >
                                        {p}
                                    </button>
                                </li>
                            ),
                        )}
                        <li>
                            <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Halaman berikutnya">
                                <i className="material-symbols-outlined !text-[20px]">chevron_right</i>
                            </button>
                        </li>
                    </ul>
                </nav>
            )}
        </div>
    );
};

export default Pagination;
