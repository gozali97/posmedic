import { describe, expect, it } from 'vitest';
import { breakdownStock, formatStock, formatStockFull } from './stock';

const units = [
    { name: 'tablet', conversion_qty: 1 },
    { name: 'box', conversion_qty: 100 },
    { name: 'strip', conversion_qty: 10 },
];

describe('formatStock', () => {
    it('splits into the largest units first, regardless of input order', () => {
        expect(formatStock(234, units)).toBe('2 box 3 strip 4 tablet');
    });

    it('drops zero parts', () => {
        expect(formatStock(204, units)).toBe('2 box 4 tablet');
        expect(formatStock(300, units)).toBe('3 box');
    });

    it('shows zero in the base unit', () => {
        expect(formatStock(0, units)).toBe('0 tablet');
    });

    it('keeps the sign of negative quantities on the first part', () => {
        expect(breakdownStock(-15, units)).toEqual([
            { qty: -1, unit: 'strip' },
            { qty: 5, unit: 'tablet' },
        ]);
    });

    it('uses thousands separators', () => {
        expect(formatStock(1500, [{ name: 'ml', conversion_qty: 1 }])).toBe('1.500 ml');
    });
});

describe('formatStockFull', () => {
    it('appends the base-unit total when bigger units are used', () => {
        expect(formatStockFull(234, units)).toBe('2 box 3 strip 4 tablet (234 tablet)');
    });

    it('omits the total when only the base unit is shown', () => {
        expect(formatStockFull(7, units)).toBe('7 tablet');
    });
});
