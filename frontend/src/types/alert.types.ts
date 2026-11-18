/** GET /alerts (PRD F16), mirrors backend dto.AlertsData; lists are capped at 20 rows each. */
export interface AlertCounts {
    expired_batches: number;
    near_expiry_batches: number;
    low_stock: number;
    out_of_stock: number;
    /** Only present for users with perm_purchases. */
    payables_due?: number;
}

export interface AlertBatch {
    id: number;
    product_id: number;
    product_name: string;
    batch_number: string;
    expiration_date: string;
    quantity: number;
}

export interface AlertProduct {
    id: number;
    name: string;
    sellable_stock: number;
    min_stock: number;
}

export interface AlertPayable {
    id: number;
    supplier_name: string;
    invoice_number: string;
    due_date: string;
    total: number;
}

export interface AlertsData {
    counts: AlertCounts;
    expired_batches: AlertBatch[];
    near_expiry_batches: AlertBatch[];
    low_stock: AlertProduct[];
    out_of_stock: AlertProduct[];
    payables_due?: AlertPayable[];
}
