import { apiService } from './api.service';
import type { ListParams } from '@/types/api.types';
import type {
    BarcodeData,
    Category,
    CategoryListData,
    Customer,
    CustomerListData,
    CustomerPayload,
    ProductDetail,
    ProductItem,
    ProductListData,
    ProductListParams,
    StockMovementListData,
    Supplier,
    SupplierListData,
    SupplierPayload,
} from '@/types/master.types';

export const categoryService = {
    list: (params: ListParams, signal?: AbortSignal) => apiService.get<CategoryListData>('/categories', { ...params }, signal),
    /** Every category, unpaginated: for filter dropdowns and the product form. */
    all: (signal?: AbortSignal) => apiService.get<CategoryListData>('/categories', { all: 1 }, signal),
    create: (name: string) => apiService.post<Category>('/categories', { name }),
    update: (id: number, name: string) => apiService.put<Category>(`/categories/${id}`, { name }),
    remove: (id: number) => apiService.delete<null>(`/categories/${id}`),
};

export const customerService = {
    list: (params: ListParams, signal?: AbortSignal) => apiService.get<CustomerListData>('/customers', { ...params }, signal),
    detail: (id: number) => apiService.get<Customer>(`/customers/${id}`),
    create: (body: CustomerPayload) => apiService.post<Customer>('/customers', body),
    update: (id: number, body: CustomerPayload) => apiService.put<Customer>(`/customers/${id}`, body),
    remove: (id: number) => apiService.delete<null>(`/customers/${id}`),
};

export const supplierService = {
    list: (params: ListParams, signal?: AbortSignal) => apiService.get<SupplierListData>('/suppliers', { ...params }, signal),
    /** Every supplier, unpaginated: for dropdowns. */
    all: (signal?: AbortSignal) => apiService.get<SupplierListData>('/suppliers', { all: 1 }, signal),
    detail: (id: number) => apiService.get<Supplier>(`/suppliers/${id}`),
    create: (body: SupplierPayload) => apiService.post<Supplier>('/suppliers', body),
    update: (id: number, body: SupplierPayload) => apiService.put<Supplier>(`/suppliers/${id}`, body),
    remove: (id: number) => apiService.delete<null>(`/suppliers/${id}`),
};

export const productService = {
    list: (params: ListParams & ProductListParams, signal?: AbortSignal) => apiService.get<ProductListData>('/products', { ...params }, signal),
    detail: (id: number, signal?: AbortSignal) => apiService.get<ProductDetail>(`/products/${id}`, undefined, signal),
    /** Scanner lookup: the product plus the unit whose barcode matched. 404 when unknown. */
    barcode: (code: string) => apiService.get<BarcodeData>(`/products/barcode/${encodeURIComponent(code)}`),
    /** multipart/form-data: fields + `units` (JSON array of ProductUnitInput) + optional `image` + `remove_image`. */
    create: (form: FormData) => apiService.post<ProductItem>('/products', form),
    update: (id: number, form: FormData) => apiService.put<ProductItem>(`/products/${id}`, form),
    remove: (id: number) => apiService.delete<null>(`/products/${id}`),
    stockMovements: (id: number, params: ListParams, signal?: AbortSignal) => apiService.get<StockMovementListData>(`/products/${id}/stock-movements`, { ...params }, signal),
    export: (params: ProductListParams, filename: string) => apiService.download('/products/export', filename, { ...params }),
};
