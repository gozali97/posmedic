# PRD — POS Apotek (clone PharmaSpot, Go + React 19)

|              |                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------- |
| Referensi    | https://github.com/drkNsubuga/PharmaSpot (v1.5.3, Electron + Express + NeDB)                 |
| Target stack | Backend Go 1.24 + Gin + GORM + PostgreSQL · Frontend React 19 + Vite + TypeScript + Tailwind |
| Database     | PostgreSQL (satu-satunya DB; tanpa Redis/MySQL)                                              |
| Login        | Username + password, wajib untuk semua halaman & endpoint kecuali login                      |
| Konvensi     | Mengikuti `fullstack-ipin/backend` dan `fullstack-ipin/frontend` (lihat §9)                  |
| Status       | Draft v4 — 2026-11-18                                                                        |

---

## 1. Latar belakang

PharmaSpot adalah aplikasi POS apotek desktop (Electron). Fiturnya cukup lengkap untuk apotek kecil: kasir, barcode, tab/pesanan tertunda, struk, stok minimum, peringatan kedaluwarsa, multi-till, laporan transaksi. Kelemahannya serius:

1. API tanpa autentikasi; CORS `*`; hash password bocor via `/users/all`.
2. Bayar pesanan tertunda (`PUT /new`) tidak mengurangi stok.
3. Update stok tidak atomik → dua till bisa oversell.
4. Barcode di-`parseInt` → leading zero hilang, barcode alfanumerik gagal.
5. Angka disimpan sebagai string, tidak ada harga beli (klaim "profit" tidak didukung data).
6. Hapus transaksi tidak mengembalikan stok; tidak ada void/retur/audit.
7. NeDB memuat seluruh koleksi ke memori; UI memuat semua produk & transaksi.

Produk ini mereplikasi fitur PharmaSpot sebagai **aplikasi web** (server pusat + browser di tiap till), memperbaiki poin 1–6, dan menambah kebutuhan apotek di Indonesia yang tidak ada di PharmaSpot: satuan bertingkat, batch + ED per batch (FEFO), penerimaan barang dari PBF + hutang, shift kasir, retur penjualan, stok opname, harga termasuk PPN, golongan obat, nama generik, dan audit log.

## 2. Tujuan & non-tujuan

**Tujuan**

- Paritas fitur dengan PharmaSpot (lihat §4).
- Keamanan: semua endpoint terautentikasi, izin dicek di server.
- Integritas stok & uang: checkout dalam satu transaksi DB, angka pakai tipe numerik.
- Multi-till native (banyak browser ke satu server).
- Operasional apotek: stok dan ED yang cocok dengan kondisi fisik (penerimaan per batch, satuan bertingkat, FEFO, opname), uang laci yang bisa dicocokkan per shift, dan jejak perubahan (audit log).

**Non-tujuan (fase 1)**

- Resep lengkap (data dokter, salinan resep, etiket, racikan) dan laporan SIPNAP — fase 2. Golongan obat, no. resep, dan pergerakan stok per batch sudah disimpan sejak fase 1, jadi fase 2 tidak perlu ubah skema inti.
- Purchase order ke PBF dan retur ke PBF — fase 2.
- Integrasi BPJS/e-faktur/payment gateway.
- Aplikasi desktop/offline. _Lebih ringan: tetap web; offline hanya jika ada kebutuhan nyata._
- Backup/restore dari UI. Diganti `pg_dump` terjadwal di server (ops).

## 3. Pengguna & izin

Tidak ada role, hanya flag izin per user (sama seperti PharmaSpot), tapi **dicek di middleware server**, bukan cuma menyembunyikan tombol.

| Flag                | Label                | Akses                                                          |
| ------------------- | -------------------- | -------------------------------------------------------------- |
| `perm_products`     | Kelola Produk & Stok | CRUD produk & satuan, stok per batch, penyesuaian, stok opname |
| `perm_purchases`    | Kelola Pembelian     | Supplier, penerimaan barang, hutang                            |
| `perm_categories`   | Kelola Kategori      | CRUD kategori                                                  |
| `perm_transactions` | Kelola Transaksi     | Laporan, daftar transaksi, void, retur, lihat semua shift      |
| `perm_users`        | Kelola User & Izin   | CRUD user                                                      |
| `perm_settings`     | Kelola Pengaturan    | Pengaturan toko & till, audit log                              |

Semua user yang login boleh: buka/tutup shift sendiri, berjualan (POS), hold/bayar pesanan, kelola pelanggan, ubah profil & password sendiri.

User `id = 1` adalah admin bawaan (semua izin, tidak bisa dihapus/dicabut izinnya). Di-seed saat startup jika belum ada: `admin` / password dari env `ADMIN_DEFAULT_PASSWORD`; wajib ganti saat login pertama (`must_change_password`).

## 4. Fitur (fase 1)

### F1. Login & autentikasi

- Semua halaman wajib login; hanya `/login` yang publik. Belum login → redirect ke `/login`, setelah login kembali ke halaman asal.
- Form login: **username** + **password** (tanpa email). Keduanya wajib. Username disimpan & dicocokkan lowercase, tanpa spasi.
- `POST /api/auth/login` body `{username, password}`; password dicek dengan bcrypt.
  - Gagal → `401` "Username atau password salah" (pesan sama untuk username tidak ada dan password salah).
  - User nonaktif → `403` "Akun dinonaktifkan".
  - Lebih dari 10 percobaan/menit/IP → `429`.
  - Sukses → `200`, `data: {access_token, refresh_token, token_type: "Bearer", expires_in, user: {id, username, fullname, perm_*, must_change_password}}`. Server mengisi `token_issued_at` dan `last_login_at`.
- Satu sesi per user: login baru membatalkan token lama (cek `token_issued_at`, pola acuan).
- `must_change_password = true` → frontend memaksa ke `/profile` sampai password diganti.
- Logout (`POST /auth/logout`) mengisi `last_logout_at` dan mengosongkan `token_issued_at`; frontend menghapus token di `localStorage`.
- `GET /auth/me`, `POST /auth/refresh-token`.
- Ganti password sendiri: wajib isi password lama, password baru minimal 8 karakter.
- Token di frontend: `localStorage` key `pos_access_token`, `pos_refresh_token`, `pos_user`.

### F2. Produk & satuan

