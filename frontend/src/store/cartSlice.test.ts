import { describe, expect, it } from 'vitest';
import reducer, { addItem, cartSubtotal, changeUnit, maxLineQty, removeLine, setDiscount, setQty, type CartProduct, type CartState } from './cartSlice';

const unit = (id: number, name: string, conversion_qty: number, price: number) => ({
    id,
    product_id: 1,
    name,
    conversion_qty,
    price,
    barcode: null,
    is_base: conversion_qty === 1,
    created_at: '',
    updated_at: '',
});

// 25 tablets sellable; strip = 10 tablets.
const para: CartProduct = {
    id: 1,
    name: 'Paracetamol',
    generic_name: null,
    drug_class: 'bebas',
    track_stock: true,
    sellable_stock: 25,
    units: [unit(11, 'tablet', 1, 1000), unit(12, 'strip', 10, 9000)],
};
const service: CartProduct = { id: 2, name: 'Embalase', generic_name: null, drug_class: 'non_obat', track_stock: false, sellable_stock: 0, units: [{ ...unit(21, 'kali', 1, 2000), product_id: 2 }] };

const run = (...actions: Parameters<typeof reducer>[1][]): CartState => actions.reduce((s, a) => reducer(s, a), reducer(undefined, { type: 'init' }));

describe('cartSlice', () => {
    it('merges the same product + unit into one line', () => {
        const s = run(addItem({ product: para, unitId: 11 }), addItem({ product: para, unitId: 11 }));
        expect(s.lines).toHaveLength(1);
        expect(s.lines[0].qty).toBe(2);
    });

    it('limits quantity × conversion to the sellable stock across lines of one product', () => {
        let s = run(addItem({ product: para, unitId: 12, qty: 5 }));
        expect(s.lines[0].qty).toBe(2); // 2 strips = 20 tablets of 25
        s = reducer(s, addItem({ product: para, unitId: 11, qty: 10 }));
        expect(s.lines[1].qty).toBe(5); // only 5 tablets left
        expect(maxLineQty(s.lines, para, 12, s.lines[0].key)).toBe(2);
        s = reducer(s, setQty({ key: s.lines[1].key, qty: 99 }));
        expect(s.lines[1].qty).toBe(5);
    });

    it('does not add a line when nothing is left', () => {
        const s = run(addItem({ product: { ...para, sellable_stock: 0 }, unitId: 11 }));
        expect(s.lines).toHaveLength(0);
    });

    it('does not limit products without stock tracking', () => {
        const s = run(addItem({ product: service, unitId: 21, qty: 500 }));
        expect(s.lines[0].qty).toBe(500);
    });

    it('changing the unit merges into an existing line and clamps', () => {
        let s = run(addItem({ product: para, unitId: 11, qty: 3 }), addItem({ product: para, unitId: 12, qty: 1 }));
        s = reducer(s, changeUnit({ key: s.lines[0].key, unitId: 12 }));
        expect(s.lines).toHaveLength(1);
        expect(s.lines[0].unitId).toBe(12);
        expect(s.lines[0].qty).toBe(2); // 1 + 3 strips would need 40 tablets; 25 allow 2
    });

    it('resets a discount that reaches the subtotal (F10)', () => {
        let s = run(addItem({ product: para, unitId: 11, qty: 3 }), setDiscount(500));
        expect(cartSubtotal(s.lines)).toBe(3000);
        expect(s.discount).toBe(500);
        s = reducer(s, setDiscount(3000));
        expect(s.discount).toBe(0);
        s = reducer(s, setDiscount(2500));
        s = reducer(s, removeLine(s.lines[0].key));
        expect(s.discount).toBe(0);
    });
});
