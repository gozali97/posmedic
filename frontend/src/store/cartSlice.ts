import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { login, logout } from './authSlice';
import type { Customer, ProductItem, ProductUnit } from '@/types/master.types';
import type { CartLinePayload } from '@/types/sales.types';

/** What the cart keeps of a product: enough to show the line and enforce the sellable stock. */
export type CartProduct = Pick<ProductItem, 'id' | 'name' | 'generic_name' | 'drug_class' | 'track_stock' | 'sellable_stock' | 'units'>;

export interface CartLine {
    /** `${productId}-${unitId}`: one line per product + unit (F10). */
    key: string;
    product: CartProduct;
    unitId: number;
    qty: number;
}

export interface CartState {
    lines: CartLine[];
    discount: number;
    customer: Pick<Customer, 'id' | 'name' | 'phone'> | null;
    refNumber: string;
    prescriptionNumber: string;
    prescriptionNote: string;
    /** Set when a held order was loaded: saving or paying updates that order instead of creating one. */
    heldId: number | null;
}

const initialState: CartState = { lines: [], discount: 0, customer: null, refNumber: '', prescriptionNumber: '', prescriptionNote: '', heldId: null };

// ---------------------------------------------------------------- pure helpers (tested in cartSlice.test.ts)

export const lineKey = (productId: number, unitId: number) => `${productId}-${unitId}`;

export const lineUnit = (line: CartLine): ProductUnit | undefined => line.product.units.find((u) => u.id === line.unitId);

export const lineTotal = (line: CartLine): number => (lineUnit(line)?.price ?? 0) * line.qty;

export const cartSubtotal = (lines: CartLine[]): number => lines.reduce((sum, l) => sum + lineTotal(l), 0);

/** Base units of `productId` already in the cart, ignoring the line `exceptKey`. */
const usedBase = (lines: CartLine[], productId: number, exceptKey?: string): number =>
    lines.filter((l) => l.product.id === productId && l.key !== exceptKey).reduce((sum, l) => sum + l.qty * (lineUnit(l)?.conversion_qty ?? 1), 0);

/**
 * Largest quantity of `unitId` that line `key` may hold, given the other lines of the same product.
 * Products without stock tracking (services) are unlimited.
 */
export const maxLineQty = (lines: CartLine[], product: CartProduct, unitId: number, key = lineKey(product.id, unitId)): number => {
    if (!product.track_stock) return Number.POSITIVE_INFINITY;
    const conv = product.units.find((u) => u.id === unitId)?.conversion_qty ?? 1;
    return Math.max(0, Math.floor((product.sellable_stock - usedBase(lines, product.id, key)) / conv));
};

/** Payload lines for POST /transactions; the server recomputes prices (BR2). */
export const cartPayloadLines = (lines: CartLine[]): CartLinePayload[] => lines.map((l) => ({ product_unit_id: l.unitId, quantity: l.qty }));

const clampDiscount = (state: CartState) => {
    // F10: a discount that reaches the subtotal is reset to 0.
    if (state.discount >= cartSubtotal(state.lines)) state.discount = 0;
};

// ---------------------------------------------------------------- slice

const cartSlice = createSlice({
    name: 'cart',
    initialState,
    reducers: {
        /** Adds `qty` of a unit, merging into the existing line of the same product + unit; clamped to the sellable stock. */
        addItem(state, action: PayloadAction<{ product: CartProduct; unitId: number; qty?: number }>) {
            const { product, unitId, qty = 1 } = action.payload;
            const key = lineKey(product.id, unitId);
            const existing = state.lines.find((l) => l.key === key);
            // Keep the freshest stock figure for every line of this product.
            state.lines.forEach((l) => {
                if (l.product.id === product.id) l.product = product;
            });
            const max = maxLineQty(state.lines, product, unitId, key);
            const next = Math.min((existing?.qty ?? 0) + qty, max);
            if (next <= 0) return;
            if (existing) existing.qty = next;
            else state.lines.push({ key, product, unitId, qty: next });
        },
        setQty(state, action: PayloadAction<{ key: string; qty: number }>) {
            const line = state.lines.find((l) => l.key === action.payload.key);
            if (!line) return;
            const max = maxLineQty(state.lines, line.product, line.unitId, line.key);
            line.qty = Math.max(1, Math.min(Math.floor(action.payload.qty) || 1, max));
            clampDiscount(state);
        },
        /** Switches a line to another unit; merges into an existing line of that unit. Quantity is kept, then clamped. */
        changeUnit(state, action: PayloadAction<{ key: string; unitId: number }>) {
            const idx = state.lines.findIndex((l) => l.key === action.payload.key);
            if (idx < 0) return;
            const line = state.lines[idx];
            const newKey = lineKey(line.product.id, action.payload.unitId);
            if (newKey === line.key) return;
            const target = state.lines.find((l) => l.key === newKey);
            state.lines.splice(idx, 1);
            const max = maxLineQty(state.lines, line.product, action.payload.unitId, newKey);
            if (target) {
                target.qty = Math.min(target.qty + line.qty, max);
            } else if (max > 0) {
                state.lines.splice(idx, 0, { ...line, key: newKey, unitId: action.payload.unitId, qty: Math.min(line.qty, max) });
            }
            clampDiscount(state);
        },
        removeLine(state, action: PayloadAction<string>) {
            state.lines = state.lines.filter((l) => l.key !== action.payload);
            clampDiscount(state);
        },
        setDiscount(state, action: PayloadAction<number>) {
            state.discount = Math.max(0, Math.floor(action.payload) || 0);
            clampDiscount(state);
        },
        setCustomer(state, action: PayloadAction<CartState['customer']>) {
            state.customer = action.payload;
        },
        setRefNumber(state, action: PayloadAction<string>) {
            state.refNumber = action.payload;
        },
        setPrescription(state, action: PayloadAction<{ number: string; note: string }>) {
            state.prescriptionNumber = action.payload.number;
            state.prescriptionNote = action.payload.note;
        },
        /** Replaces the cart with a held order (lines are rebuilt from current product data). */
        loadHeld(_state, action: PayloadAction<Omit<CartState, 'lines'> & { lines: CartLine[] }>) {
            return action.payload;
        },
        clearCart() {
            return initialState;
        },
    },
    // A cart never carries over to another cashier.
    extraReducers: (builder) => {
        builder.addCase(login.fulfilled, () => initialState).addCase(logout.fulfilled, () => initialState);
    },
});

export const { addItem, setQty, changeUnit, removeLine, setDiscount, setCustomer, setRefNumber, setPrescription, loadHeld, clearCart } = cartSlice.actions;
export default cartSlice.reducer;
