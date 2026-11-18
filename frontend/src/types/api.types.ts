/** Envelope returned by every backend endpoint (backend/dto/common.go). */
export interface ApiResponse<T> {
    status: 'success' | 'failed';
    code: number;
    message: string;
    data?: T;
    errors?: unknown;
}

export interface PaginationMeta {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
    from: number;
    to: number;
}

export interface ListParams {
    page?: number;
    per_page?: number;
    search?: string;
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;
