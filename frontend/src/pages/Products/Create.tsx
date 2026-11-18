import { useState } from 'react';
import { useNavigate } from 'react-router';
import PageHeader from '@/components/ui/PageHeader';
import { errorMessage } from '@/services/api.service';
import { productService } from '@/services/master.service';
import { toast } from '@/utils/toast';
import ProductForm from './ProductForm';

const ProductCreate = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (form: FormData) => {
        setSaving(true);
        try {
            const res = await productService.create(form);
            toast.success(res.message);
            navigate(`/products/${res.data!.id}`);
        } catch (err) {
            toast.error(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <PageHeader title="Tambah Produk" breadcrumbs={[{ label: 'Produk', to: '/products' }, { label: 'Tambah' }]} />
            <ProductForm saving={saving} onSubmit={handleSubmit} />
        </>
    );
};

export default ProductCreate;
