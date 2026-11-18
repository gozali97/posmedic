package main

import (
	"gorm.io/gorm"
)

// resetDemo deletes every demo row and everything that references it (e.g. a sale an admin made with a demo
// product), in foreign-key order. The admin user, store settings and non-demo master data stay.
func resetDemo(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		ids := func(entity string) string {
			return "(SELECT entity_id FROM demo_seed WHERE entity = '" + entity + "')"
		}
		U, T, P, C, S, K := ids("users"), ids("tills"), ids("products"), ids("customers"), ids("suppliers"), ids("categories")
		X := `(SELECT id FROM transactions WHERE till_id IN ` + T + ` OR created_by IN ` + U + ` OR paid_by IN ` + U + ` OR voided_by IN ` + U +
			` OR customer_id IN ` + C + ` OR id IN (SELECT transaction_id FROM transaction_items WHERE product_id IN ` + P + `))`
		R := `(SELECT id FROM sales_returns WHERE transaction_id IN ` + X + ` OR user_id IN ` + U + ` OR till_id IN ` + T + `)`
		stmts := []string{
			`DELETE FROM sales_return_items WHERE sales_return_id IN ` + R,
			`DELETE FROM sales_returns WHERE id IN ` + R,
			`DELETE FROM transactions WHERE id IN ` + X, // items and item batches cascade
			`DELETE FROM shifts WHERE user_id IN ` + U + ` OR till_id IN ` + T,
			`DELETE FROM stock_opname_items WHERE product_id IN ` + P,
			`DELETE FROM stock_opnames WHERE user_id IN ` + U + ` OR posted_by IN ` + U + ` OR category_id IN ` + K,
			`DELETE FROM stock_movements WHERE product_id IN ` + P + ` OR user_id IN ` + U,
			`DELETE FROM purchases WHERE supplier_id IN ` + S + ` OR user_id IN ` + U + ` OR id IN (SELECT purchase_id FROM purchase_items WHERE product_id IN ` + P + `)`,
			`DELETE FROM product_batches WHERE product_id IN ` + P,
			`DELETE FROM products WHERE id IN ` + P, // units cascade
			`UPDATE products SET category_id = NULL WHERE category_id IN ` + K,
			`DELETE FROM categories WHERE id IN ` + K,
			`DELETE FROM customers WHERE id IN ` + C,
			`DELETE FROM suppliers WHERE id IN ` + S,
			`DELETE FROM document_sequences WHERE till_id IN ` + T,
			// Opname numbers have no till: drop counters of days that no longer have any opname.
			`DELETE FROM document_sequences d WHERE d.prefix = 'OPN' AND NOT EXISTS (SELECT 1 FROM stock_opnames o WHERE o.opname_number LIKE 'OPN/' || to_char(d.seq_date, 'YYYYMMDD') || '/%')`,
			`DELETE FROM audit_logs WHERE user_id IN ` + U,
			`DELETE FROM tills WHERE id IN ` + T,
			`DELETE FROM users WHERE id IN ` + U,
			`DELETE FROM demo_seed`,
		}
		for _, q := range stmts {
			if err := tx.Exec(q).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
