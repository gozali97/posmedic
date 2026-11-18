import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import { errorMessage } from '@/services/api.service';
import { productService } from '@/services/master.service';
import type { ProductItem } from '@/types/master.types';
import { toast } from '@/utils/toast';
import ProductForm from './ProductForm';

const ProductEdit = () => {
    const { id } = useParams();
    const productId = Number(id);
    const navigate = useNavigate();
    const [product, setProduct] = useState<ProductItem | null>(null);
    const [loadError, setLoadError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!Number.isInteger(productId) || productId <= 0) {
            setLoadError('ID produk tidak valid');
            return;
        }
        const controller = new AbortController();
        productService
            .detail(productId, controller.signal)
            .then((res) => setProduct(res.data!))
            .catch((err) => {
                if (!controller.signal.aborted) setLoadError(errorMessage(err));
            });
        return () => controller.abort();
    }, [productId]);

    const handleSubmit = async (form: FormData) => {
        setSaving(true);
        try {
            const res = await productService.update(productId, form);
            toast.success(res.message);
            navigate(`/products/${productId}`);
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <PageHeader title="Ubah Produk" breadcrumbs={[{ label: 'Produk', to: '/products' }, { label: product?.name ?? 'Ubah' }]} />
            {loadError ? (
                <Card>
                    <p className="text-danger-500 !mb-0">{loadError}</p>
                </Card>
            ) : !product ? (
                <Card>
                    <p className="!mb-0">Memuat data produk…</p>
                </Card>
            ) : (
                <ProductForm product={product} saving={saving} onSubmit={handleSubmit} />
            )}
        </>
    );
};

export default ProductEdit;
