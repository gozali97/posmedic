import type { PaginationMeta } from './api.types';
import type { Customer, DrugClass, ProductBatch } from './master.types';
import type { Till } from './setting.types';
import type { UserBrief } from './stock.types';

/** Mirrors backend models/sales.go and dto/sales_dto.go. Money is whole rupiah. */

export const PAYMENT_METHODS = [
    { value: 'cash', label: 'Tunai' },
    { value: 'card', label: 'Kartu/Debit' },
    { value: 'qris', label: 'QRIS/Transfer' },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];

export const paymentMethodLabel = (m: string | null | undefined): string => PAYMENT_METHODS.find((p) => p.value === m)?.label ?? '-';

// ---------------------------------------------------------------- shift (F9)

export interface Shift {
    id: number;
    user_id: number;
    till_id: number;
    status: 'open' | 'closed';
    opening_cash: number;
    expected_cash: number | null;
    counted_cash: number | null;
    cash_difference: number | null;
    note: string | null;
    opened_at: string;
    closed_at: string | null;
    created_at: string;
    updated_at: string;
    user?: UserBrief;
    till?: Till;
}

export interface MethodRecap {
    method: PaymentMethod;
    sales_count: number;
    sales_total: number;
    void_count: number;
    void_total: number;
    refund_count: number;
    refund_total: number;
    net_received: number;
}

export interface ShiftRecap {
    methods: MethodRecap[];
    opening_cash: number;
    cash_sales: number;
    cash_refunds: number;
    /** BR12: opening + cash sales − cash refunds (voids are already excluded from sales). */
    expected_cash: number;
}

export interface ShiftDetail extends Shift {
    recap: ShiftRecap | null;
}

export interface ShiftListParams {
    user_id?: number | '';
    till_id?: number | '';
    status?: 'open' | 'closed' | '';
}

export interface ShiftListData {
    shifts: Shift[];
    pagination: PaginationMeta;
}

export interface ShiftClosePayload {
    counted_cash: number;
    note: string;
}

// ---------------------------------------------------------------- transaksi (F10–F12)

export type TransactionStatus = 'held' | 'paid' | 'void';

export interface TransactionItemBatch {
    id: number;
    transaction_item_id: number;
    product_batch_id: number;
    quantity: number;
    cost_price: number;
    returned_quantity: number;
    batch?: ProductBatch;
}

export interface TransactionItem {
    id: number;
    transaction_id: number;
    product_id: number;
    product_unit_id: number;
    product_name: string;
    unit_name: string;
    conversion_qty: number;
    drug_class: DrugClass;
    price: number;
    quantity: number;
    line_total: number;
    discount_share: number;
    returned_base_quantity: number;
    batches?: TransactionItemBatch[];
}

export interface SalesReturnItem {
    id: number;
    sales_return_id: number;
    transaction_item_id: number;
    base_quantity: number;
    refund_amount: number;
    cost_amount: number;
    restock: boolean;
    transaction_item?: TransactionItem;
}

export interface SalesReturn {
    id: number;
    return_number: string;
    transaction_id: number;
    user_id: number;
    shift_id: number;
    till_id: number;
    total_refund: number;
    refund_method: PaymentMethod;
    reason: string;
    created_at: string;
    updated_at: string;
    user?: UserBrief;
    till?: Till;
    transaction?: Transaction;
    items?: SalesReturnItem[];
}

export interface Transaction {
    id: number;
    invoice_number: string | null;
    ref_number: string | null;
    customer_id: number | null;
    till_id: number;
    created_by: number;
    paid_by: number | null;
    shift_id: number | null;
    status: TransactionStatus;
    subtotal: number;
    discount: number;
    total: number;
    dpp: number;
    ppn: number;
    /** Percent, e.g. 11. */
    ppn_rate: number;
    paid: number;
    change: number;
    payment_method: PaymentMethod | null;
    payment_info: string | null;
    prescription_number: string | null;
    prescription_note: string | null;
    void_reason: string | null;
    voided_by: number | null;
    voided_at: string | null;
    paid_at: string | null;
    created_at: string;
    updated_at: string;
    customer?: Customer;
    till?: Till;
    cashier?: UserBrief;
    creator?: UserBrief;
    items?: TransactionItem[];
    returns?: SalesReturn[];
}

