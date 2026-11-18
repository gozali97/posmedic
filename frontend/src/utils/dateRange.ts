import { toJakartaDateString } from './format';

export const DATE_PRESETS = [
    { value: 'today', label: 'Hari ini' },
    { value: 'yesterday', label: 'Kemarin' },
    { value: '7d', label: '7 hari' },
    { value: '30d', label: '30 hari' },
    { value: 'this_month', label: 'Bulan ini' },
    { value: 'last_month', label: 'Bulan lalu' },
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number]['value'];

export interface DateRange {
    start_date: string;
    /** Inclusive, like the backend filter. */
    end_date: string;
}

// Calendar arithmetic on "YYYY-MM-DD" strings in UTC, so the host time zone never shifts a day.
const parse = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, day));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
    const x = parse(d);
    x.setUTCDate(x.getUTCDate() + n);
    return fmt(x);
};

/** Range for a preset, relative to today in Asia/Jakarta. "7 hari" = today and the 6 days before. */
export const presetRange = (preset: DatePreset, now: Date = new Date()): DateRange => {
    const today = toJakartaDateString(now);
    const t = parse(today);
    switch (preset) {
        case 'today':
            return { start_date: today, end_date: today };
        case 'yesterday': {
            const y = addDays(today, -1);
            return { start_date: y, end_date: y };
        }
        case '7d':
            return { start_date: addDays(today, -6), end_date: today };
        case '30d':
            return { start_date: addDays(today, -29), end_date: today };
        case 'this_month':
            return { start_date: fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))), end_date: today };
        case 'last_month':
            return {
                start_date: fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1))),
                end_date: fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0))),
            };
    }
};
