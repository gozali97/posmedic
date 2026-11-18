import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@/services/api.service';
import type { ApiResponse, ListParams, PaginationMeta } from '@/types/api.types';
import { toast } from '@/utils/toast';
import { useDebounce } from './useDebounce';

interface Options<D, F> {
    /** Calls the list endpoint; gets page, per_page, search and the current filters. */
    fetcher: (params: ListParams & F, signal: AbortSignal) => Promise<ApiResponse<D>>;
    /** Picks the rows array out of `data`, e.g. (d) => d.users. */
    select: (data: D) => unknown[];
    initialFilters?: F;
    perPage?: number;
}

/**
 * Server-side list state: page, debounced search, filters, loading.
 * Changing search or a filter goes back to page 1; stale responses are aborted.
 */
export const usePaginatedList = <Row, D extends { pagination: PaginationMeta }, F extends object = Record<string, never>>({ fetcher, select, initialFilters, perPage = 10 }: Options<D, F>) => {
    const [rows, setRows] = useState<Row[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [search, setSearchState] = useState('');
    const [filters, setFiltersState] = useState<F>(initialFilters ?? ({} as F));
    const [reloadKey, setReloadKey] = useState(0);
    const debouncedSearch = useDebounce(search);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        fetcher({ page, per_page: perPage, search: debouncedSearch.trim(), ...filters }, controller.signal)
            .then((res) => {
                if (!res.data) return;
                setRows(select(res.data) as Row[]);
                setPagination(res.data.pagination);
            })
            .catch((err) => {
                if (controller.signal.aborted) return;
                toast.error(errorMessage(err, 'Gagal memuat data'));
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
        // fetcher/select are not deps: callers pass inline arrows that would refetch on every render.
    }, [page, perPage, debouncedSearch, filters, reloadKey]);

    const setSearch = useCallback((value: string) => {
        setSearchState(value);
        setPage(1);
    }, []);

    const setFilters = useCallback((next: Partial<F>) => {
        setFiltersState((prev) => ({ ...prev, ...next }));
        setPage(1);
    }, []);

    const reload = useCallback(() => setReloadKey((k) => k + 1), []);

    return { rows, pagination, loading, page, setPage, search, setSearch, filters, setFilters, reload };
};
