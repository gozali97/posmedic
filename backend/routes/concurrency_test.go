package routes

import (
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"pos-apotek-api/config"
	"pos-apotek-api/services"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Two tills sell the last unit at the same moment: exactly one must succeed (BR1, M6-5).
// Unlike the other tests this needs committed rows, so it creates its own fixture and deletes it afterwards.
func TestParallelCheckoutLastStock(t *testing.T) {
	_ = godotenv.Load("../.env")
	if os.Getenv("DB_NAME") == "" {
		t.Skip("DB_NAME kosong, tes integrasi dilewati")
	}
	if err := config.ConnectDatabase(); err != nil {
		t.Skipf("database tidak tersedia: %v", err)
	}
	db := config.GetDB()

	var userIDs, tillIDs []uint64
	var productID, unitID uint64
	hash, _ := bcrypt.GenerateFromPassword([]byte("rahasia123"), bcrypt.MinCost)
	err := db.Transaction(func(tx *gorm.DB) error {
		for i, name := range []string{"zz_par_a", "zz_par_b"} {
			var uid, tid uint64
			if err := tx.Raw("INSERT INTO users (username, fullname, password_hash) VALUES (?, ?, ?) RETURNING id", name, name, string(hash)).Scan(&uid).Error; err != nil {
				return err
			}
			if err := tx.Raw("INSERT INTO tills (number, name) VALUES (?, ?) RETURNING id", 9921+i, name).Scan(&tid).Error; err != nil {
				return err
			}
			if err := tx.Exec("INSERT INTO shifts (user_id, till_id, opening_cash) VALUES (?, ?, 0)", uid, tid).Error; err != nil {
				return err
			}
			userIDs, tillIDs = append(userIDs, uid), append(tillIDs, tid)
		}
		if err := tx.Raw("INSERT INTO products (name, drug_class) VALUES ('ZZ Stok Terakhir', 'bebas') RETURNING id").Scan(&productID).Error; err != nil {
			return err
		}
		if err := tx.Raw("INSERT INTO product_units (product_id, name, conversion_qty, price, is_base) VALUES (?, 'tablet', 1, 1000, TRUE) RETURNING id", productID).Scan(&unitID).Error; err != nil {
			return err
		}
		return tx.Exec("INSERT INTO product_batches (product_id, batch_number, expiration_date, quantity, cost_price, source) VALUES (?, 'LAST', ?, 1, 500, 'opname')",
			productID, time.Now().AddDate(0, 0, 100).Format("2006-01-02")).Error
	})
	if err != nil {
		t.Fatalf("fixture: %v", err)
	}
	t.Cleanup(func() {
		steps := []string{
			"DELETE FROM stock_movements WHERE product_id = @p",
			"DELETE FROM transaction_item_batches WHERE transaction_item_id IN (SELECT id FROM transaction_items WHERE product_id = @p)",
			"DELETE FROM transaction_items WHERE product_id = @p",
			"DELETE FROM transactions WHERE till_id IN @t",
			"DELETE FROM document_sequences WHERE till_id IN @t",
			"DELETE FROM audit_logs WHERE user_id IN @u",
			"DELETE FROM shifts WHERE till_id IN @t",
			"DELETE FROM product_batches WHERE product_id = @p",
			"DELETE FROM product_units WHERE product_id = @p",
			"DELETE FROM products WHERE id = @p",
			"DELETE FROM tills WHERE id IN @t",
			"DELETE FROM users WHERE id IN @u",
		}
		args := map[string]any{"p": productID, "t": tillIDs, "u": userIDs}
		for _, s := range steps {
			if err := db.Exec(s, args).Error; err != nil {
				t.Errorf("cleanup %q: %v", s, err)
			}
		}
	})

	var wg sync.WaitGroup
	errs := make([]error, 2)
	start := make(chan struct{})
	for i := range 2 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			errs[i] = db.Transaction(func(tx *gorm.DB) error {
				_, err := services.Checkout(tx, userIDs[i], services.CartInput{TillID: tillIDs[i], Items: []services.CartLine{{ProductUnitID: unitID, Quantity: 1}}},
					services.PaymentInput{Method: "cash", Paid: 1000}, "127.0.0.1")
				return err
			})
		}(i)
	}
	close(start)
	wg.Wait()

	succeeded := 0
	for _, err := range errs {
		var biz *services.BizError
		switch {
		case err == nil:
			succeeded++
		case errors.As(err, &biz) && biz.Status == 422:
			// expected: stock no longer enough
		default:
			t.Errorf("unexpected error: %v", err)
		}
	}
	if succeeded != 1 {
		t.Fatalf("exactly one checkout must succeed, got %d (%v)", succeeded, errs)
	}
	var left int
	db.Raw("SELECT quantity FROM product_batches WHERE product_id = ?", productID).Scan(&left)
	if left != 0 {
		t.Fatalf("batch quantity after race: %d, want 0", left)
	}
}
