import { API_CONFIG, TOKEN_KEYS } from '@/config/api';
import type { ApiResponse, QueryParams } from '@/types/api.types';
import type { LoginData } from '@/types/auth.types';

export class ApiError extends Error {
    readonly code: number;
    readonly errors?: unknown;

    constructor(code: number, message: string, errors?: unknown) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.errors = errors;
    }
}

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    query?: QueryParams;
    body?: unknown;
    signal?: AbortSignal;
    /** false for public endpoints (login, refresh): no Bearer header, no 401 handling. */
    auth?: boolean;
}

// ---------------------------------------------------------------- token storage

const storage = {
    get: (key: string): string | null => {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set: (key: string, value: string) => {
        try {
            localStorage.setItem(key, value);
        } catch {
            /* storage unavailable: session lives in memory only */
        }
    },
    remove: (key: string) => {
        try {
            localStorage.removeItem(key);
        } catch {
            /* ignore */
        }
    },
};

export const tokenStorage = {
    access: () => storage.get(TOKEN_KEYS.access),
    refresh: () => storage.get(TOKEN_KEYS.refresh),
    save(data: LoginData) {
        storage.set(TOKEN_KEYS.access, data.access_token);
        storage.set(TOKEN_KEYS.refresh, data.refresh_token);
        storage.set(TOKEN_KEYS.user, JSON.stringify(data.user));
    },
    clear() {
        storage.remove(TOKEN_KEYS.access);
        storage.remove(TOKEN_KEYS.refresh);
        storage.remove(TOKEN_KEYS.user);
    },
    get: storage.get,
    set: storage.set,
    remove: storage.remove,
};

// ---------------------------------------------------------------- session expiry hook

let unauthorizedHandler: () => void = () => window.location.assign('/login');

/** Registered by main.tsx so a dead session resets Redux and navigates inside the SPA. */
export const setUnauthorizedHandler = (fn: () => void) => {
    unauthorizedHandler = fn;
};

let sessionRefreshedHandler: (data: LoginData) => void = () => {};

/** Lets the auth slice pick up the user returned by a silent token refresh. */
export const setSessionRefreshedHandler = (fn: (data: LoginData) => void) => {
    sessionRefreshedHandler = fn;
};

// ---------------------------------------------------------------- core

const buildUrl = (path: string, query?: QueryParams): string => {
    const url = new URL(API_CONFIG.baseUrl + path);
    Object.entries(query ?? {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    return url.toString();
};

const send = async (path: string, opts: RequestOptions): Promise<Response> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: BodyInit | undefined;
    if (opts.body instanceof FormData) {
        body = opts.body; // browser sets the multipart boundary
    } else if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.body);
    }
    const token = tokenStorage.access();
    if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;

    try {
        return await fetch(buildUrl(path, opts.query), { method: opts.method ?? 'GET', headers, body, signal: opts.signal });
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        throw new ApiError(0, 'Tidak dapat terhubung ke server. Periksa jaringan.');
    }
};

// Concurrent 401s share one refresh call; the backend allows one session per user.
let refreshing: Promise<boolean> | null = null;

const refreshSession = (): Promise<boolean> => {
    refreshing ??= (async () => {
        const refreshToken = tokenStorage.refresh();
        if (!refreshToken) return false;
        const res = await send('/auth/refresh-token', { method: 'POST', body: { refresh_token: refreshToken }, auth: false });
        if (res.status === 401 || res.status === 403) return false;
        const json = await parse<LoginData>(res);
        if (!json.data) throw new ApiError(res.status, 'Respons pembaruan sesi tidak valid.');
        tokenStorage.save(json.data);
        sessionRefreshedHandler(json.data);
        return true;
    })().finally(() => {
        refreshing = null;
    });
    return refreshing;
};

const parse = async <T>(res: Response): Promise<ApiResponse<T>> => {
    let json: ApiResponse<T> | null = null;
    try {
        json = (await res.json()) as ApiResponse<T>;
    } catch {
        /* non-JSON body (proxy error page, empty 502) */
    }
    if (!res.ok || !json || json.status === 'failed') {
        throw new ApiError(res.status, json?.message || `Permintaan gagal (${res.status})`, json?.errors);
    }
    return json;
};

/** Sends the request; on 401 refreshes the token once and retries, otherwise ends the session. */
const authorizedFetch = async (path: string, opts: RequestOptions): Promise<Response> => {
    let res = await send(path, opts);
    if (res.status === 401 && opts.auth !== false) {
        if (await refreshSession()) {
            res = await send(path, opts);
        }
        if (res.status === 401) {
            tokenStorage.clear();
            unauthorizedHandler();
        }
    }
    return res;
};

const request = async <T>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> => parse<T>(await authorizedFetch(path, opts));

/** Downloads a binary endpoint (xlsx export) and hands it to the browser as a file. */
const download = async (path: string, filename: string, query?: QueryParams): Promise<void> => {
    const res = await authorizedFetch(path, { query });
    if (!res.ok) {
        await parse(res); // throws ApiError with the backend message
        return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};

export const apiService = {
    get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) => request<T>(path, { query, signal }),
    post: <T>(path: string, body?: unknown, opts: Pick<RequestOptions, 'auth'> = {}) => request<T>(path, { method: 'POST', body, ...opts }),
    put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    download,
};

/** Human-readable message for any thrown value. */
export const errorMessage = (err: unknown, fallback = 'Terjadi kesalahan'): string => (err instanceof Error && err.message ? err.message : fallback);