- Field: nama dagang, **nama generik/zat aktif** (mis. "Paracetamol 500 mg"), kategori, **golongan obat**, **lokasi rak** (mis. "A-03"), stok minimum (satuan dasar), `track_stock`, gambar (jpg/jpeg/png/webp, maks 2 MB).
- Golongan (`drug_class`): `bebas`, `bebas_terbatas`, `keras`, `narkotika`, `psikotropika`, `non_obat` (alkes, kosmetik, jasa). Tampil sebagai badge berwarna (hijau, biru, merah, dst.) di grid POS dan daftar produk.
- **Satuan bertingkat:** satu produk punya ≥ 1 satuan. Satuan dasar = satuan terkecil (mis. tablet, `conversion_qty = 1`, tepat satu per produk). Satuan lain kelipatan satuan dasar (strip = 10, box = 100). Tiap satuan punya harga jual (sudah termasuk PPN) dan barcode sendiri (opsional). Satuan diisi sebagai tabel di form produk.
- **Stok selalu dalam satuan dasar** dan dihitung dari batch: `stok = Σ product_batches.quantity`. Tampilan stok dipecah, mis. "2 box 3 strip 4 tablet (234 tablet)".
- Stok tidak bisa diubah dari form produk. Stok hanya berubah lewat penerimaan (F6), penyesuaian/opname (F8), penjualan, void, dan retur.
- `track_stock = false` untuk jasa (embalase, biaya racik): tanpa batch, tanpa cek stok, HPP 0.
- Daftar produk paginated; cari nama dagang, nama generik, barcode satuan; filter kategori, golongan, status stok, status ED.
- Label stok: **Habis** (stok jual = 0), **Menipis** (stok ≤ `min_stock`), **Aman**. Label ED diambil dari batch berstok dengan ED terdekat.
- Cetak barcode per satuan (render di browser, `react-barcode`); export Excel (`excelize`).
- Produk dengan stok > 0 tidak bisa dihapus. Hapus = soft delete; barcode produk terhapus boleh dipakai ulang (partial unique index, §6).

### F3. Kategori

CRUD nama kategori. Tidak bisa dihapus jika masih dipakai produk (FK `ON DELETE RESTRICT`).

### F4. Pelanggan

CRUD: nama, telepon, email, alamat. Pencarian nama/telepon. Pelanggan juga dipakai sebagai data pasien untuk penjualan narkotika/psikotropika.

### F5. Supplier (PBF)

CRUD: nama, alamat, telepon, nama sales/kontak, NPWP, termin pembayaran default (hari, default 30). Tidak bisa dihapus jika sudah punya penerimaan (soft delete).

### F6. Penerimaan barang & hutang

- Diinput dari faktur PBF: supplier, no. faktur (unik per supplier), tanggal faktur, jatuh tempo (default = tanggal faktur + termin supplier), catatan.
- Item: produk, satuan (mis. box), qty, harga beli per satuan (setelah diskon faktur, termasuk PPN), no. batch, ED. Satu produk boleh beberapa baris dengan batch berbeda. Item dengan ED ≤ hari ini ditolak.
- Simpan = posting, dalam satu transaksi DB:
  - Tiap baris menambah `product_batches`. Produk + no. batch + ED yang sama digabung ke batch yang ada; `cost_price` batch jadi rata-rata tertimbang.
  - `cost_price` per satuan dasar = harga beli ÷ `conversion_qty`, dibulatkan ke atas.
  - Tulis `stock_movements` tipe `purchase` dan audit log.
- Penerimaan yang sudah diposting tidak bisa diedit atau dihapus. Salah input dikoreksi lewat penyesuaian stok (F8).
- **Hutang:** status `unpaid`/`paid`. Daftar hutang dengan filter supplier dan jatuh tempo (lewat, ≤ 7 hari). Tandai lunas dengan tanggal bayar dan catatan. Badge "jatuh tempo" di header untuk user `perm_purchases`.

### F7. Batch & kedaluwarsa

- Tiap batch: produk, no. batch, ED, qty (satuan dasar), harga beli per satuan dasar, asal (`purchase`/`opname`).
- Halaman stok per batch: filter produk, rak, status ED (kedaluwarsa, ≤ 30 hari, ≤ `expiry_warning_days`), hanya yang berstok. Export Excel.
- Penjualan memakai **FEFO** otomatis (BR8). Kasir tidak memilih batch.
- Batch kedaluwarsa tidak bisa dijual dan dikeluarkan lewat penyesuaian alasan `expired` (pemusnahan).

### F8. Penyesuaian & stok opname

- **Penyesuaian per batch:** qty +/−, alasan wajib (`expired`, `damaged`, `lost`, `correction`) + catatan.
- **Stok opname:**
  1. Buat sesi (draft), opsional difilter kategori atau rak. Sistem mengisi daftar batch berstok.
  2. User mengisi qty fisik per batch. Barang fisik yang tidak tercatat ditambah sebagai batch baru (no. batch, ED, harga beli).
  3. Posting: `selisih = qty fisik − qty sistem saat posting`, ditulis sebagai `stock_movements` tipe `opname`.
  - Opname dilakukan saat toko tutup atau per rak yang sedang tidak dilayani, karena selisih dihitung terhadap stok saat posting.
- **Saldo awal** saat go-live diinput lewat opname pertama.

### F9. Shift kasir

- Sebelum transaksi pertama, kasir membuka shift di till-nya dengan modal awal tunai.
- Satu user maksimal satu shift terbuka; satu till maksimal satu shift terbuka.
- Pembayaran, void, dan retur tercatat ke shift aktif pelakunya. Pesanan tertunda baru terikat shift saat dibayar.
- Tutup shift: sistem menampilkan rekap per metode bayar (penjualan, void, retur) dan **kas seharusnya** (BR12). Kasir mengisi kas fisik; selisih disimpan. Rekap bisa dicetak.
- Shift yang sudah ditutup tidak bisa dibuka ulang. User biasa hanya melihat shift sendiri; `perm_transactions` melihat semua.

### F10. POS / Kasir

