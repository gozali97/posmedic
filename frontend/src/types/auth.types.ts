/** Permission flags on users (PRD §3). */
export const PERMISSIONS = [
    { key: 'perm_products', label: 'Kelola Produk & Stok', description: 'Produk & satuan, stok per batch, penyesuaian, stok opname' },
    { key: 'perm_purchases', label: 'Kelola Pembelian', description: 'Supplier, penerimaan barang, hutang' },
    { key: 'perm_categories', label: 'Kelola Kategori', description: 'Tambah, ubah, hapus kategori' },
    { key: 'perm_transactions', label: 'Kelola Transaksi', description: 'Laporan, daftar transaksi, void, retur, semua shift' },
    { key: 'perm_users', label: 'Kelola User & Izin', description: 'Tambah, ubah, hapus user' },
    { key: 'perm_settings', label: 'Kelola Pengaturan', description: 'Pengaturan toko & till, audit log' },
] as const;

export type Perm = (typeof PERMISSIONS)[number]['key'];

/** Mirrors backend models.User (never contains the password hash). */
export interface User extends Record<Perm, boolean> {
    id: number;
    username: string;
    fullname: string;
    is_active: boolean;
    must_change_password: boolean;
    last_login_at: string | null;
    last_logout_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginData {
    access_token: string;
    refresh_token: string;
    token_type: 'Bearer';
    expires_in: number;
    user: User;
}

export interface ChangePasswordRequest {
    old_password: string;
    new_password: string;
}

/** User id 1 is the built-in admin: cannot be deleted or have permissions revoked. */
export const ADMIN_USER_ID = 1;
