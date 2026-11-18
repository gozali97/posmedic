# Tasklist — POS Apotek

Acuan: [PRD.md](PRD.md) (F1–F19). UI di-port dari template Trezo (`/media/gozali/storage/trezo-react-nextjs-tailwindcss`, Next.js 15 + React 19 + Tailwind v4) ke React 19 + Vite + react-router 7.

Urutan milestone mengikuti kebutuhan data: stok harus bisa masuk (penerimaan/opname) sebelum POS bisa menjual.

Format: `- [ ] ID — tugas (ref PRD) → selesai jika ...`

---

## M0. Persiapan

- [x] M0-1 — Sinkronkan PRD §5–§8 dan §11–§13 dengan F1–F19 (aturan BR8–BR13, skema tabel baru, API baru, halaman baru, D4 harga termasuk PPN, milestone, fase 2) → tidak ada referensi BR/tabel/endpoint yang hilang atau bertentangan.
- [ ] M0-2 — Cek lisensi Trezo (regular vs extended) untuk dipakai di produk ini → lisensi cocok.
- [ ] M0-3 — Buat dua repo terpisah `backend/` dan `frontend/` (pola acuan), `.gitignore`, `.editorconfig` (4 spasi, LF) → repo bisa di-clone. _Sebagian: `frontend/` sudah punya `.gitignore` + `.editorconfig`, tapi masih satu repo dengan `backend/` dan belum ada commit._
- [x] M0-4 — Siapkan PostgreSQL lokal (docker run atau native), DB `pos_apotek`, zona waktu `Asia/Jakarta` → `psql` bisa konek.

## M1. Fondasi backend

- [x] M1-1 — Inisialisasi module Go 1.24 `pos-apotek-api`: Gin, GORM, driver postgres, jwt/v5, godotenv, bcrypt, swaggo, excelize → `go build ./...` lulus.
- [x] M1-2 — `main.go` + `config/database.go` (koneksi dari env, pool, `TimeZone=Asia/Jakarta`) + `.env.example` (§9) → server jalan di `APP_PORT`.
- [x] M1-3 — DDL idempotent semua tabel di `config.ConnectDatabase()`: constraint UNIQUE/CHECK/FK, partial unique index barcode `WHERE deleted_at IS NULL` (§6) → start dua kali tanpa error.
- [x] M1-4 — `dto/common.go`: envelope `{status, code, message, data}` + `PaginationMeta` + helper parse `page`/`per_page` (maks 100) → dipakai semua controller.
- [x] M1-5 — `services/logger_service.go` (`GetServiceLogger`, file harian di `storage/logs/<service>/`) → log tertulis.
- [x] M1-6 — Middleware CORS (hanya `CORS_ORIGIN`), sajikan `/storage` → frontend origin lain ditolak.
- [x] M1-7 — Seed admin `id=1` dari `ADMIN_DEFAULT_PASSWORD`, `must_change_password=true` (§3) → admin ada setelah start pertama; start kedua tidak menimpa.
- [x] M1-8 — Setup swaggo (`swag init -g routes/routes.go -o docs`), `.air.toml` → `/swagger/index.html` terbuka.

## M2. Login, user, pengaturan, audit log (F1, F17, F18, F19)