- Tanpa shift terbuka, layar POS menampilkan form buka shift.
- Grid produk: gambar, nama dagang, nama generik, badge golongan, rak, stok, harga satuan dasar. Filter kategori; cari nama dagang, nama generik, atau barcode (mis. "paracetamol" menampilkan semua merek yang mengandungnya).
- Scan barcode → `GET /products/barcode/:code` mengembalikan produk + satuan yang cocok (barcode box → baris satuan box). Tolak: tidak ditemukan, stok jual kurang.
- Klik produk → masuk keranjang dengan satuan dasar. Produk + satuan yang sama menambah qty.
- Baris keranjang: produk, satuan (dropdown, bisa diganti), qty ±, harga satuan, subtotal, hapus. Qty × konversi dibatasi stok jual (Σ batch belum ED).
- Golongan `keras`: konfirmasi "Obat keras, wajib resep dokter" dan isian no./keterangan resep (opsional).
- Golongan `narkotika`/`psikotropika`: wajib pilih pelanggan (pasien) dan isi no. resep; tanpa itu transaksi tidak bisa dibayar (BR4).
- Diskon nominal per transaksi (direset ke 0 jika ≥ subtotal).
- Harga sudah termasuk PPN: `total = subtotal − discount` (BR9).
- Tombol: **Cetak (preview)**, **Batal**, **Tahan**, **Bayar**.
- `quick_billing` aktif → Bayar langsung tanpa modal pembayaran (dibayar pas, tunai).

### F11. Pembayaran

- Metode: **Tunai**, **Kartu/Debit** (+ catatan info kartu), **QRIS/Transfer** (+ nomor referensi).
- Keypad nominal; `change = paid − total`; tombol konfirmasi aktif hanya jika `paid ≥ total`. Non-tunai: `paid = total`.
- Tidak ada pembayaran parsial/split.

### F12. Pesanan tertunda

- **Tahan** butuh nomor referensi **atau** pelanggan → status `held`.
- Dua daftar: **Open Tab** (ada `ref_number`) dan **Pesanan Pelanggan** (ada `customer_id`, tanpa ref). Cari by ref/nama pelanggan.
- Aksi: muat ke keranjang, bayar, hapus.
- Membayar pesanan tertunda **mengurangi stok** (fix bug PharmaSpot).
- Pesanan tertunda tidak me-reserve stok. Stok, harga, dan alokasi batch dihitung ulang saat dibayar.

### F13. Struk

- Isi: logo, nama toko, alamat 1 & 2, telepon, no. SIA, apoteker penanggung jawab + no. SIPA, no. invoice, no. ref, pelanggan, kasir, tanggal, item (nama, qty + satuan, harga), subtotal, diskon, total, dibayar, kembalian, metode, footer.
- Jika toko PKP (`is_pkp`): tampilkan NPWP, "DPP", dan "PPN 11% (termasuk)".
- Struk retur: no. retur, no. invoice asal, item & qty diretur, total refund, metode refund.
- Cetak via `window.print()` + CSS `@media print` ukuran 58/80 mm. _Lebih ringan dari print-js; ESC/POS langsung baru jika printer thermal tak bisa via browser._
- Cetak ulang dari daftar transaksi.

### F14. Retur penjualan

- Dibuat dari detail transaksi lunas: pilih item dan qty yang diretur (≤ qty terjual − sudah diretur), alasan wajib, metode refund, dan per item pilihan **kembali ke stok** (ya/tidak).
- Butuh `perm_transactions` dan shift terbuka (refund tunai keluar dari laci shift aktif).
- Refund dihitung server (BR10). Item "kembali ke stok" masuk lagi ke batch asal; item tidak kembali ke stok dicatat sebagai `damaged`.
- Bisa beberapa kali retur untuk satu transaksi sampai semua qty habis.
- Nomor retur `RTR/{YYYYMMDD}/{till}/{seq}`; cetak struk retur.

### F15. Transaksi & laporan

- Filter: till, kasir, shift, status (lunas/tertunda/void), rentang tanggal (preset: Hari ini, Kemarin, 7 hari, 30 hari, Bulan ini, Bulan lalu).
- Kartu ringkasan: Penjualan Bruto, Retur, Penjualan Bersih, HPP, **Laba Kotor** (= penjualan bersih − HPP, BR11), Jumlah Transaksi, Item Terjual.
- Jika PKP: total DPP dan PPN keluaran per periode.
- Tabel produk terjual: nama, terjual (satuan dasar), stok tersedia, penjualan bersih, HPP, laba.
- Tabel transaksi (paginated): invoice, tanggal, total, dibayar, kembalian, metode, till, kasir, status retur, lihat struk.
- **Void** transaksi lunas (butuh `perm_transactions` + alasan): hanya selama shift transaksi itu masih terbuka dan belum ada retur (BR7). Setelah itu pakai retur.
- Transaksi lunas tidak pernah dihapus fisik. Export Excel.

### F16. Peringatan

- Saat masuk POS: toast jumlah batch kedaluwarsa yang masih berstok dan jumlah batch dengan ED ≤ `expiry_warning_days`.
- `GET /alerts`: batch kedaluwarsa, batch hampir ED, stok menipis, stok habis, dan hutang jatuh tempo (hanya untuk `perm_purchases`). Badge di header.

### F17. Pengaturan

- Toko (1 baris): nama toko, alamat 1, alamat 2, kontak, no. SIA, nama apoteker penanggung jawab, no. SIPA, NPWP, `is_pkp`, tarif PPN (default 11%), simbol mata uang (default `Rp`), `quick_billing`, `expiry_warning_days` (default 90), footer struk, logo.
- Till: CRUD daftar till (nomor, nama). Browser memilih till sekali, disimpan di `localStorage` (`pos_till_id`). Pengganti `ip/till/mac` di electron-store.
- First run: jika pengaturan toko belum ada, admin diarahkan ke halaman pengaturan.

### F18. User

- CRUD user: nama lengkap, username (unik), password (kosong saat edit = tidak diubah — fix bug PharmaSpot), 6 flag izin, aktif/nonaktif.
- Respons tidak pernah memuat hash password.

### F19. Audit log

- Dicatat: login sukses/gagal, buat/ubah/hapus produk (termasuk harga satuan), penyesuaian stok, posting opname, posting penerimaan, tandai hutang lunas, void, retur, buka/tutup shift, ubah user & izin, ubah pengaturan.
- Field: waktu, user, aksi, entitas + id, data sebelum/sesudah (JSONB, tanpa password/hash/token), IP.
- Ditulis dalam transaksi DB yang sama dengan perubahannya (BR13). Hanya bisa dibaca, tidak bisa diubah/dihapus dari aplikasi.
- Halaman audit log (butuh `perm_settings`): filter user, entitas, aksi, tanggal.

## 5. Aturan bisnis kritis

