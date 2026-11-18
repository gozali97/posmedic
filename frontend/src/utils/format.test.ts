import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatNumber, formatRupiah, toJakartaDateString } from './format';

describe('formatRupiah', () => {
    it('uses id-ID thousand separators without decimals', () => {
        expect(formatRupiah(1234567)).toBe('Rp 1.234.567');
        expect(formatRupiah(0)).toBe('Rp 0');
    });

    it('puts the minus sign before the symbol', () => {
        expect(formatRupiah(-5000)).toBe('-Rp 5.000');
    });

    it('accepts a custom symbol and empty values', () => {
        expect(formatRupiah(2500, 'IDR')).toBe('IDR 2.500');
        expect(formatRupiah(null)).toBe('Rp 0');
    });
});

describe('formatNumber', () => {
    it('formats integers', () => {
        expect(formatNumber(10000)).toBe('10.000');
    });
});

describe('formatDate', () => {
    it('renders in Asia/Jakarta, not the machine time zone', () => {
        // 18:30 UTC is already the next day in Jakarta (UTC+7).
        expect(formatDate('2026-11-17T18:30:00Z')).toBe('18 Nov 2026');
    });

    it('treats bare dates as calendar days', () => {
        expect(formatDate('2027-01-31')).toBe('31 Jan 2027');
    });

    it('returns "-" for empty or invalid values', () => {
        expect(formatDate(null)).toBe('-');
        expect(formatDate('bukan tanggal')).toBe('-');
    });
});

describe('formatDateTime', () => {
    it('includes the Jakarta time', () => {
        expect(formatDateTime('2026-11-18T07:05:00Z')).toBe('18 Nov 2026, 14.05');
    });
});

describe('toJakartaDateString', () => {
    it('returns YYYY-MM-DD for the Jakarta calendar day', () => {
        expect(toJakartaDateString(new Date('2026-11-17T18:30:00Z'))).toBe('2026-11-18');
    });
});