- [x] M2-1 — `helpers/jwt.go` + bcrypt langsung (`golang.org/x/crypto/bcrypt`, tanpa wrapper): access 12 jam, refresh 7 hari, claim `{UserID, Username, TokenIssuedAt}` (D2).
- [x] M2-2 — `POST /auth/login`: username lowercase, bcrypt, 401/403/429 sesuai F1, isi `token_issued_at` + `last_login_at` → semua kasus F1 lulus tes.
- [x] M2-3 — Rate limit login 10/menit/IP (in-memory, cukup untuk 1 server) → percobaan ke-11 dapat 429.
- [x] M2-4 — `middleware.AuthMiddleware()` (cek `token_issued_at` = satu sesi) dan `RequirePerm("perm_x")` → token lama setelah login ulang dapat 401; tanpa izin dapat 403.
- [x] M2-5 — `GET /auth/me`, `POST /auth/refresh-token`, `POST /auth/logout`, `PUT /auth/password` (password lama wajib, min 8), `PUT /auth/profile`.
- [x] M2-6 — CRUD user (F18): 6 flag izin, password kosong saat edit = tidak berubah, user `id=1` tidak bisa dihapus/dicabut izin, respons tanpa hash.
- [x] M2-7 — `services/audit_service.go`: `WriteAudit(tx, AuditEntry{...})` ditulis dalam transaksi yang sama; buang field password/hash/token (F19) → tes: rollback ikut membatalkan audit.
- [x] M2-8 — Pasang audit untuk login sukses/gagal, user, pengaturan.
- [x] M2-9 — Pengaturan toko `GET/PUT /settings` + upload logo (cek MIME + ekstensi + 2 MB, nama file dari server) (F17).
- [x] M2-10 — CRUD till `/tills` (F17).
- [x] M2-11 — `GET /audit-logs` paginated, filter user/entitas/aksi/tanggal, `perm_settings`.
- [x] M2-12 — Tes `httptest`: login, satu sesi, 401 tanpa token, 403 tanpa izin (`routes/routes_test.go`, DB asli dalam transaksi yang di-rollback).

## M3. Port UI Trezo ke Vite (shell aplikasi)

- [x] M3-1 — Scaffold Vite + React 19 + TS strict, alias `@` → `src`, Prettier (`singleQuote`, `printWidth: 200`) → `npm run build` lulus.
- [x] M3-2 — Tailwind v4 via `@tailwindcss/vite`; salin `src/app/globals.css` (blok `@theme`, kelas `trezo-card`, `sidebar-area`, `main-content-wrap`) dan `public/images/` yang dipakai saja → tampilan kartu & warna sama dengan Trezo.
- [x] M3-3 — Font Inter via `@fontsource/inter` (bukan Google Fonts, apotek bisa tanpa internet); ikon `material-symbols` saja, buang remixicon jika tidak dipakai.
- [x] M3-4 — Ganti API Next di file yang di-port: hapus `"use client"`, `next/link` → `Link` react-router, `next/image` → `<img>`, `usePathname` → `useLocation`, `next/dynamic` → import biasa. Cek: `grep -r "from \"next/" src` kosong.
- [x] M3-5 — Ganti `LayoutProvider` dengan dua layout route + `<Outlet/>`: `AuthLayout` (login) dan `AppLayout` (sidebar, header, footer).
- [x] M3-6 — Sidebar: tulis ulang sebagai array menu `{label, icon, to, perm}` + `.map()`, disaring flag izin user; active link pakai `NavLink` (tanpa trailing slash).
- [x] M3-7 — Header: pertahankan dark mode, fullscreen, notifikasi (diisi dari `/alerts`), menu profil. Buang search, apps, bahasa, RTL. Catatan: dark mode Trezo hanya jalan jika class `<html>` persis `dark` — sudah diganti ke `@custom-variant dark (&:where(.dark, .dark *))`. Kontrak `/alerts` sudah sama dengan `dto.AlertsData` backend.
- [x] M3-8 — `config/api.ts`, `services/api.service.ts` (fetch + Bearer + redirect `/login` saat 401), `types/api.types.ts` (envelope + pagination).
- [x] M3-9 — Redux: `authSlice` (login/logout/fetchMe, key `pos_access_token` dkk.), `ProtectedRoute` (+ cek izin, paksa `/profile` jika `must_change_password`).
- [x] M3-10 — Halaman login dari `Authentication/SignInForm.tsx`: field username (bukan email), password, pesan error F1. Buang link sign-up/forgot password.
- [x] M3-11 — Komponen `components/ui/`: `DataTable` (dari `Tables/DataTable.tsx` + paginasi server), `Modal` (dari `UIElements/Modal`), `Input`, `Select`, `FileUploader`, `Badge`; toast & konfirmasi pakai SweetAlert2 (Trezo tidak punya toast).
- [x] M3-12 — Halaman 404 dari `not-found.tsx`; halaman profil + ganti password dari `Settings/ChangePasswordForm.tsx`.
- [x] M3-13 — Halaman user (list, create, edit + checkbox izin), pengaturan (toko + till), audit log.
- [x] M3-14 — Util `formatRupiah` (`Intl.NumberFormat('id-ID')`) dan `formatDate` (Asia/Jakarta).

