import { describe, expect, it } from 'vitest';
import ProductImage from './ProductImage';

describe('ProductImage', () => {
    it.each([undefined, null, '', '   '])('uses the default image for %s', (src) => {
        expect(ProductImage({ src }).props.src).toBe('/produk/default.png');
    });

    it('preserves an existing image and its accessible name', () => {
        const image = ProductImage({ src: '/medicine.png', alt: 'Paracetamol' });
        expect(image.props.src).toBe('/medicine.png');
        expect(image.props.alt).toBe('Paracetamol');
    });

    it('replaces a failed image only once, even if the fallback fails', () => {
        let source = '/broken.png';
        let assignments = 0;
        const currentTarget = {
            getAttribute: () => source,
            set src(value: string) { source = value; assignments += 1; },
        };
        const image = ProductImage({ src: source });
        image.props.onError({ currentTarget });
        image.props.onError({ currentTarget });
        expect(source).toBe('/produk/default.png');
        expect(assignments).toBe(1);
    });
});