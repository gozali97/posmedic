const TIME_ZONE = 'Asia/Jakarta';

const numberFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** 1234567 → "1.234.567". Money is whole rupiah (BR5), so no decimals. */
export const formatNumber = (value: number | null | undefined): string => numberFormat.format(value ?? 0);

/** 12500 → "Rp 12.500", -5000 → "-Rp 5.000". The symbol comes from store settings. */
export const formatRupiah = (value: number | null | undefined, symbol = 'Rp'): string => {
    const n = value ?? 0;
    return `${n < 0 ? '-' : ''}${symbol} ${numberFormat.format(Math.abs(n))}`;
};

const dateFormat = new Intl.DateTimeFormat('id-ID', { timeZone: TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('id-ID', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

const toDate = (value: string | Date): Date | null => {
    // Bare dates ("2026-11-18", e.g. expiry dates) are calendar days, not instants.
    const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+07:00`) : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

/** "18 Nov 2026" in Asia/Jakarta; "-" for empty or invalid input. */
export const formatDate = (value: string | Date | null | undefined): string => {
    const d = value ? toDate(value) : null;
    return d ? dateFormat.format(d) : '-';
};

/** "18 Nov 2026, 14.05" in Asia/Jakarta. */
export const formatDateTime = (value: string | Date | null | undefined): string => {
    const d = value ? toDate(value) : null;
    return d ? dateTimeFormat.format(d) : '-';
};

/** Calendar date "YYYY-MM-DD" in Asia/Jakarta, used for date filters. */
export const toJakartaDateString = (value: Date = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(value);
