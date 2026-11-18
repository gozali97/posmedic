/** Mirrors backend models.StoreSetting. */
export interface StoreSetting {
    store_name: string;
    address_one: string;
    address_two: string | null;
    contact: string;
    sia_number: string;
    pharmacist_name: string;
    sipa_number: string;
    tax_number: string | null;
    is_pkp: boolean;
    ppn_rate: number;
    currency_symbol: string;
    quick_billing: boolean;
    expiry_warning_days: number;
    receipt_footer: string | null;
    logo: string | null;
    created_at: string;
    updated_at: string;
}

export interface Till {
    id: number;
    number: number;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface TillPayload {
    number: number;
    name: string;
}
