import type { PaginationMeta } from './api.types';

/** Mirrors backend models (backend/models/master.go) and dto/master_dto.go. */

export const DRUG_CLASSES = [
    { value: 'bebas', label: 'Obat Bebas' },
    { value: 'bebas_terbatas', label: 'Bebas Terbatas' },
    { value: 'keras', label: 'Obat Keras' },
    { value: 'narkotika', label: 'Narkotika' },
    { value: 'psikotropika', label: 'Psikotropika' },
    { value: 'non_obat', label: 'Non-obat' },
] as const;

export type DrugClass = (typeof DRUG_CLASSES)[number]['value'];

/** BR4: these classes need a customer (patient) and a prescription number before payment. */
export const needsPrescription = (c: string): boolean => c === 'narkotika' || c === 'psikotropika';

// ---------------------------------------------------------------- kategori

export interface Category {
    id: number;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface CategoryItem extends Category {
    product_count: number;
}

export interface CategoryListData {
    categories: CategoryItem[];
    /** Absent when listed with all=1. */
    pagination?: PaginationMeta;
}

// ---------------------------------------------------------------- pelanggan & supplier

export interface Customer {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    created_at: string;
    updated_at: string;
}

export interface CustomerPayload {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
}

export interface CustomerListData {
    customers: Customer[];
    pagination: PaginationMeta;
}

export interface Supplier {
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
    contact_name: string | null;
    tax_number: string | null;
    payment_term_days: number;
    created_at: string;
    updated_at: string;
}

export interface SupplierPayload {
    name: string;
    address: string | null;
    phone: string | null;
    contact_name: string | null;
    tax_number: string | null;
    payment_term_days: number;
}

export interface SupplierListData {
    suppliers: Supplier[];
    /** Absent when listed with all=1. */
    pagination?: PaginationMeta;
}

// ---------------------------------------------------------------- produk

export interface ProductUnit {
    id: number;
    product_id: number;
    name: string;
    /** Base units per one of this unit; 1 for the base unit. */
    conversion_qty: number;
    /** Selling price incl. PPN, whole rupiah. */
    price: number;
    barcode: string | null;
    is_base: boolean;
    created_at: string;
    updated_at: string;
}

/** One row of the units table sent with the product form (`units` JSON field). id 0 = new unit. */
export interface ProductUnitInput {
    id: number;
    name: string;
    conversion_qty: number;
    price: number;
    barcode: string | null;
    is_base: boolean;
}

/** Plain product row (models.Product), as embedded in purchase items. */
export interface Product {
    id: number;
    category_id: number | null;
    name: string;
    generic_name: string | null;
    drug_class: DrugClass;
    shelf_location: string | null;
    min_stock: number;
    track_stock: boolean;
    image: string | null;
    created_at: string;
    updated_at: string;
    units?: ProductUnit[];
}

export type StockStatus = 'out' | 'low' | 'ok';
export type ExpiryStatus = 'expired' | 'warning' | 'ok' | 'none';

/** Product with stock computed from batches (in base units). */
export interface ProductItem {
    id: number;
    category_id: number | null;
    category_name: string | null;
    name: string;
    generic_name: string | null;
    drug_class: DrugClass;
    shelf_location: string | null;
    min_stock: number;
    track_stock: boolean;
    image: string | null;
    /** All batches. */
    stock: number;
    /** Batches not expired: what can be sold. */
    sellable_stock: number;
    nearest_expiry: string | null;
    stock_status: StockStatus;
    expiry_status: ExpiryStatus;
    created_at: string;
    updated_at: string;
    units: ProductUnit[];
}

export interface ProductListParams {
    search?: string;
    category_id?: number | '';
    drug_class?: string;
    stock_status?: string;
    expiry_status?: string;
}

export interface ProductListData {
    products: ProductItem[];
    pagination: PaginationMeta;
}

export interface ProductBatch {
    id: number;
    product_id: number;
    batch_number: string;
    expiration_date: string;
    quantity: number;
    /** Per base unit. */
    cost_price: number;
    source: 'purchase' | 'opname';
    created_at: string;
    updated_at: string;
}

export interface ProductDetail extends ProductItem {
    batches: ProductBatch[];
}

export interface BarcodeData {
    product: ProductItem;
    unit: ProductUnit;
}

export type StockMovementType = 'purchase' | 'sale' | 'void' | 'return' | 'adjustment' | 'opname';

export interface StockMovement {
    id: number;
    product_id: number;
    product_batch_id: number | null;
    type: StockMovementType;
    reason: string | null;
    quantity: number;
    stock_after: number;
    reference_type: string | null;
    reference_id: number | null;
    note: string | null;
    user_id: number;
    created_at: string;
    batch_number: string | null;
    username: string | null;
}

export interface StockMovementListData {
    stock_movements: StockMovement[];
    pagination: PaginationMeta;
}