## M4. Master data (F2, F3, F4, F5)

- [x] M4-1 — CRUD kategori; hapus ditolak jika dipakai produk (F3).
- [x] M4-2 — Produk: CRUD + gambar + golongan obat + nama generik + rak; tabel satuan di request yang sama (tepat satu satuan dasar `conversion_qty=1`, barcode satuan unik) (F2) → tes validasi satuan.
- [x] M4-3 — `GET /products`: cari nama dagang/generik/barcode satuan (`ILIKE`, index trigram jika lambat), filter kategori/golongan/status stok/status ED; stok = Σ batch.
- [x] M4-4 — `GET /products/barcode/:code` → produk + satuan yang cocok (F10).
- [x] M4-5 — Hapus produk: tolak jika stok > 0; soft delete; barcode bisa dipakai ulang.
- [x] M4-6 — Export produk ke Excel (`excelize`).
- [x] M4-7 — CRUD pelanggan (F4) dan supplier dengan termin default (F5). _Supplier yang sudah punya penerimaan ditolak dihapus (409); tanpa penerimaan → soft delete. Pelanggan yang sudah punya transaksi ditolak dihapus._
- [x] M4-8 — Audit log untuk produk & harga satuan.
- [x] M4-9 — FE: halaman kategori (modal), pelanggan (modal), supplier (modal).
- [x] M4-10 — FE: produk list (dari `eCommerce/ProductsList`) dengan badge golongan & label stok/ED; form produk (dari `CreateProductForm`) + tabel satuan dinamis; cetak barcode per satuan (`react-barcode`).
- [x] M4-11 — FE: tampilan stok terurai ("2 box 3 strip 4 tablet") sebagai satu fungsi util + tes kecil. _`utils/stock.ts` (`formatStock`, `formatStockFull`) + `stock.test.ts`._

## M5. Stok: penerimaan, batch, penyesuaian, opname (F6, F7, F8)

- [x] M5-1 — Posting penerimaan dalam satu `db.Transaction`: tambah/gabung batch (rata-rata tertimbang `cost_price`), `cost_price` per satuan dasar dibulatkan ke atas, `stock_movements` `purchase`, audit (F6) → tes: dua penerimaan batch sama menghasilkan HPP rata-rata benar.
- [x] M5-2 — Validasi penerimaan: no. faktur unik per supplier, ED > hari ini, qty > 0. Penerimaan terposting tidak bisa diubah.
- [x] M5-3 — Hutang: list (filter supplier, jatuh tempo lewat/≤7 hari), tandai lunas + audit.
- [x] M5-4 — `GET /batches`: filter produk/rak/status ED/berstok; export Excel (F7).
- [x] M5-5 — Penyesuaian per batch (alasan `expired`/`damaged`/`lost`/`correction`), kunci baris `FOR UPDATE`, stok batch tidak boleh negatif (F8).
- [x] M5-6 — Stok opname: buat sesi draft (filter kategori/rak), isi qty fisik, tambah batch baru, posting selisih terhadap stok saat posting (F8) → tes: selisih benar walau ada penjualan setelah sesi dibuat. _Baris dengan qty fisik kosong dilewati saat posting (tidak dianggap 0). Batch baru yang sama dengan batch yang ada (produk + no. batch + ED) diperlakukan sebagai batch itu._
- [x] M5-7 — FE: penerimaan (form header faktur + tabel item: produk, satuan, qty, harga, batch, ED; dari `CreateInvoiceForm`), daftar penerimaan, detail.
- [x] M5-8 — FE: hutang, stok per batch, penyesuaian (modal), opname (list sesi, form isi qty fisik, posting dengan konfirmasi).

## M6. Shift, POS, pembayaran, struk (F9, F10, F11, F13)

