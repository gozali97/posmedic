import { formatNumber } from './format';

export interface UnitLike {
    name: string;
    /** Base units per one of this unit; 1 for the base unit. */
    conversion_qty: number;
}

/**
 * Splits a base-unit quantity into the largest units first: 234 tablet with box=100, strip=10 → [2 box, 3 strip, 4 tablet].
 * Zero parts are dropped; 0 gives one base-unit part. Negative quantities keep their sign on the first part.
 */
export const breakdownStock = (qty: number, units: UnitLike[]): { qty: number; unit: string }[] => {
    const sorted = [...units].filter((u) => u.conversion_qty > 0).sort((a, b) => b.conversion_qty - a.conversion_qty);
    const base = sorted.find((u) => u.conversion_qty === 1) ?? sorted[sorted.length - 1];
    if (!base) return [{ qty, unit: '' }];
    if (qty === 0) return [{ qty: 0, unit: base.name }];

    let rest = Math.abs(qty);
    const parts: { qty: number; unit: string }[] = [];
    for (const u of sorted) {
        const n = Math.floor(rest / u.conversion_qty);
        if (n > 0) {
            parts.push({ qty: n, unit: u.name });
            rest -= n * u.conversion_qty;
        }
    }
    // A product without a conversion-1 unit cannot leave a remainder smaller than its smallest unit; show it in base units.
    if (rest > 0) parts.push({ qty: rest, unit: base.name });
    if (qty < 0) parts[0] = { ...parts[0], qty: -parts[0].qty };
    return parts;
};

/** "2 box 3 strip 4 tablet" */
export const formatStock = (qty: number, units: UnitLike[]): string =>
    breakdownStock(qty, units)
        .map((p) => `${formatNumber(p.qty)} ${p.unit}`.trim())
        .join(' ');

/** "2 box 3 strip 4 tablet (234 tablet)"; just "4 tablet" when only the base unit is involved. */
export const formatStockFull = (qty: number, units: UnitLike[]): string => {
    const parts = breakdownStock(qty, units);
    const text = formatStock(qty, units);
    const base = units.find((u) => u.conversion_qty === 1)?.name ?? '';
    if (parts.length === 1 && parts[0].unit === base) return text;
    return `${text} (${formatNumber(qty)} ${base})`.trim();
};