| #    | Aturan                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR1  | Checkout (`POST /transactions` status `paid`, `POST /transactions/:id/pay`) berjalan dalam **satu `db.Transaction`**: kunci baris `product_batches` dengan `SELECT ... FOR UPDATE` urut `id` (hindari deadlock), validasi (BR4), alokasi FEFO (BR8), kurangi batch, tulis `transaction_item_batches`, `stock_movements`, audit log, dan nomor invoice. Gagal satu → rollback semua. Pola yang sama dipakai untuk penerimaan, penyesuaian, posting opname, void, dan retur. |
| BR2  | Harga, total, DPP/PPN, HPP, dan refund dihitung ulang **di server** dari DB. Nilai dari client hanya untuk tampilan dan diabaikan.                                                                                                                                                                                                                                                                                                                                         |
| BR3  | Snapshot saat transaksi: `product_name`, `unit_name`, `conversion_qty`, `drug_class`, `price` di `transaction_items`; `cost_price` per batch di `transaction_item_batches`. Laporan dan struk tidak berubah saat master diubah.                                                                                                                                                                                                                                            |
| BR4  | Tidak bisa dijual: batch kedaluwarsa (ED ≤ hari ini); `qty × conversion_qty` > stok jual (Σ batch belum ED) jika `track_stock`; golongan `narkotika`/`psikotropika` tanpa `customer_id` dan `prescription_number`.                                                                                                                                                                                                                                                         |
| BR5  | Uang dalam **rupiah utuh**: kolom `BIGINT`, Go `int64`, JSON integer. Qty `INTEGER`; stok dan pergerakan stok selalu dalam satuan dasar. Tidak ada float di perhitungan uang. Pembulatan half-up.                                                                                                                                                                                                                                                                          |
| BR6  | Nomor dokumen dibuat server dalam transaksi yang sama lewat `document_sequences` (kunci baris): `INV/{YYYYMMDD}/{till}/{seq}`, `RTR/{YYYYMMDD}/{till}/{seq}`, `OPN/{YYYYMMDD}/{seq}`; `seq` 4 digit, reset harian. Pesanan `held` belum punya nomor invoice; nomor diberikan saat dibayar.                                                                                                                                                                                 |
| BR7  | Void hanya untuk transaksi `paid`, selama shift pembayarannya masih `open` dan belum ada retur. Stok kembali ke batch asal (`transaction_item_batches`). Pesanan `held` boleh dihapus fisik; transaksi `paid`/`void` tidak pernah dihapus.                                                                                                                                                                                                                                 |
| BR8  | **FEFO**: stok diambil dari batch berstok dengan ED terdekat yang masih > hari ini; ED sama → batch yang lebih dulu dibuat. Satu baris keranjang boleh terpecah ke beberapa batch.                                                                                                                                                                                                                                                                                         |
| BR9  | **Harga jual sudah termasuk PPN.** `subtotal = Σ price × qty`, `total = subtotal − discount`. Jika `is_pkp`: `dpp = round(total × 100 / (100 + ppn_rate))`, `ppn = total − dpp`; jika tidak: `dpp = total`, `ppn = 0`. Tarif disnapshot di `transactions.ppn_rate`.                                                                                                                                                                                                        |
| BR10 | Diskon transaksi dibagi ke tiap baris secara proporsional saat checkout (`discount_share`, sisa pembulatan ke baris terakhir). Retur dihitung per satuan dasar: `refund = round((line_total − discount_share) × qty_retur / qty_dasar_terjual)`. Retur yang menghabiskan sisa qty baris mengambil sisa nominalnya, jadi total refund tidak pernah melebihi nilai bersih baris.                                                                                             |
| BR11 | HPP = Σ `transaction_item_batches.quantity × cost_price`. Laba kotor = (penjualan − refund) − (HPP terjual − HPP item retur yang kembali ke stok). Item retur yang tidak kembali ke stok tetap dihitung HPP (kerugian). Transaksi `void` tidak dihitung.                                                                                                                                                                                                                   |
| BR12 | Kas seharusnya saat tutup shift = modal awal + penjualan tunai − refund tunai; transaksi `void` tidak dihitung. `cash_difference = counted_cash − expected_cash`.                                                                                                                                                                                                                                                                                                          |
| BR13 | Audit log ditulis dalam transaksi DB yang sama dengan perubahannya. Tidak ada endpoint ubah/hapus audit log. `before`/`after` tidak memuat password, hash, atau token.                                                                                                                                                                                                                                                                                                     |
| BR14 | Stok batch tidak boleh negatif (`CHECK (quantity >= 0)`); penyesuaian atau opname yang membuat negatif ditolak.                                                                                                                                                                                                                                                                                                                                                            |

## 6. Model data (PostgreSQL)

Semua tabel punya `created_at`/`updated_at` kecuali disebut lain. Uang `BIGINT` (BR5), qty `INT` satuan dasar.

