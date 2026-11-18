package routes

import (
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

// TestPerformance (M9-2, PRD §10) loads PRD-scale data inside the rolled-back test transaction:
// 20k products with two barcoded units and a batch each, and 10k paid sales over the last 30 days.
// Then it times the hot endpoints over HTTP. Opt-in because it adds load to the shared database:
//
//	POS_PERF=1 go test -run TestPerformance -v ./routes
func TestPerformance(t *testing.T) {
	if os.Getenv("POS_PERF") != "1" {
		t.Skip("set POS_PERF=1 to run")
	}
	tx, do := setup(t)
	uid := createFullUser(t, tx, "zz_perf", "rahasia123")
	token, _ := login(t, do, "zz_perf", "rahasia123")

	began := time.Now()
	stmts := []string{
		`INSERT INTO tills (number, name) VALUES (9931, 'ZZ Perf')`,
		`INSERT INTO categories (name) VALUES ('ZZ Perf')`,
		`INSERT INTO shifts (user_id, till_id, status, opening_cash, opened_at, closed_at)
			SELECT @uid, id, 'closed', 0, NOW() - INTERVAL '31 days', NOW() FROM tills WHERE number = 9931`,
		`INSERT INTO products (category_id, name, generic_name, drug_class, shelf_location, min_stock, track_stock)
			SELECT (SELECT id FROM categories WHERE name = 'ZZ Perf'), 'ZZ Produk ' || g, 'Zat aktif ' || (g % 700), 'bebas', 'R-' || (g % 60), 10, TRUE
			FROM generate_series(1, 20000) g`,
		`CREATE TEMP TABLE zz_perf_p ON COMMIT DROP AS
			SELECT row_number() OVER (ORDER BY id) AS rn, id FROM products WHERE name LIKE 'ZZ Produk %'`,
		`INSERT INTO product_units (product_id, name, conversion_qty, price, barcode, is_base)
			SELECT id, 'tablet', 1, 1000 + (id % 50) * 100, 'ZZB' || id, TRUE FROM zz_perf_p
			UNION ALL SELECT id, 'strip', 10, 9500 + (id % 50) * 1000, 'ZZS' || id, FALSE FROM zz_perf_p`,
		`INSERT INTO product_batches (product_id, batch_number, expiration_date, quantity, cost_price, source)
			SELECT id, 'ZZ' || id, CURRENT_DATE + (rn % 500)::int, 500, 600, 'purchase' FROM zz_perf_p`,
		`INSERT INTO transactions (invoice_number, till_id, created_by, paid_by, shift_id, status, subtotal, total, paid, "change", payment_method, paid_at, created_at)
			SELECT 'ZZINV' || g, s.till_id, @uid, @uid, s.id, 'paid', 3000, 3000, 5000, 2000, (ARRAY['cash','card','qris'])[1 + g % 3],
				NOW() - (g % 30) * INTERVAL '1 day' - (g % 600) * INTERVAL '1 minute', NOW() - (g % 30) * INTERVAL '1 day'
			FROM generate_series(1, 10000) g, (SELECT id, till_id FROM shifts WHERE user_id = @uid) s`,
		`INSERT INTO transaction_items (transaction_id, product_id, product_unit_id, product_name, unit_name, conversion_qty, drug_class, price, quantity, line_total)
			SELECT t.id, p.id, u.id, 'ZZ Produk', 'tablet', 1, 'bebas', 1000, 1 + k, 1000 * (1 + k)
			FROM transactions t CROSS JOIN generate_series(0, 1) k
			JOIN zz_perf_p p ON p.rn = (t.id * 7 + k * 13) % 20000 + 1
			JOIN product_units u ON u.product_id = p.id AND u.is_base
			WHERE t.invoice_number LIKE 'ZZINV%'`,
		`INSERT INTO transaction_item_batches (transaction_item_id, product_batch_id, quantity, cost_price)
			SELECT i.id, b.id, i.quantity, 600 FROM transaction_items i JOIN transactions t ON t.id = i.transaction_id
			JOIN product_batches b ON b.product_id = i.product_id WHERE t.invoice_number LIKE 'ZZINV%'`,
		`ANALYZE products`, `ANALYZE product_units`, `ANALYZE product_batches`, `ANALYZE transactions`, `ANALYZE transaction_items`, `ANALYZE transaction_item_batches`,
	}
	for _, q := range stmts {
		if err := tx.Exec(strings.ReplaceAll(q, "@uid", strconv.FormatInt(uid, 10))).Error; err != nil {
			t.Fatalf("%v\n%s", err, q)
		}
	}
	t.Logf("data dibuat dalam %s", time.Since(began).Round(time.Millisecond))

	today := time.Now().Format("2006-01-02")
	monthAgo := time.Now().AddDate(0, 0, -29).Format("2006-01-02")
	cases := []struct {
		name, path string
		limit      time.Duration
	}{
		{"scan barcode", "" /* set below */, 300 * time.Millisecond},
		{"cari produk (nama generik)", "/api/products?search=Zat%20aktif%20123&per_page=24", 300 * time.Millisecond},
		{"grid POS halaman 1", "/api/products?per_page=24", 300 * time.Millisecond},
		{"laporan 30 hari", "/api/transactions/summary?start_date=" + monthAgo + "&end_date=" + today, 2 * time.Second},
		{"daftar transaksi 30 hari", "/api/transactions?start_date=" + monthAgo + "&end_date=" + today, 2 * time.Second},
		{"peringatan", "/api/alerts", time.Second},
		{"stok per batch hampir ED", "/api/batches?expiry_status=warning", time.Second},
	}
	var someProduct int64
	tx.Raw(`SELECT id FROM products WHERE name = 'ZZ Produk 12345'`).Scan(&someProduct)
	for _, c := range cases {
		path := c.path
		if c.name == "scan barcode" {
			path = "/api/products/barcode/ZZS" + strconv.FormatInt(someProduct, 10)
		}
		var times []time.Duration
		for i := 0; i < 7; i++ {
			start := time.Now()
			res := do("GET", path, token, nil)
			times = append(times, time.Since(start))
			if res.Code != 200 {
				t.Fatalf("%s: HTTP %d", c.name, res.Code)
			}
		}
		sort.Slice(times, func(i, j int) bool { return times[i] < times[j] })
		median := times[len(times)/2]
		t.Logf("%-28s median %6s  max %6s  (batas %s)", c.name, median.Round(time.Millisecond), times[len(times)-1].Round(time.Millisecond), c.limit)
		if median > c.limit {
			t.Errorf("%s: median %s > %s", c.name, median, c.limit)
		}
	}
}
