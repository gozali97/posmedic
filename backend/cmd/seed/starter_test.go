package main

import (
	"os"
	"testing"

	"github.com/joho/godotenv"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"pos-apotek-api/config"
)

// TestStarterIdempotent runs the starter seed twice inside a rolled-back transaction.
func TestStarterIdempotent(t *testing.T) {
	_ = godotenv.Load("../../.env")
	if os.Getenv("DB_NAME") == "" {
		t.Skip("DB_NAME kosong, tes integrasi dilewati")
	}
	if err := config.ConnectDatabase(); err != nil {
		t.Skipf("database tidak tersedia: %v", err)
	}
	tx := config.GetDB().Session(&gorm.Session{Logger: logger.Discard}).Begin()
	defer tx.Rollback()

	// Start from a store without these names (the dev DB may hold demo data with the same catalogue).
	if err := tx.Exec(`UPDATE products SET deleted_at = NOW() WHERE deleted_at IS NULL`).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec(`UPDATE categories SET name = 'zz_' || id || '_' || name`).Error; err != nil {
		t.Fatal(err)
	}
	count := func(q string) int64 {
		var n int64
		tx.Raw(q).Scan(&n)
		return n
	}
	before := count(`SELECT COUNT(*) FROM product_units`)

	if err := seedStarter(tx); err != nil {
		t.Fatal(err)
	}
	if n := count(`SELECT COUNT(*) FROM products WHERE deleted_at IS NULL`); n != int64(len(productDefs)) {
		t.Errorf("products = %d, want %d", n, len(productDefs))
	}
	if n := count(`SELECT COUNT(*) FROM categories WHERE name NOT LIKE 'zz\_%'`); n != int64(len(categoryNames)) {
		t.Errorf("categories = %d, want %d", n, len(categoryNames))
	}
	units := count(`SELECT COUNT(*) FROM product_units`) - before
	if count(`SELECT COUNT(*) FROM product_units u JOIN products p ON p.id = u.product_id WHERE p.deleted_at IS NULL AND u.barcode IS NOT NULL`) != 0 {
		t.Error("starter must not invent barcodes")
	}
	if count(`SELECT COUNT(*) FROM product_batches b JOIN products p ON p.id = b.product_id WHERE p.deleted_at IS NULL`) != 0 {
		t.Error("starter must not create stock")
	}

	if err := seedStarter(tx); err != nil {
		t.Fatal(err)
	}
	if n := count(`SELECT COUNT(*) FROM product_units`) - before; n != units {
		t.Errorf("second run added units: %d → %d", units, n)
	}
}