export interface CartLinePayload {
    product_unit_id: number;
    quantity: number;
}

export interface PaymentPayload {
    method: PaymentMethod;
    /** Cash: amount handed over (≥ total). Card/QRIS: ignored, server sets paid = total. */
    paid: number;
    /** Card note or QRIS/transfer reference. */
    info: string;
}

/** Prices and totals are recomputed by the server (BR2); the client only sends units and quantities. */
export interface TransactionPayload {
    status: 'held' | 'paid';
    till_id: number;
    items: CartLinePayload[];
    discount: number;
    customer_id: number | null;
    ref_number: string;
    prescription_number: string;
    prescription_note: string;
    payment?: PaymentPayload;
}

export interface HeldUpdatePayload {
    till_id: number;
    items: CartLinePayload[];
    discount: number;
    customer_id: number | null;
    ref_number: string;
    prescription_number: string;
    prescription_note: string;
}

export interface PayHeldPayload {
    till_id: number;
    payment: PaymentPayload;
    customer_id?: number | null;
    prescription_number?: string;
    prescription_note?: string;
}

export interface HeldItem {
    id: number;
    ref_number: string | null;
    customer_id: number | null;
    customer_name: string | null;
    till_id: number;
    total: number;
    item_count: number;
    created_by: number;
    creator_name: string;
    created_at: string;
}

export interface HeldListParams {
    /** tab = has ref number; customer = customer without ref. */
    type?: 'tab' | 'customer' | '';
    search?: string;
}

export interface HeldListData {
    transactions: HeldItem[];
    pagination: PaginationMeta;
}

export interface TransactionListItem {
    id: number;
    invoice_number: string | null;
    ref_number: string | null;
    status: TransactionStatus;
    total: number;
    paid: number;
    change: number;
    payment_method: PaymentMethod | null;
    paid_at: string | null;
    created_at: string;
    till_id: number;
    till_number: number;
    till_name: string;
    shift_id: number | null;
    cashier_name: string | null;
    customer_name: string | null;
    refund_total: number;
    return_count: number;
}

/** Shared by /transactions, /transactions/summary and /transactions/export. end_date is inclusive. */
export interface TransactionFilters {
    start_date?: string;
    end_date?: string;
    user_id?: number | '';
    till_id?: number | '';
    shift_id?: number | '';
    status?: TransactionStatus | '';
    search?: string;
}

export interface TransactionListData {
    transactions: TransactionListItem[];
    pagination: PaginationMeta;
}

export interface SoldProductItem {
    product_id: number;
    product_name: string;
    base_unit: string | null;
    sold_quantity: number;
    stock_quantity: number;
    net_sales: number;
    cogs: number;
    profit: number;
}

/** Paid transactions whose paid_at falls in the period, including later returns of those sales. */
export interface SalesSummary {
    gross_sales: number;
    returns: number;
    net_sales: number;
    cogs: number;
    gross_profit: number;
    transaction_count: number;
    items_sold: number;
    dpp: number;
    ppn: number;
    products: SoldProductItem[];
}

export interface VoidPayload {
    reason: string;
}

export interface ReturnLinePayload {
    transaction_item_id: number;
    /** In base units, ≤ sold − already returned. */
    base_quantity: number;
    restock: boolean;
}

export interface ReturnPayload {
    items: ReturnLinePayload[];
    reason: string;
    refund_method: PaymentMethod;
}

export interface SalesReturnListItem extends SalesReturn {
    invoice_number: string | null;
    username: string;
    till_number: number;
}

export interface SalesReturnListParams {
    start_date?: string;
    end_date?: string;
    search?: string;
}

export interface SalesReturnListData {
    sales_returns: SalesReturnListItem[];
    pagination: PaginationMeta;
}
