# Deploy POS Apotek

Panduan memasang aplikasi di server toko dengan Docker. Semua file deploy ada di folder [`deploy/`](../deploy).

## Isi

| Komponen | Image | Port host (hanya 127.0.0.1) |
| --- | --- | --- |
| API (Go) + alat `seed` | `backend/Dockerfile` → `alpine`, `TZ=Asia/Jakarta`, user non-root | `API_PORT` (8072) |
| Web (React) | `frontend/Dockerfile` → `nginx`, fallback SPA | `WEB_PORT` (8080) |
| PostgreSQL 17 (opsional) | `postgres:17-alpine`, profil `db` | tidak dibuka |

Volume: `storage` (logo, gambar produk, log API) dan `pgdata` (database, jika memakai profil `db`).

## 1. Siapkan konfigurasi

```bash
cd deploy
cp .env.example .env          # alamat publik API untuk build web, port, password PostgreSQL
cp api.env.example api.env    # environment API: DB, JWT, CORS, admin awal
openssl rand -hex 32          # jalankan dua kali: JWT_SECRET dan JWT_REFRESH_SECRET
```

Yang wajib diisi:

- `.env`: `VITE_API_URL`, `VITE_STORAGE_URL` (alamat yang dibuka browser, mis. `https://api.apotek.example/api`), `POSTGRES_PASSWORD` jika memakai profil `db`.
- `api.env`: `CORS_ORIGIN` (alamat web, persis tanpa `/` di akhir), `DB_*`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `TRUSTED_PROXIES` (IP reverse proxy; tanpa ini rate limit login melihat IP proxy, bukan IP klien).

`deploy/.env` dan `deploy/api.env` sudah di-ignore git. Jangan commit file yang sudah diisi.

## 2. Jalankan

```bash
docker compose --profile db up -d --build   # dengan PostgreSQL di server yang sama (DB_HOST=db)
docker compose up -d --build                # PostgreSQL di server lain (isi DB_HOST)
docker compose ps                           # api harus "healthy" (cek /api/health)
```

Saat API pertama kali jalan, tabel dibuat otomatis dan user `admin` dibuat dengan password `ADMIN_DEFAULT_PASSWORD`, atau **`password789`** jika variabel itu kosong. Admin wajib ganti password saat login pertama, jadi segera login setelah deploy.

Pasang reverse proxy dengan TLS (nginx/Caddy) di depan kedua port, mis. `apotek.example` → `127.0.0.1:8080` dan `api.apotek.example` → `127.0.0.1:8072`. Batasi ukuran upload di proxy minimal 3 MB (gambar produk maks. 2 MB).

Swagger hanya aktif di luar production.

## 3. Data awal (`seed`)

Alat `seed` ikut di image API (`/app/seed`) dan memakai koneksi DB yang sama.

| Perintah | Isi | Bisa dihapus? |
| --- | --- | --- |
| `docker compose exec api ./seed -starter` | Data master toko baru: 12 kategori, 40 produk umum + satuan + harga jual, 3 till (jika belum ada). Tanpa stok, transaksi, atau barcode. Aman diulang; nama yang sudah ada dilewati. | Tidak, jadi data biasa |
| `docker compose exec api ./seed -allow-production` | Data demo lengkap: 10 user `demo_*` (password `demo12345`), 1000 transaksi selama 45 hari, pembelian, hutang, retur, opname. Untuk server demo/pelatihan. | Ya |
| `docker compose exec api ./seed -reset -allow-production` | Menghapus semua data demo dan apa pun yang memakainya. Admin, pengaturan, dan data non-demo tetap. | — |

Di server toko asli pakai `-starter` saja. Data demo berisi penjualan palsu yang akan masuk laporan. Tanpa `-allow-production`, data demo dan `-reset` ditolak saat `APP_ENV=production`.

Setelah `-starter`: periksa harga, tambahkan barcode di menu Produk, lalu isi stok awal lewat Stok Opname (langkah 5).

Di mesin developer: `cd backend && go run ./cmd/seed` (demo), `go run ./cmd/seed -starter`, `go run ./cmd/seed -reset`.

## 4. Backup harian

[`deploy/backup.sh`](../deploy/backup.sh) membuat `pg_dump` (format custom) dan arsip `storage/uploads`, lalu menghapus backup lebih dari 30 hari.

```bash
# PostgreSQL di compose:
COMPOSE_DB=1 BACKUP_DIR=/var/backups/pos-apotek ./backup.sh
# PostgreSQL eksternal (butuh pg_dump di host):
PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=pos-apotek ./backup.sh

# cron, setiap malam 02:15
15 2 * * * cd /opt/pos-apotek/deploy && COMPOSE_DB=1 ./backup.sh >> /var/log/pos-apotek-backup.log 2>&1
```

Simpan salinan di luar server (disk lain atau cloud).

Restore (uji sekali sebelum go-live, ke database kosong):

```bash
docker compose stop api
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < /var/backups/pos-apotek/db-YYYYMMDD-HHMMSS.dump
docker compose run --rm -T api sh -c 'tar -xzf - -C /app/storage' < /var/backups/pos-apotek/uploads-YYYYMMDD-HHMMSS.tar.gz
docker compose start api
```

## 5. Go-live

1. Login sebagai `admin`, ganti password.
2. Isi **Pengaturan** toko: nama, alamat, SIA, apoteker + SIPA, NPWP/PKP, logo, footer struk.
3. Buat **till** untuk setiap komputer kasir (atau pakai till dari `-starter`) dan **user** kasir dengan izin seperlunya.
4. Data master: jalankan `seed -starter` atau isi manual; lengkapi supplier.
5. **Saldo awal stok:** buat Stok Opname per rak, isi qty fisik, tambahkan batch (no. batch, ED, harga beli), lalu posting.
6. Uji cetak struk 58/80 mm di printer thermal (pilih kertas di dialog struk).
7. Pastikan backup harian jalan dan restore sudah diuji.

## Update aplikasi

```bash
git pull
cd deploy && docker compose up -d --build
```

Skema database diperbarui otomatis saat API start (DDL idempoten). Buat backup sebelum update.

## Uji performa

Tes opt-in memuat 20 ribu produk dan 10 ribu transaksi di dalam transaksi yang di-rollback, lalu mengukur endpoint utama (target PRD §10):

```bash
cd backend && POS_PERF=1 go test -run TestPerformance -v ./routes
```

Hasil pada DB dev, 18 Nov 2026 (median):

| Endpoint | Waktu | Target |
| --- | --- | --- |
| Scan barcode | 1 ms | 300 ms |
| Cari produk / grid POS | 108 / 53 ms | — |
| Laporan 30 hari | 257 ms | 2 s |
| Daftar transaksi 30 hari | 37 ms | — |
| Peringatan | 223 ms | — |
