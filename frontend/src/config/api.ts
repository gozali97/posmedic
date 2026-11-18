export const API_CONFIG = {
    baseUrl: (import.meta.env.VITE_API_URL ?? 'http://localhost:8072/api').replace(/\/$/, ''),
    storageUrl: (import.meta.env.VITE_STORAGE_URL ?? 'http://localhost:8072/storage/uploads').replace(/\/$/, ''),
};

export const TOKEN_KEYS = {
    access: 'pos_access_token',
    refresh: 'pos_refresh_token',
    user: 'pos_user',
    till: 'pos_till_id',
} as const;

/** Builds a public URL for a file stored by the backend (e.g. "logos/abc.png"). */
export const storageUrl = (path?: string | null): string | null => (path ? `${API_CONFIG.storageUrl}/${path.replace(/^\/+/, '')}` : null);
