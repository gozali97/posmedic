import type { ImgHTMLAttributes } from 'react';

const DEFAULT_IMAGE = '/produk/default.png';

type ProductImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & { src?: string | null };

const ProductImage = ({ src, alt = '', ...props }: ProductImageProps) => (
    <img
        {...props}
        src={src?.trim() || DEFAULT_IMAGE}
        alt={alt}
        onError={({ currentTarget }) => {
            if (currentTarget.getAttribute('src') !== DEFAULT_IMAGE) currentTarget.src = DEFAULT_IMAGE;
        }}
    />
);

export default ProductImage;
