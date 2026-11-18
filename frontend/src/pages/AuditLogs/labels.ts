import type { BadgeColor } from '@/components/ui/Badge';

/** Known audit actions (F19). Unknown values from newer backend code fall back to the raw string. */
export const ACTION_LABELS: Record<string, { label: string; color: BadgeColor }> = {
    login: { label: 'Login', color: 'success' },
    login_failed: { label: 'Login gagal', color: 'danger' },
    logout: { label: 'Logout', color: 'gray' },
    change_password: { label: 'Ganti password', color: 'warning' },
    update_profile: { label: 'Ubah profil', color: 'info' },
    create: { label: 'Tambah', color: 'primary' },
    update: { label: 'Ubah', color: 'info' },
    delete: { label: 'Hapus', color: 'danger' },
    adjust: { label: 'Penyesuaian stok', color: 'orange' },
    post: { label: 'Posting', color: 'purple' },
    mark_paid: { label: 'Tandai lunas', color: 'success' },
    open: { label: 'Buka', color: 'primary' },
    close: { label: 'Tutup', color: 'gray' },
    void: { label: 'Void', color: 'danger' },
    return: { label: 'Retur', color: 'orange' },
    hold: { label: 'Tahan pesanan', color: 'gray' },
    pay: { label: 'Bayar pesanan', color: 'success' },
};

export const ENTITY_LABELS: Record<string, string> = {
    user: 'User',
    till: 'Till',
    store_settings: 'Pengaturan toko',
    category: 'Kategori',
    product: 'Produk',
    product_batch: 'Batch',
    stock_opname: 'Stok opname',
    purchase: 'Penerimaan barang',
    supplier: 'Supplier',
    customer: 'Pelanggan',
    shift: 'Shift',
    transaction: 'Transaksi',
    sales_return: 'Retur penjualan',
};

export const actionLabel = (action: string) => ACTION_LABELS[action] ?? { label: action, color: 'gray' as BadgeColor };
export const entityLabel = (entity: string) => ENTITY_LABELS[entity] ?? entity;