```text
-- Akses
users(id, username UNIQUE, fullname, password_hash, perm_products, perm_purchases, perm_categories,
      perm_transactions, perm_users, perm_settings bool, is_active bool, must_change_password bool,
      token_issued_at NULL, last_login_at NULL, last_logout_at NULL)

-- Master
categories(id, name UNIQUE)
products(id, category_id FK RESTRICT NULL, name, generic_name NULL,
         drug_class CHECK IN ('bebas','bebas_terbatas','keras','narkotika','psikotropika','non_obat'),
         shelf_location NULL, min_stock INT DEFAULT 0, track_stock bool DEFAULT true, image NULL, deleted_at NULL)
product_units(id, product_id FK CASCADE, name, conversion_qty INT CHECK > 0, price BIGINT CHECK >= 0,
              barcode VARCHAR(64) NULL, is_base bool, deleted_at NULL)
customers(id, name, phone NULL, email NULL, address NULL)
suppliers(id, name, address NULL, phone NULL, contact_name NULL, tax_number NULL,
          payment_term_days INT DEFAULT 30, deleted_at NULL)
tills(id, number INT UNIQUE, name)

-- Stok
product_batches(id, product_id FK, batch_number, expiration_date DATE, quantity INT CHECK >= 0,
                cost_price BIGINT, source CHECK IN ('purchase','opname'),
                UNIQUE(product_id, batch_number, expiration_date))
stock_movements(id, product_id FK, product_batch_id FK NULL,
                type CHECK IN ('purchase','sale','void','return','adjustment','opname'),
                reason NULL CHECK IN ('expired','damaged','lost','correction'),
                quantity INT,             -- +/-
                stock_after INT,          -- qty batch setelah gerak
                reference_type NULL, reference_id NULL, note NULL, user_id FK, created_at)
stock_opnames(id, opname_number UNIQUE, status CHECK IN ('draft','posted'), category_id NULL,
              shelf_location NULL, note NULL, user_id FK, posted_by FK NULL, posted_at NULL)
stock_opname_items(id, stock_opname_id FK CASCADE, product_id FK, product_batch_id FK NULL,  -- NULL = batch baru
                   batch_number, expiration_date, cost_price BIGINT, system_quantity INT NULL,
                   counted_quantity INT NULL, difference INT NULL)

-- Pembelian
purchases(id, supplier_id FK, invoice_number, invoice_date DATE, due_date DATE, total BIGINT,
          payment_status CHECK IN ('unpaid','paid'), paid_at NULL, payment_note NULL, note NULL,
          user_id FK, UNIQUE(supplier_id, invoice_number))
purchase_items(id, purchase_id FK CASCADE, product_id FK, product_unit_id FK, unit_name, conversion_qty INT,
               quantity INT CHECK > 0, unit_cost BIGINT, line_total BIGINT, batch_number, expiration_date DATE,
               product_batch_id FK)

-- Penjualan
shifts(id, user_id FK, till_id FK, status CHECK IN ('open','closed'), opening_cash BIGINT,
       expected_cash BIGINT NULL, counted_cash BIGINT NULL, cash_difference BIGINT NULL,
       note NULL, opened_at, closed_at NULL)
transactions(id, invoice_number UNIQUE NULL, ref_number NULL, customer_id FK NULL, till_id FK,
             created_by FK, paid_by FK NULL, shift_id FK NULL,
             status CHECK IN ('held','paid','void'),
             subtotal, discount, total, dpp, ppn BIGINT, ppn_rate NUMERIC(5,2), paid, change BIGINT,
             payment_method NULL CHECK IN ('cash','card','qris'), payment_info NULL,
             prescription_number NULL, prescription_note NULL,
             void_reason NULL, voided_by FK NULL, voided_at NULL, paid_at NULL)
transaction_items(id, transaction_id FK CASCADE, product_id FK, product_unit_id FK, product_name, unit_name,
                  conversion_qty INT, drug_class, price BIGINT, quantity INT CHECK > 0, line_total BIGINT,
                  discount_share BIGINT DEFAULT 0, returned_base_quantity INT DEFAULT 0)
transaction_item_batches(id, transaction_item_id FK CASCADE, product_batch_id FK, quantity INT CHECK > 0,
                         cost_price BIGINT, returned_quantity INT DEFAULT 0)
sales_returns(id, return_number UNIQUE, transaction_id FK, user_id FK, shift_id FK, till_id FK,
              total_refund BIGINT, refund_method CHECK IN ('cash','card','qris'), reason)
sales_return_items(id, sales_return_id FK CASCADE, transaction_item_id FK, base_quantity INT CHECK > 0,
                   refund_amount BIGINT, cost_amount BIGINT, restock bool)

-- Sistem
document_sequences(prefix, seq_date DATE, till_id INT DEFAULT 0, last_value INT,
                   PRIMARY KEY(prefix, seq_date, till_id))
audit_logs(id BIGSERIAL, user_id FK NULL, action, entity_type, entity_id NULL,
           before JSONB NULL, after JSONB NULL, ip NULL, created_at)
store_settings(id = 1, store_name, address_one, address_two NULL, contact, sia_number, pharmacist_name,
               sipa_number, tax_number NULL, is_pkp bool, ppn_rate NUMERIC(5,2) DEFAULT 11,
               currency_symbol DEFAULT 'Rp', quick_billing bool, expiry_warning_days INT DEFAULT 90,
               receipt_footer NULL, logo NULL)
```

Index & constraint tambahan:

- `product_units`: partial unique `(barcode) WHERE barcode IS NOT NULL AND deleted_at IS NULL`; partial unique `(product_id) WHERE is_base AND deleted_at IS NULL`; partial unique `(product_id, name) WHERE deleted_at IS NULL`. Soft delete produk ikut men-soft-delete satuannya, jadi barcode bisa dipakai ulang.
- `shifts`: partial unique `(user_id) WHERE status = 'open'` dan `(till_id) WHERE status = 'open'`.
- Trigram (`CREATE EXTENSION IF NOT EXISTS pg_trgm`) di `products(name)` dan `products(generic_name)`.
- `product_batches(product_id, expiration_date) WHERE quantity > 0`; `stock_movements(product_id, created_at)`.
- `transactions(status, paid_at)`, `transactions(shift_id)`, `transactions(paid_by)`, `transactions(till_id)`.
- `purchases(payment_status, due_date)`; `audit_logs(created_at)`, `audit_logs(entity_type, entity_id)`, `audit_logs(user_id, created_at)`.

Skema dibuat dengan `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... IF NOT EXISTS` di `config.ConnectDatabase()` (konvensi acuan: tanpa tool migrasi).

## 7. API

Prefix `/api`. Semua kecuali `POST /auth/login` dan `POST /auth/refresh-token` memakai `middleware.AuthMiddleware()`. Kolom "Izin" = middleware `RequirePerm("perm_x")`.

Envelope (wajib, sesuai acuan):

```json
{ "status": "success" | "failed", "code": 200, "message": "Data produk berhasil diambil", "data": {} }
```

List: `data: { "<plural>": [...], "pagination": {current_page, per_page, total, total_pages, from, to}, "filters": {...} }`. Query `page` (default 1), `per_page` (default 10, maks 100), `search`.