- [x] M6-1 — Shift: buka (modal awal), satu shift terbuka per user dan per till (unique partial index), tutup dengan rekap per metode + kas seharusnya + selisih; tidak bisa dibuka ulang (F9).
- [x] M6-2 — `services/checkout_service.go`: hitung ulang harga dari DB, harga termasuk PPN (`total = subtotal − discount`, DPP/PPN untuk PKP), alokasi FEFO lintas batch (lewati batch ED), kunci `FOR UPDATE` urut id (hindari deadlock), kurangi batch, snapshot nama/harga/HPP per batch, `stock_movements` `sale`, nomor invoice `INV/{YYYYMMDD}/{till}/{seq}`, terikat shift aktif, audit. _Sisa pembulatan diskon (BR10) dibagi ke baris dengan pecahan terbesar (seri → baris terakhir), bukan selalu ke baris terakhir, agar bagian diskon tidak pernah melebihi nilai baris._
- [x] M6-3 — Aturan golongan: `narkotika`/`psikotropika` wajib pelanggan + no. resep; `keras` simpan no. resep opsional (F10).
- [x] M6-4 — `POST /transactions` (held/paid), validasi pembayaran (`paid ≥ total`, non-tunai `paid = total`) (F11).
- [x] M6-5 — Tes checkout: FEFO memakai ED terdekat, stok kurang ditolak, batch ED dilewati, total dari server mengabaikan harga client, dua checkout paralel atas stok terakhir → hanya satu sukses.
- [x] M6-6 — FE: layar POS (kiri keranjang, kanan grid; grid dari `eCommerce/ProductsGrid.tsx`, keranjang dari `eCommerce/Cart`), form buka shift jika belum ada shift.
- [x] M6-7 — FE: `cartSlice` (produk, satuan, qty dibatasi stok jual), dropdown satuan per baris, scan barcode (fokus default di input, Enter), cari nama generik. _Keranjang tidak disimpan ke localStorage: reload halaman mengosongkan keranjang (pesanan tertunda dipakai untuk menyimpan). Stok jual di keranjang adalah angka saat produk ditambahkan; server tetap memeriksa saat bayar._
- [x] M6-8 — FE: konfirmasi obat keras, isian pasien + no. resep untuk narkotika/psikotropika.
- [x] M6-9 — FE: `PaymentModal` (tunai/kartu/QRIS, keypad, kembalian), `quick_billing`.
- [ ] M6-10 — FE: `Receipt` 58/80 mm via `window.print()` + `@media print`; isi F13 (SIA, apoteker + SIPA, NPWP/DPP/PPN jika PKP). Uji di printer thermal asli. _Sebagian: struk jual, struk retur, pra-struk, dan rekap shift sudah dibuat (`components/print/`), pilihan kertas 58/80 mm disimpan per browser. Belum diuji di printer thermal asli._
- [x] M6-11 — FE: shortcut keyboard `F2` bayar, `F4` tahan, `Esc` tutup modal; fokus terlihat. _`Esc` lewat Headless UI Dialog; `F2`/`F4` aktif di layar POS kecuali saat modal terbuka._
- [x] M6-12 — FE: halaman tutup shift + cetak rekap; daftar shift.

## M7. Pesanan tertunda (F12)

- [x] M7-1 — `GET /transactions/held?type=tab|customer`, `PUT /transactions/:id` (ubah isi), `DELETE` (hanya held).
- [x] M7-2 — `POST /transactions/:id/pay` memakai `checkout_service` (stok, harga, FEFO dihitung ulang; terikat shift pembayar) → tes: bayar held mengurangi stok.
- [x] M7-3 — FE: modal Tahan (ref atau pelanggan), halaman pesanan tertunda dua tab, muat ke keranjang, bayar, hapus. _"Bayar" di halaman pesanan tertunda memuat pesanan ke POS lalu membuka pembayaran, agar aturan resep dan struk sama dengan checkout biasa. Pesanan yang dimuat lalu diubah disimpan dulu (`PUT`), baru dibayar._

## M8. Void, retur, laporan, peringatan (F14, F15, F16)

