import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiService, setUnauthorizedHandler, tokenStorage } from './api.service';

const fetchMock = vi.fn();
const unauthorized = vi.fn();
const response = (code: number, data: unknown = null) => new Response(JSON.stringify({ status: code < 400 ? 'success' : 'failed', code, message: 'Test response', data }), { status: code });

beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal('fetch', fetchMock);
    tokenStorage.set('pos_access_token', 'old-access');
    tokenStorage.set('pos_refresh_token', 'old-refresh');
    setUnauthorizedHandler(unauthorized);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});

describe('session refresh', () => {
    it.each([429, 500, 503])('keeps the session when refresh returns %s', async (code) => {
        fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(code));
        await expect(apiService.get('/products')).rejects.toMatchObject({ code });
        expect(tokenStorage.access()).toBe('old-access');
        expect(tokenStorage.refresh()).toBe('old-refresh');
        expect(unauthorized).not.toHaveBeenCalled();
    });

    it('keeps the session when the refresh network request fails', async () => {
        fetchMock.mockResolvedValueOnce(response(401)).mockRejectedValueOnce(new TypeError('Failed to fetch'));
        await expect(apiService.get('/products')).rejects.toMatchObject({ code: 0 });
        expect(tokenStorage.access()).toBe('old-access');
        expect(unauthorized).not.toHaveBeenCalled();
    });

    it('clears a session rejected by the refresh endpoint', async () => {
        fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(401));
        await expect(apiService.get('/products')).rejects.toMatchObject({ code: 401 });
        expect(tokenStorage.access()).toBeNull();
        expect(unauthorized).toHaveBeenCalledOnce();
    });

    it('retries with the refreshed access token', async () => {
        fetchMock
            .mockResolvedValueOnce(response(401))
            .mockResolvedValueOnce(response(200, { access_token: 'new-access', refresh_token: 'new-refresh', user: { id: 1 } }))
            .mockResolvedValueOnce(response(200, { products: [] }));
        await expect(apiService.get('/products')).resolves.toMatchObject({ data: { products: [] } });
        expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new-access');
        expect(unauthorized).not.toHaveBeenCalled();
    });
});