| Method              | Path                            | Izin              | Keterangan                                                                                                                                                                           |
| ------------------- | ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST                | `/auth/login`                   | –                 | F1                                                                                                                                                                                   |
| POST                | `/auth/refresh-token`           | –                 |                                                                                                                                                                                      |
| GET                 | `/auth/me`                      | login             |                                                                                                                                                                                      |
| POST                | `/auth/logout`                  | login             |                                                                                                                                                                                      |
| PUT                 | `/auth/password`                | login             | `{old_password, new_password}`                                                                                                                                                       |
| PUT                 | `/auth/profile`                 | login             | ubah nama sendiri                                                                                                                                                                    |
| GET                 | `/products`                     | login             | paginated; `search` (nama dagang, generik, barcode), `category_id`, `drug_class`, `stock_status`, `expiry_status`                                                                    |
| GET                 | `/products/barcode/:code`       | login             | produk + satuan yang cocok (scanner)                                                                                                                                                 |
| GET                 | `/products/export`              | perm_products     | xlsx                                                                                                                                                                                 |
| GET                 | `/products/:id`                 | login             | + satuan + ringkasan batch                                                                                                                                                           |
| POST                | `/products`                     | perm_products     | multipart: field produk, `units` (JSON array), `image`                                                                                                                               |
| PUT                 | `/products/:id`                 | perm_products     | multipart, `remove_image=1`                                                                                                                                                          |
| DELETE              | `/products/:id`                 | perm_products     | soft delete; tolak jika stok > 0                                                                                                                                                     |
| GET                 | `/products/:id/stock-movements` | perm_products     | paginated                                                                                                                                                                            |
| GET                 | `/batches`                      | perm_products     | paginated; `product_id`, `shelf_location`, `expiry_status`, `in_stock`                                                                                                               |
| GET                 | `/batches/export`               | perm_products     | xlsx                                                                                                                                                                                 |
| POST                | `/batches/:id/adjustment`       | perm_products     | `{quantity(+/-), reason, note}`                                                                                                                                                      |
| GET                 | `/stock-opnames`                | perm_products     | paginated                                                                                                                                                                            |
| POST                | `/stock-opnames`                | perm_products     | buat draft `{category_id?, shelf_location?, note}`                                                                                                                                   |
| GET                 | `/stock-opnames/:id`            | perm_products     | + item                                                                                                                                                                               |
| PUT                 | `/stock-opnames/:id/items`      | perm_products     | simpan qty fisik + batch baru (draft)                                                                                                                                                |
| POST                | `/stock-opnames/:id/post`       | perm_products     | posting (BR1, BR14)                                                                                                                                                                  |
| DELETE              | `/stock-opnames/:id`            | perm_products     | hanya draft                                                                                                                                                                          |
| GET                 | `/categories`                   | login             | `all=1` untuk dropdown                                                                                                                                                               |
| POST/PUT/DELETE     | `/categories[/:id]`             | perm_categories   |                                                                                                                                                                                      |
| GET/POST/PUT/DELETE | `/customers[/:id]`              | login             | list paginated, `search` nama/telepon                                                                                                                                                |
| GET                 | `/suppliers`                    | perm_purchases    | paginated, `all=1`                                                                                                                                                                   |
| GET/POST/PUT/DELETE | `/suppliers[/:id]`              | perm_purchases    |                                                                                                                                                                                      |
| GET                 | `/purchases`                    | perm_purchases    | paginated; `supplier_id`, tanggal                                                                                                                                                    |
| GET                 | `/purchases/payables`           | perm_purchases    | hutang; `supplier_id`, `due=overdue\|week`                                                                                                                                           |
| POST                | `/purchases`                    | perm_purchases    | posting penerimaan (F6)                                                                                                                                                              |
| GET                 | `/purchases/:id`                | perm_purchases    | + item                                                                                                                                                                               |
| POST                | `/purchases/:id/mark-paid`      | perm_purchases    | `{paid_at, payment_note}`                                                                                                                                                            |
| GET                 | `/shifts/current`               | login             | shift terbuka milik user (atau `null`)                                                                                                                                               |
| POST                | `/shifts/open`                  | login             | `{till_id, opening_cash}`                                                                                                                                                            |
| GET                 | `/shifts`                       | login             | milik sendiri; semua jika `perm_transactions`                                                                                                                                        |
| GET                 | `/shifts/:id`                   | login             | rekap per metode + kas seharusnya                                                                                                                                                    |
| POST                | `/shifts/:id/close`             | login             | `{counted_cash, note}`; hanya pemilik shift                                                                                                                                          |
| POST                | `/transactions`                 | login             | `{status: held\|paid, till_id, items: [{product_unit_id, quantity}], discount, customer_id?, ref_number?, prescription_number?, prescription_note?, payment?: {method, paid, info}}` |
| GET                 | `/transactions/held`            | login             | `type=tab\|customer`, `search`                                                                                                                                                       |
| GET                 | `/transactions/summary`         | perm_transactions | kartu ringkasan + produk terjual (filter sama dengan list)                                                                                                                           |
| GET                 | `/transactions/export`          | perm_transactions | xlsx                                                                                                                                                                                 |
| GET                 | `/transactions`                 | perm_transactions | paginated; `start_date`, `end_date`, `user_id`, `till_id`, `shift_id`, `status`                                                                                                      |
| GET                 | `/transactions/:id`             | login             | detail + item + retur (untuk struk)                                                                                                                                                  |
| PUT                 | `/transactions/:id`             | login             | ubah isi pesanan `held`                                                                                                                                                              |
| POST                | `/transactions/:id/pay`         | login             | bayar pesanan `held` (BR1)                                                                                                                                                           |
| DELETE              | `/transactions/:id`             | login             | hanya `held`                                                                                                                                                                         |
| POST                | `/transactions/:id/void`        | perm_transactions | `{reason}` (BR7)                                                                                                                                                                     |
| POST                | `/transactions/:id/returns`     | perm_transactions | `{items: [{transaction_item_id, base_quantity, restock}], reason, refund_method}` (BR10)                                                                                             |
| GET                 | `/sales-returns`                | perm_transactions | paginated                                                                                                                                                                            |
| GET                 | `/sales-returns/:id`            | login             | untuk struk retur                                                                                                                                                                    |
| GET                 | `/alerts`                       | login             | jumlah & daftar (F16)                                                                                                                                                                |
| GET                 | `/settings`                     | login             |                                                                                                                                                                                      |
| PUT                 | `/settings`                     | perm_settings     | multipart (`logo`)                                                                                                                                                                   |
| GET                 | `/tills`                        | login             |                                                                                                                                                                                      |
| POST/PUT/DELETE     | `/tills[/:id]`                  | perm_settings     |                                                                                                                                                                                      |
| GET/POST/PUT/DELETE | `/users[/:id]`                  | perm_users        | tanpa hash; user id 1 tidak bisa dihapus/dicabut izinnya                                                                                                                             |
| GET                 | `/audit-logs`                   | perm_settings     | paginated; `user_id`, `entity_type`, `action`, tanggal                                                                                                                               |

Rute statis (`/products/barcode/:code`, `/products/export`, `/batches/export`, `/purchases/payables`, `/shifts/current`, `/shifts/open`, `/transactions/held`, `/transactions/summary`, `/transactions/export`) didaftarkan **sebelum** `/:id`.

## 8. Halaman frontend

Sumber UI: template Trezo (D6). Kolom "Basis Trezo" = komponen di `src/components/` template yang di-port.

