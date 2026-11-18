import type { Perm, User } from '@/types/auth.types';

export interface MenuItem {
    label: string;
    /** material-symbols icon name */
    icon: string;
    to: string;
    /** Hidden unless the user has this flag. The server checks it again. */
    perm?: Perm;
}

export interface MenuSection {
    title: string;
    items: MenuItem[];
}

// Pages and permissions follow PRD §3 and §8.
export const MENU: MenuSection[] = [
    {
        title: 'Kasir',
        items: [
            { label: 'Kasir (POS)', icon: 'point_of_sale', to: '/app' },
            { label: 'Pesanan Tertunda', icon: 'pending_actions', to: '/held' },
            { label: 'Shift', icon: 'schedule', to: '/shifts' },
        ],
    },
    {
        title: 'Penjualan',
        items: [
            { label: 'Transaksi & Laporan', icon: 'receipt_long', to: '/transactions', perm: 'perm_transactions' },
            { label: 'Retur Penjualan', icon: 'assignment_return', to: '/sales-returns', perm: 'perm_transactions' },
            { label: 'Pelanggan', icon: 'group', to: '/customers' },
        ],
    },
    {
        title: 'Inventori',
        items: [
            { label: 'Produk', icon: 'medication', to: '/products', perm: 'perm_products' },
            { label: 'Kategori', icon: 'category', to: '/categories', perm: 'perm_categories' },
            { label: 'Stok per Batch', icon: 'layers', to: '/batches', perm: 'perm_products' },
            { label: 'Stok Opname', icon: 'fact_check', to: '/stock-opnames', perm: 'perm_products' },
        ],
    },
    {
        title: 'Pembelian',
        items: [
            { label: 'Penerimaan Barang', icon: 'local_shipping', to: '/purchases', perm: 'perm_purchases' },
            { label: 'Hutang', icon: 'account_balance_wallet', to: '/payables', perm: 'perm_purchases' },
            { label: 'Supplier', icon: 'storefront', to: '/suppliers', perm: 'perm_purchases' },
        ],
    },
    {
        title: 'Sistem',
        items: [
            { label: 'User', icon: 'manage_accounts', to: '/users', perm: 'perm_users' },
            { label: 'Pengaturan', icon: 'settings', to: '/settings', perm: 'perm_settings' },
            { label: 'Audit Log', icon: 'history', to: '/audit-logs', perm: 'perm_settings' },
        ],
    },
];

/** Sections with only the items this user may open; empty sections are dropped. */
export const menuForUser = (user: User | null): MenuSection[] =>
    MENU.map((section) => ({ ...section, items: section.items.filter((item) => !item.perm || user?.[item.perm]) })).filter((section) => section.items.length > 0);
