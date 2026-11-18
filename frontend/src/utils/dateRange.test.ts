import { describe, expect, it } from 'vitest';
import { presetRange } from './dateRange';

// 2026-03-01 01:30 in Jakarta is still 2026-02-28 in UTC.
const now = new Date('2026-02-28T18:30:00Z');

describe('presetRange', () => {
    it('uses the Jakarta calendar day', () => {
        expect(presetRange('today', now)).toEqual({ start_date: '2026-03-01', end_date: '2026-03-01' });
        expect(presetRange('yesterday', now)).toEqual({ start_date: '2026-02-28', end_date: '2026-02-28' });
    });

    it('counts today in rolling ranges', () => {
        expect(presetRange('7d', now)).toEqual({ start_date: '2026-02-23', end_date: '2026-03-01' });
        expect(presetRange('30d', now)).toEqual({ start_date: '2026-01-31', end_date: '2026-03-01' });
    });

    it('handles month boundaries', () => {
        expect(presetRange('this_month', now)).toEqual({ start_date: '2026-03-01', end_date: '2026-03-01' });
        expect(presetRange('last_month', now)).toEqual({ start_date: '2026-02-01', end_date: '2026-02-28' });
        expect(presetRange('last_month', new Date('2026-01-15T05:00:00Z'))).toEqual({ start_date: '2025-12-01', end_date: '2025-12-31' });
    });
});