| Route                                               | Halaman             | Isi                                                                                                                      | Basis Trezo                                                    |
| --------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `/login`                                            | Login               | username + password                                                                                                      | `Authentication/SignInForm`                                    |
| `/`                                                 | POS                 | form buka shift jika belum ada; kiri: pelanggan, barcode, keranjang (satuan per baris), total; kanan: cari, filter, grid | `eCommerce/ProductsGrid`, `eCommerce/Cart`                     |
| `/held`                                             | Pesanan Tertunda    | tab Open Tab / Pesanan Pelanggan                                                                                         | `eCommerce/Orders`                                             |
| `/shifts` `/shifts/:id`                             | Shift               | daftar shift, rekap, tutup shift, cetak rekap                                                                            | `Tables/DataTable`                                             |
| `/transactions` `/transactions/:id`                 | Transaksi & Laporan | filter, kartu ringkasan, produk terjual, tabel transaksi; detail: struk, void, retur                                     | `Dashboard/PosSystem` (kartu), `eCommerce/OrderDetailsContent` |
| `/sales-returns`                                    | Retur               | daftar retur, cetak struk retur                                                                                          | `eCommerce/Refunds`                                            |
| `/products` `/products/create` `/products/:id/edit` | Produk              | list + badge golongan/stok/ED; form + tabel satuan; cetak barcode                                                        | `eCommerce/ProductsList`, `CreateProductForm`                  |
| `/batches`                                          | Stok per Batch      | filter ED/rak, penyesuaian (modal), export                                                                               | `Tables/DataTable`                                             |
| `/stock-opnames` `/stock-opnames/:id`               | Stok Opname         | daftar sesi; isi qty fisik, tambah batch, posting                                                                        | `Tables/DataTable`                                             |
| `/purchases` `/purchases/create` `/purchases/:id`   | Penerimaan Barang   | header faktur + tabel item (satuan, batch, ED)                                                                           | `Invoices/CreateInvoiceForm`, `InvoiceDetailsTable`            |
| `/payables`                                         | Hutang              | filter jatuh tempo, tandai lunas                                                                                         | `Invoices/InvoicesTable`                                       |
| `/suppliers`                                        | Supplier            | DataTable + modal form                                                                                                   | `Tables/DataTable`                                             |
| `/categories`                                       | Kategori            | DataTable + modal form                                                                                                   | `eCommerce/Categories`                                         |
| `/customers`                                        | Pelanggan           | DataTable + modal form                                                                                                   | `eCommerce/Customers`                                          |
| `/users` `/users/create` `/users/:id/edit`          | User                | DataTable, form + checkbox izin                                                                                          | `Tables/DataTable`                                             |
| `/settings`                                         | Pengaturan          | toko + till                                                                                                              | `Settings/AccountSettingsForm`                                 |
| `/audit-logs`                                       | Audit Log           | filter, detail before/after                                                                                              | `Tables/DataTable`                                             |
| `/profile`                                          | Profil              | nama & ganti password                                                                                                    | `Settings/ChangePasswordForm`                                  |
| `*`                                                 | 404                 |                                                                                                                          | `app/not-found.tsx`                                            |

Komponen POS utama: `ShiftOpenForm`, `ProductGrid`, `Cart`, `UnitSelect`, `PrescriptionModal`, `PaymentModal`, `HoldModal`, `Receipt` (dipakai ulang di transaksi & retur), `CustomerSelect`. Menu sidebar disembunyikan sesuai flag izin (server tetap mengecek).

Layar POS harus bisa dioperasikan keyboard penuh: fokus default di input barcode, `Enter` tambah item, shortcut `F2` bayar, `F4` tahan, `Esc` tutup modal.

## 9. Konvensi teknis (dari `fullstack-ipin`)

### Backend

