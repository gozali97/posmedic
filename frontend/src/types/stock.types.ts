import type { PaginationMeta } from './api.types';
import type { Product, ProductBatch, Supplier } from './master.types';

/** Mirrors backend models (purchase.go, stock.go) and dto/stock_dto.go. Dates without time are "YYYY-MM-DD". */

export interface UserBrief {
    id: number;
    username: string;
    fullname: string;
}

// ---------------------------------------------------------------- penerimaan & hutang (F6)

export type PaymentStatus = 'unpaid' | 'paid';

export interface Purchase {
    id: number;
    supplier_id: number;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    total: number;
    payment_status: PaymentStatus;
    paid_at: string | null;
    payment_note: string | null;
    note: string | null;
    user_id: number;
    created_at: string;
    updated_at: string;
    supplier?: Supplier;
    user?: UserBrief;
    items?: PurchaseItem[];
}

export interface PurchaseItem {
    id: number;
    purchase_id: number;
    product_id: number;
    product_unit_id: number;
    unit_name: string;
    conversion_qty: number;
    quantity: number;
    unit_cost: number;
    line_total: number;
    batch_number: string;
    expiration_date: string;
    product_batch_id: number;
    created_at: string;
    updated_at: string;
    product?: Product;
}

export interface PurchaseItemPayload {
    product_unit_id: number;
    quantity: number;
    /** Per purchased unit, after invoice discount, incl. PPN. */
    unit_cost: number;
    batch_number: string;
    expiration_date: string;
}

export interface PurchasePayload {
    supplier_id: number;
    invoice_number: string;
    invoice_date: string;
    /** Omit to use invoice date + supplier payment term. */
    due_date?: string;
    note: string;
    items: PurchaseItemPayload[];
}

export interface PurchaseListItem extends Purchase {
    supplier_name: string;
    item_count: number;
    is_overdue: boolean;
}

export interface PayableSummary {
    unpaid_total: number;
    overdue_total: number;
    overdue_count: number;
}

export interface PurchaseListParams {
    search?: string;
    supplier_id?: number | '';
    payment_status?: PaymentStatus | '';
    start_date?: string;
    end_date?: string;
}

export interface PayableListParams {
    supplier_id?: number | '';
    /** overdue = past due date, week = due within 7 days (includes overdue). */
    due?: 'overdue' | 'week' | '';
}

export interface PurchaseListData {
    purchases: PurchaseListItem[];
    pagination: PaginationMeta;
    /** Only on /purchases/payables. */
    summary?: PayableSummary;
}

export interface MarkPaidPayload {
    paid_at: string;
    payment_note: string;
}

// ---------------------------------------------------------------- batch & penyesuaian (F7, F8)

export interface BatchItem extends ProductBatch {
    product_name: string;
    generic_name: string | null;
    shelf_location: string | null;
    base_unit: string | null;
    expiry_status: 'expired' | 'warning' | 'ok';
    days_to_expiry: number;
}

export interface BatchListParams {
    search?: string;
    product_id?: number | '';
    shelf_location?: string;
    /** expired | 30 (≤ 30 days) | warning (≤ expiry_warning_days) */
    expiry_status?: 'expired' | '30' | 'warning' | '';
    /** '1' (default) only batches in stock, '0' all. */
    in_stock?: '1' | '0';
}

export interface BatchListData {
    batches: BatchItem[];
    pagination: PaginationMeta;
}

export const ADJUSTMENT_REASONS = [
    { value: 'expired', label: 'Kedaluwarsa (pemusnahan)' },
    { value: 'damaged', label: 'Rusak' },
    { value: 'lost', label: 'Hilang' },
    { value: 'correction', label: 'Koreksi' },
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number]['value'];

export interface AdjustmentPayload {
    /** Base units; negative to reduce. Not 0. */
    quantity: number;
    reason: AdjustmentReason;
    note: string;
}

// ---------------------------------------------------------------- stok opname (F8)

export type OpnameStatus = 'draft' | 'posted';

export interface StockOpname {
    id: number;
    opname_number: string;
    status: OpnameStatus;
    category_id: number | null;
    shelf_location: string | null;
    note: string | null;
    user_id: number;
    posted_by: number | null;
    posted_at: string | null;
    created_at: string;
    updated_at: string;
    user?: UserBrief;
}

export interface OpnameListItem extends StockOpname {
    category_name: string | null;
    username: string;
    item_count: number;
    counted_count: number;
}

export interface OpnameListData {
    stock_opnames: OpnameListItem[];
    pagination: PaginationMeta;
}

export interface OpnameItem {
    id: number;
    stock_opname_id: number;
    product_id: number;
    /** null = batch found during counting, created on posting. */
    product_batch_id: number | null;
    batch_number: string;
    expiration_date: string;
    cost_price: number;
    /** Filled on posting. */
    system_quantity: number | null;
    counted_quantity: number | null;
    /** Filled on posting: counted − system at posting time. */
    difference: number | null;
    created_at: string;
    updated_at: string;
    product_name: string;
    shelf_location: string | null;
    base_unit: string | null;
    /** Live batch quantity (draft sessions). */
    current_quantity: number | null;
}

export interface OpnameDetail extends StockOpname {
    category_name: string | null;
    items: OpnameItem[];
}

export interface OpnameCreatePayload {
    category_id: number | null;
    shelf_location: string;
    note: string;
}

export interface OpnameNewBatchPayload {
    product_id: number;
    batch_number: string;
    expiration_date: string;
    /** Per base unit. */
    cost_price: number;
    counted_quantity: number;
}

export interface OpnameItemsPayload {
    items: { id: number; counted_quantity: number | null }[];
    new_items: OpnameNewBatchPayload[];
    remove_item_ids: number[];
}