- [x] M8-1 — Void: hanya saat shift transaksi masih terbuka dan belum ada retur; kembalikan stok ke batch asal; audit.
- [x] M8-2 — Retur: qty ≤ terjual − sudah diretur, refund dihitung server (proporsional diskon), kembali ke stok → batch asal, tidak → `damaged`, wajib shift terbuka, nomor `RTR/...` (F14) → tes: retur bertahap tidak melebihi qty terjual.
- [x] M8-3 — `GET /transactions` (filter till/kasir/shift/status/tanggal batas hari Asia/Jakarta), `GET /transactions/:id`, `GET /transactions/summary` (bruto, retur, bersih, HPP, laba kotor, DPP/PPN), export Excel. _Basis laporan: transaksi lunas yang dibayar dalam periode, termasuk retur atas transaksi itu walau returnya di hari lain. Daftar transaksi default menampilkan lunas + void._
- [x] M8-4 — `GET /alerts`: batch ED, hampir ED (`expiry_warning_days`), stok menipis/habis, hutang jatuh tempo (hanya `perm_purchases`).
- [x] M8-5 — Tes laporan: angka summary cocok dengan query SQL manual pada data seed.
- [x] M8-6 — FE: halaman transaksi & laporan (kartu ringkasan dari `Dashboard/PosSystem` stat cards, tabel produk terjual, tabel transaksi, preset tanggal), modal struk & cetak ulang. _Filter kasir hanya muncul untuk user dengan `perm_users` (daftar user butuh izin itu)._
- [x] M8-7 — FE: form retur dari detail transaksi + struk retur; tombol void dengan alasan.
- [x] M8-8 — FE: toast peringatan saat masuk POS + badge di header. _Toast sekali per sesi browser per user (sessionStorage), agar tidak muncul tiap kembali ke POS._

## M9. Hardening & deploy

- [x] M9-1 — Review keamanan: semua rute (kecuali login/refresh) pakai auth, izin sesuai §3, tidak ada hash/token di respons dan log, upload aman. _Hasil: semua rute selain health/login/refresh butuh login; sesi dicek ulang tiap request (`is_active` + `token_issued_at`); JWT dikunci HS256; hash password tidak pernah ada di respons/audit/log; upload dicek ekstensi + isi + ukuran, nama acak; SQL selalu berparameter; Swagger mati di production. Diperbaiki: HPP/batch di `GET /products/:id` kini hanya untuk `perm_products`; `GET /transactions/:id` tanpa `perm_transactions` hanya pesanan tertunda & transaksi sendiri; `GET /sales-returns/:id` hanya retur sendiri (tes di `sales_flow_test.go`). `deploy/.env` dan `deploy/api.env` di-ignore git._
- [x] M9-2 — Uji performa: scan barcode < 300 ms di LAN, laporan 1 bulan (±10k transaksi) < 2 detik; tambah index jika perlu. _`POS_PERF=1 go test -run TestPerformance ./routes` (20k produk, 10k transaksi, di-rollback): scan barcode 1 ms, laporan 30 hari 257 ms. Laporan semula 25 dtk; diperbaiki dengan index `transaction_item_batches(transaction_item_id)` dan `sales_return_items(transaction_item_id)`. Hasil lengkap di `docs/DEPLOY.md`._
- [ ] M9-3 — Dockerfile backend (multi-stage, `CGO_ENABLED=0`, `TZ=Asia/Jakarta`) dan frontend (`node:22-alpine` → `nginx:alpine`, fallback SPA). _Sebagian: `backend/Dockerfile` (binary `api` + `seed`, user non-root, healthcheck), `frontend/Dockerfile` + `nginx.conf`, `deploy/docker-compose.yml` (PostgreSQL opsional), panduan `docs/DEPLOY.md`. Build Go statis dan build frontend dengan build-arg sudah diuji terpisah; image belum pernah di-build karena Docker tidak terpasang di mesin dev._
- [ ] M9-4 — Backup: cron `pg_dump` harian + folder `storage/uploads`, retensi 30 hari; uji restore sekali. _Sebagian: `deploy/backup.sh` (pg_dump + uploads, retensi 30 hari) dan langkah restore di `docs/DEPLOY.md`; jadwal cron dan uji restore dilakukan di server._
- [ ] M9-5 — Go-live: input saldo awal lewat opname pertama, ganti password admin, buat till & user kasir. _Checklist di `docs/DEPLOY.md`. Data master awal bisa diisi `seed -starter` (kategori, 40 produk + satuan + harga, till); data demo `seed` hanya untuk server demo/pelatihan._