- Go 1.24, module baru (mis. `pos-apotek-api`), Gin, GORM + `gorm.io/driver/postgres`, `golang-jwt/jwt/v5`, `godotenv`, `x/crypto/bcrypt`, swaggo, `excelize/v2`.
- Env (`.env.example`): `APP_ENV`, `APP_PORT`, `APP_URL`, `CORS_ORIGIN`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSLMODE`, `DB_MAX_OPEN_CONNS`, `DB_MAX_IDLE_CONNS`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_DEFAULT_PASSWORD`. Koneksi PostgreSQL dengan `TimeZone=Asia/Jakarta`.
- Struktur:
  ```text
  backend/
  ├── main.go
  ├── config/         database.go (koneksi + DDL idempotent + seed admin), jwt.go
  ├── routes/routes.go   satu file, komentar `// GET /api/xxx` di atas tiap rute, banner `// ======` per section
  ├── controllers/    product_controller.go, transaction_controller.go, ...
  ├── dto/            product_dto.go, transaction_dto.go, common.go (PaginationMeta)
  ├── models/         GORM model + TableName()
  ├── middleware/     auth.go, permission.go, cors.go
  ├── helpers/        jwt.go, password.go
  ├── services/       logger_service.go (GetServiceLogger)
  ├── storage/        uploads/, logs/  (disajikan di /storage)
  └── .air.toml Dockerfile .env.example
  ```
- Pola: controller struct `{DB, Logger}` + `NewXxxController()`; handler `Index`, `Detail`, `Store`, `Update`, `Delete`. Query GORM langsung di controller.
  - Pengecualian disengaja: logika stok & uang (BR1–BR14) ada di `services/` agar bisa dites tanpa HTTP: `checkout_service.go` (checkout, bayar held, void, retur, FEFO), `stock_service.go` (penerimaan, penyesuaian, opname), `audit_service.go`; penomoran dokumen di `helpers/sequence.go`. Tanpa layer repository.
- File snake_case, URL kebab-case, pesan respons Bahasa Indonesia.
- Validasi: `ShouldBindJSON` + tag `binding:"required"`; request update pakai field pointer.
- Respons envelope `{status, code, message, data}` — **jangan** pakai `helpers.SuccessResponse` (shape lama). Satu struct envelope di `dto/common.go`, bukan copy per fitur.
- Swagger godoc di tiap handler (`@Tags`, `@Security BearerAuth`, `@Router`).
- JWT HS256, claim `{UserID, Username, TokenIssuedAt}`; single session via `users.token_issued_at`. Akses token **12 jam** (acuan 30 hari terlalu panjang untuk kasir), refresh 7 hari.
- Redis **tidak dipakai** di fase 1. _Tambah jika laporan berat butuh cache._
- Test: `testing` + `httptest` + `gin.New()`; tes DB opt-in via env `POS_TEST_DSN`.
- Dockerfile multi-stage, `CGO_ENABLED=0`, `TZ=Asia/Jakarta`.

### Frontend

- **Beda dari acuan:** React 19 (acuan React 18). Konsekuensinya upgrade: Vite ≥ 6 + `@vitejs/plugin-react` terbaru, TypeScript 5, Redux Toolkit 2 + react-redux 9, **react-router 7** (mode library, `createBrowserRouter`, pola sama dengan acuan). Template Vristo/`react-scripts` diganti Trezo (D6).
- TypeScript strict, Tailwind v4 via `@tailwindcss/vite` (tema dari `globals.css` Trezo, blok `@theme`), ikon `material-symbols`, font Inter lokal (`@fontsource/inter`), alias `@` → `src`.
- Struktur:
  ```text
  frontend/src/
  ├── config/api.ts            API_CONFIG, TOKEN_KEYS
  ├── services/api.service.ts  wrapper fetch + Bearer + redirect /login saat 401
  ├── services/<feature>.service.ts
  ├── types/<feature>.types.ts (snake_case field, sinkron manual dengan dto/)
  ├── store/                   authSlice, cartSlice (keranjang POS), themeConfigSlice
  ├── router/                  routes.tsx (lazy), ProtectedRoute.tsx (+ cek izin)
  ├── components/Layouts/  components/ui/ (DataTable, Modal, Button, Input, ...)
  └── pages/<Feature>/         Index.tsx, Create.tsx, Edit.tsx, <Feature>Form.tsx
  ```
- Data fetching: `useState` + `useEffect`/`useCallback` + `apiService` (sesuai acuan, tanpa TanStack Query/axios). Form: controlled state + `validateForm()` manual. Notifikasi: SweetAlert2 toast.
- Prettier: `semi: true`, `singleQuote: true`, `printWidth: 200`; `.editorconfig` 4 spasi, LF. Package manager npm.
- Teks UI Bahasa Indonesia; format uang `Intl.NumberFormat('id-ID')`.
- Deploy: build `node:22-alpine` → `nginx:alpine`, env `VITE_API_URL`, `VITE_STORAGE_URL`.

## 10. Kebutuhan non-fungsional

| Area          | Target                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keamanan      | Semua endpoint auth; izin di server; bcrypt cost 10; CORS hanya origin frontend; rate limit login (mis. 10/menit/IP); upload: cek MIME + ekstensi + ukuran, nama file di-generate server; tidak ada hash/rahasia di respons/log |
| Integritas    | BR1–BR14; constraint DB (UNIQUE, CHECK, FK, partial unique index)                                                                                                                                                               |
| Performa      | Scan barcode → item muncul < 300 ms di LAN; list paginated; laporan 1 bulan (±10k transaksi) < 2 dtk                                                                                                                            |
| Skala         | 1 toko, ≤ 10 till bersamaan, ≤ 20k produk                                                                                                                                                                                       |
| Zona waktu    | `Asia/Jakarta` (DB & app); filter tanggal di server pakai batas hari lokal                                                                                                                                                      |
| Aksesibilitas | Semua aksi POS via keyboard; fokus terlihat; kontras teks ≥ 4.5:1                                                                                                                                                               |
| Backup        | `pg_dump` harian via cron + folder `storage/uploads` (ops, bukan fitur UI)                                                                                                                                                      |

## 11. Keputusan

| #   | Topik           | Keputusan                                                                                                                 |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| D1  | Database        | PostgreSQL saja. Skema via DDL idempotent di `config.ConnectDatabase()`.                                                  |
| D2  | Login           | Username + password (bcrypt), JWT access 12 jam + refresh 7 hari, satu sesi per user.                                     |
| D3  | Uang            | `int64` rupiah utuh, kolom `BIGINT`. Tanpa `shopspring/decimal`.                                                          |
| D4  | Pajak           | Harga jual sudah termasuk PPN (HET). DPP/PPN dihitung mundur hanya jika toko PKP (BR9). Menggantikan perilaku PharmaSpot. |
| D5  | Router frontend | react-router 7 (dukung React 19, API `createBrowserRouter` sama dengan v6 acuan).                                         |
| D6  | UI              | Port dari template Trezo (Next.js 15, React 19, Tailwind v4) ke Vite + react-router 7. Lisensi Trezo dicek sebelum rilis. |
| D7  | Stok            | Stok = Σ batch dalam satuan dasar. Tidak ada kolom stok di `products`. Semua perubahan stok lewat `stock_movements`.      |

## 12. Milestone

Rincian tugas ada di [TASKLIST.md](TASKLIST.md).

| #   | Lingkup                                                             | Selesai jika                                                                  |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| M0  | Persiapan: PRD sinkron, lisensi Trezo, repo, PostgreSQL             | repo & DB siap                                                                |
| M1  | Fondasi backend: skema, envelope, logger, CORS, seed admin, swagger | server jalan, DDL idempotent                                                  |
| M2  | Login, user, pengaturan, till, audit log (F1, F17–F19)              | endpoint tanpa token → 401, tanpa izin → 403                                  |
| M3  | Port UI Trezo ke Vite: layout, sidebar, login, komponen dasar       | `grep "from \"next/"` kosong, login FE jalan                                  |
| M4  | Master data: kategori, produk + satuan, pelanggan, supplier (F2–F5) | CRUD lengkap + izin dicek server                                              |
| M5  | Stok: penerimaan + hutang, batch, penyesuaian, opname (F6–F8)       | stok & HPP rata-rata benar; tes opname lulus                                  |
| M6  | Shift, POS, pembayaran, struk (F9–F11, F13)                         | checkout atomik + FEFO; dua checkout paralel atas stok terakhir → satu sukses |
| M7  | Pesanan tertunda (F12)                                              | bayar held mengurangi stok                                                    |
| M8  | Void, retur, laporan, peringatan (F14–F16)                          | angka ringkasan cocok dengan query manual                                     |
| M9  | Hardening & deploy                                                  | deploy di server toko, restore backup teruji                                  |

## 13. Fase 2 (kandidat)

Resep lengkap (data dokter, salinan resep, etiket, racikan + biaya jasa), laporan SIPNAP, purchase order dan retur ke PBF, diskon per item, split payment, PPN untuk harga belum termasuk pajak, import produk CSV, multi-cabang, integrasi BPJS/e-faktur/payment gateway, mode offline.
