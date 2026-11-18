package routes

import (
	"strconv"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func createFullUser(t *testing.T, tx *gorm.DB, username, password string) int64 {
	t.Helper()
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	var id int64
	err := tx.Raw(`INSERT INTO users (username, fullname, password_hash, perm_products, perm_purchases, perm_categories, perm_transactions, perm_users, perm_settings)
		VALUES (?, ?, ?, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE) RETURNING id`, username, username, string(hash)).Scan(&id).Error
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func num(m map[string]any, key string) int64 {
	switch v := m[key].(type) {
	case float64:
		return int64(v)
	case nil:
		return 0
	}
	return -1
}

func id(r apiResp) string { return strconv.FormatInt(num(r.Data, "id"), 10) }

func day(offset int) string { return time.Now().AddDate(0, 0, offset).Format("2006-01-02") }

func mustCode(t *testing.T, name string, got apiResp, want int) apiResp {
	t.Helper()
	if got.Code != want {
		t.Fatalf("%s: got %d, want %d (%v)", name, got.Code, want, got.Data)
	}
	return got
}

func TestStockAndSalesFlow(t *testing.T) {
	tx, do := setup(t)
	createFullUser(t, tx, "zz_apt", "rahasia123")
	token, _ := login(t, do, "zz_apt", "rahasia123")
	var unitIDs []int64

	// ---------------------------------------------------------------- master (F2–F5)
	till := mustCode(t, "till", do("POST", "/api/tills", token, map[string]any{"number": 9911, "name": "Kasir Uji"}), 201)
	tillID := num(till.Data, "id")
	cat := mustCode(t, "category", do("POST", "/api/categories", token, map[string]any{"name": "ZZ Analgesik"}), 201)
	expect(t, "duplicate category", do("POST", "/api/categories", token, map[string]any{"name": "ZZ Analgesik"}), 409)

	productForm := func(name, drugClass, units, track string) *multipartBody {
		return newMultipart(map[string]string{"name": name, "generic_name": "Paracetamol 500 mg", "drug_class": drugClass, "category_id": id(cat),
			"min_stock": "50", "units": units, "track_stock": track, "shelf_location": "ZZ-01"}, "", nil)
	}
	expect(t, "two base units", do("POST", "/api/products", token, productForm("ZZ Salah", "bebas", `[{"name":"tablet","conversion_qty":1,"price":1,"is_base":true},{"name":"strip","conversion_qty":1,"price":1,"is_base":true}]`, "true")), 422)
	expect(t, "base conversion != 1", do("POST", "/api/products", token, productForm("ZZ Salah", "bebas", `[{"name":"strip","conversion_qty":10,"price":1,"is_base":true}]`, "true")), 422)
	prod := mustCode(t, "create product", do("POST", "/api/products", token, productForm("ZZ Paracetamol", "bebas",
		`[{"name":"tablet","conversion_qty":1,"price":1000,"barcode":"ZZ0001","is_base":true},{"name":"strip","conversion_qty":10,"price":9500,"barcode":"ZZ0010"}]`, "true")), 201)
	for _, u := range prod.Data["units"].([]any) {
		unitIDs = append(unitIDs, num(u.(map[string]any), "id"))
	}
	tabletID, stripID := unitIDs[0], unitIDs[1]
	expect(t, "barcode used by another product", do("POST", "/api/products", token, productForm("ZZ Lain", "bebas", `[{"name":"tablet","conversion_qty":1,"price":1,"barcode":"ZZ0010","is_base":true}]`, "true")), 409)
	expect(t, "delete category in use", do("DELETE", "/api/categories/"+id(cat), token, nil), 409)
	bc := mustCode(t, "barcode lookup", do("GET", "/api/products/barcode/ZZ0010", token, nil), 200)
	if num(bc.Data["unit"].(map[string]any), "id") != stripID {
		t.Errorf("barcode ZZ0010 should map to the strip unit")
	}
	expect(t, "unknown barcode", do("GET", "/api/products/barcode/ZZ-TIDAK-ADA", token, nil), 404)

	sup := mustCode(t, "supplier", do("POST", "/api/suppliers", token, map[string]any{"name": "ZZ PBF", "payment_term_days": 30}), 201)
	cust := mustCode(t, "customer", do("POST", "/api/customers", token, map[string]any{"name": "ZZ Pasien", "phone": "0811"}), 201)

	// ---------------------------------------------------------------- penerimaan (F6): weighted average cost
	purchase := func(invoice string, items ...map[string]any) apiResp {
		return do("POST", "/api/purchases", token, map[string]any{"supplier_id": num(sup.Data, "id"), "invoice_number": invoice, "invoice_date": day(0), "items": items})
	}
	item := func(unit int64, qty, cost int, batch string, ed string) map[string]any {
		return map[string]any{"product_unit_id": unit, "quantity": qty, "unit_cost": cost, "batch_number": batch, "expiration_date": ed}
	}
	p1 := mustCode(t, "purchase 1", purchase("ZZ-F1", item(stripID, 2, 9000, "B1", day(200)), item(stripID, 1, 8000, "B2", day(100))), 201)
	if num(p1.Data, "total") != 26000 || p1.Data["due_date"] != day(30) {
		t.Errorf("purchase total/due: %v %v", p1.Data["total"], p1.Data["due_date"])
	}
	mustCode(t, "purchase 2 same batch", purchase("ZZ-F2", item(stripID, 1, 12000, "B1", day(200))), 201)
	expect(t, "duplicate invoice", purchase("ZZ-F1", item(stripID, 1, 1, "B9", day(200))), 409)
	expect(t, "expired item", purchase("ZZ-F3", item(stripID, 1, 1, "B9", day(0))), 422)

	productID := num(prod.Data, "id")
	batchID := func(number string) int64 {
		var bid int64
		tx.Raw("SELECT id FROM product_batches WHERE product_id = ? AND batch_number = ?", productID, number).Scan(&bid)
		return bid
	}
	var b1 struct{ Quantity, CostPrice int64 }
	tx.Raw("SELECT quantity, cost_price FROM product_batches WHERE id = ?", batchID("B1")).Scan(&b1)
	if b1.Quantity != 30 || b1.CostPrice != 1000 {
		t.Errorf("B1 weighted average: got qty %d cost %d, want 30 / 1000", b1.Quantity, b1.CostPrice)
	}
	// An expired batch with stock must never be sold (BR4, BR8).
	tx.Exec(`INSERT INTO product_batches (product_id, batch_number, expiration_date, quantity, cost_price, source) VALUES (?, 'BX', ?, 5, 500, 'opname')`, productID, day(-1))
	pl := mustCode(t, "product list", do("GET", "/api/products?search=ZZ%20Paracetamol", token, nil), 200)
	row := pl.Data["products"].([]any)[0].(map[string]any)
	if num(row, "stock") != 45 || num(row, "sellable_stock") != 40 || row["expiry_status"] != "expired" || row["stock_status"] != "low" {
		t.Errorf("product stock: %v / %v / %v / %v", row["stock"], row["sellable_stock"], row["expiry_status"], row["stock_status"])
	}

	// ---------------------------------------------------------------- shift & checkout (F9–F11)
	cart := func(lines ...[2]int64) []map[string]any {
		out := []map[string]any{}
		for _, l := range lines {
			out = append(out, map[string]any{"product_unit_id": l[0], "quantity": l[1]})
		}
		return out
	}
	pay := func(method string, paid int64) map[string]any { return map[string]any{"method": method, "paid": paid} }
	expect(t, "checkout without shift", do("POST", "/api/transactions", token, map[string]any{"status": "paid", "till_id": tillID, "items": cart([2]int64{tabletID, 1}), "payment": pay("cash", 1000)}), 409)
	mustCode(t, "open shift", do("POST", "/api/shifts/open", token, map[string]any{"till_id": tillID, "opening_cash": 100000}), 201)
	expect(t, "second shift", do("POST", "/api/shifts/open", token, map[string]any{"till_id": tillID, "opening_cash": 0}), 409)

	tx1 := mustCode(t, "checkout", do("POST", "/api/transactions", token, map[string]any{
		"status": "paid", "till_id": tillID, "items": cart([2]int64{stripID, 1}, [2]int64{tabletID, 5}), "discount": 500,
		"payment": pay("cash", 20000), "price": 1, "total": 1,
	}), 201)
	if num(tx1.Data, "subtotal") != 14500 || num(tx1.Data, "total") != 14000 || num(tx1.Data, "change") != 6000 {
		t.Errorf("totals: %v %v %v", tx1.Data["subtotal"], tx1.Data["total"], tx1.Data["change"])
	}
	if inv, _ := tx1.Data["invoice_number"].(string); inv != "INV/"+time.Now().Format("20060102")+"/9911/0001" {
		t.Errorf("invoice number: %v", tx1.Data["invoice_number"])
	}
	items := tx1.Data["items"].([]any)
	strip := items[0].(map[string]any)
	if num(strip, "discount_share") != 328 || num(items[1].(map[string]any), "discount_share") != 172 {
		t.Errorf("discount split: %v / %v", strip["discount_share"], items[1].(map[string]any)["discount_share"])
	}
	// FEFO: the strip (10 tablets) drains B2 (nearest ED), the 5 tablets come from B1; BX (expired) untouched.
	stripBatches := strip["batches"].([]any)
	if len(stripBatches) != 1 || num(stripBatches[0].(map[string]any), "product_batch_id") != batchID("B2") {
		t.Errorf("strip should come from B2: %v", stripBatches)
	}
	tabletBatch := items[1].(map[string]any)["batches"].([]any)[0].(map[string]any)
	if num(tabletBatch, "product_batch_id") != batchID("B1") || num(tabletBatch, "cost_price") != 1000 {
		t.Errorf("tablets should come from B1 at cost 1000: %v", tabletBatch)
	}
	expect(t, "not enough stock", do("POST", "/api/transactions", token, map[string]any{"status": "paid", "till_id": tillID, "items": cart([2]int64{stripID, 5}), "payment": pay("cash", 100000)}), 422)
	expect(t, "cash below total", do("POST", "/api/transactions", token, map[string]any{"status": "paid", "till_id": tillID, "items": cart([2]int64{tabletID, 1}), "payment": pay("cash", 999)}), 422)
	expect(t, "discount >= subtotal", do("POST", "/api/transactions", token, map[string]any{"status": "paid", "till_id": tillID, "items": cart([2]int64{tabletID, 1}), "discount": 1000, "payment": pay("cash", 0)}), 422)

	// narkotika needs patient + prescription (BR4)
	nark := mustCode(t, "narkotika product", do("POST", "/api/products", token, productForm("ZZ Kodein", "narkotika", `[{"name":"tablet","conversion_qty":1,"price":2000,"is_base":true}]`, "false")), 201)
	narkUnit := num(nark.Data["units"].([]any)[0].(map[string]any), "id")
	expect(t, "narkotika without prescription", do("POST", "/api/transactions", token, map[string]any{"status": "paid", "till_id": tillID, "items": cart([2]int64{narkUnit, 1}), "payment": pay("qris", 0)}), 422)
	nk := mustCode(t, "narkotika with prescription", do("POST", "/api/transactions", token, map[string]any{"status": "paid", "till_id": tillID, "items": cart([2]int64{narkUnit, 1}),
		"customer_id": num(cust.Data, "id"), "prescription_number": "R/123", "payment": pay("qris", 0)}), 201)
	if num(nk.Data, "paid") != 2000 {
		t.Errorf("non-cash pays exactly the total: %v", nk.Data["paid"])
	}

	// ---------------------------------------------------------------- held order (F12)
	expect(t, "hold without ref or customer", do("POST", "/api/transactions", token, map[string]any{"status": "held", "till_id": tillID, "items": cart([2]int64{tabletID, 2})}), 422)
	held := mustCode(t, "hold", do("POST", "/api/transactions", token, map[string]any{"status": "held", "till_id": tillID, "items": cart([2]int64{tabletID, 2}), "ref_number": "ZZ-MEJA-1"}), 201)
	if held.Data["invoice_number"] != nil || held.Data["status"] != "held" {
		t.Errorf("held order must not have an invoice yet: %v", held.Data["invoice_number"])
	}
	var sellable int64
	stock := func() int64 {
		tx.Raw("SELECT COALESCE(SUM(quantity), 0) FROM product_batches WHERE product_id = ? AND expiration_date > CURRENT_DATE", productID).Scan(&sellable)
		return sellable
	}
	if stock() != 25 {
		t.Errorf("stock after checkout and hold: %d, want 25", sellable)
	}
	heldList := mustCode(t, "held list", do("GET", "/api/transactions/held?type=tab&search=ZZ-MEJA", token, nil), 200)
	if num(heldList.Data["pagination"].(map[string]any), "total") != 1 {
		t.Errorf("held list: %v", heldList.Data)
	}
	mustCode(t, "pay held", do("POST", "/api/transactions/"+id(held)+"/pay", token, map[string]any{"payment": pay("card", 0)}), 200)
	if stock() != 23 {
		t.Errorf("paying a held order must reduce stock: %d, want 23", sellable)
	}
	expect(t, "pay held twice", do("POST", "/api/transactions/"+id(held)+"/pay", token, map[string]any{"payment": pay("card", 0)}), 409)
	expect(t, "delete paid", do("DELETE", "/api/transactions/"+id(held), token, nil), 409)

	// ---------------------------------------------------------------- returns (F14, BR10)
	stripItemID := num(strip, "id")
	ret := func(qty int, restock bool) apiResp {
		return do("POST", "/api/transactions/"+id(tx1)+"/returns", token, map[string]any{"reason": "salah obat", "refund_method": "cash",
			"items": []map[string]any{{"transaction_item_id": stripItemID, "base_quantity": qty, "restock": restock}}})
	}
	r1 := mustCode(t, "return 4", ret(4, true), 201)
	if num(r1.Data, "total_refund") != 3669 {
		t.Errorf("partial refund: %v, want 3669", r1.Data["total_refund"])
	}
	r2 := mustCode(t, "return rest", ret(6, false), 201)
	if num(r2.Data, "total_refund") != 5503 {
		t.Errorf("last refund takes the remainder: %v, want 5503", r2.Data["total_refund"])
	}
	expect(t, "return beyond sold", ret(1, true), 422)
	var b2qty int64
	tx.Raw("SELECT quantity FROM product_batches WHERE id = ?", batchID("B2")).Scan(&b2qty)
	if b2qty != 4 {
		t.Errorf("restocked qty back to B2: %d, want 4", b2qty)
	}
	expect(t, "void after return", do("POST", "/api/transactions/"+id(tx1)+"/void", token, map[string]any{"reason": "x"}), 409)

	tx3 := mustCode(t, "checkout to void", do("POST", "/api/transactions", token, map[string]any{"status": "paid", "till_id": tillID, "items": cart([2]int64{tabletID, 3}), "payment": pay("cash", 3000)}), 201)
	before := stock()
	mustCode(t, "void", do("POST", "/api/transactions/"+id(tx3)+"/void", token, map[string]any{"reason": "batal beli"}), 200)
	if stock() != before+3 {
		t.Errorf("void must restore stock: %d -> %d", before, sellable)
	}

	// ---------------------------------------------------------------- report vs manual SQL (M8-5)
	sum := mustCode(t, "summary", do("GET", "/api/transactions/summary?till_id="+strconv.FormatInt(tillID, 10)+"&start_date="+day(0)+"&end_date="+day(0), token, nil), 200)
	var manual struct{ Gross, Returns, Cogs, Count int64 }
	tx.Raw(`SELECT
		(SELECT COALESCE(SUM(total), 0) FROM transactions WHERE till_id = ? AND status = 'paid') AS gross,
		(SELECT COALESCE(SUM(sr.total_refund), 0) FROM sales_returns sr JOIN transactions t ON t.id = sr.transaction_id WHERE t.till_id = ? AND t.status = 'paid') AS returns,
		(SELECT COALESCE(SUM(b.quantity * b.cost_price), 0) FROM transaction_item_batches b JOIN transaction_items i ON i.id = b.transaction_item_id JOIN transactions t ON t.id = i.transaction_id WHERE t.till_id = ? AND t.status = 'paid')
		 - (SELECT COALESCE(SUM(ri.cost_amount), 0) FROM sales_return_items ri JOIN sales_returns sr ON sr.id = ri.sales_return_id JOIN transactions t ON t.id = sr.transaction_id WHERE t.till_id = ? AND t.status = 'paid' AND ri.restock) AS cogs,
		(SELECT COUNT(*) FROM transactions WHERE till_id = ? AND status = 'paid') AS count`, tillID, tillID, tillID, tillID, tillID).Scan(&manual)
	got := sum.Data
	if num(got, "gross_sales") != manual.Gross || num(got, "returns") != manual.Returns || num(got, "cogs") != manual.Cogs || num(got, "transaction_count") != manual.Count {
		t.Errorf("summary %v/%v/%v/%v != manual %+v", got["gross_sales"], got["returns"], got["cogs"], got["transaction_count"], manual)
	}
	if num(got, "net_sales") != manual.Gross-manual.Returns || num(got, "gross_profit") != manual.Gross-manual.Returns-manual.Cogs {
		t.Errorf("net/profit: %v %v", got["net_sales"], got["gross_profit"])
	}
	// 14000 + 2000 (narkotika) + 2000 (held, card) = 18000; voided sale excluded.
	if manual.Gross != 18000 || manual.Returns != 9172 {
		t.Errorf("fixture totals changed: %+v", manual)
	}

	// ---------------------------------------------------------------- opname (F8): diff against stock at posting
	op := mustCode(t, "create opname", do("POST", "/api/stock-opnames", token, map[string]any{"category_id": num(cat.Data, "id")}), 201)
	opItems := op.Data["items"].([]any)
	if len(opItems) != 3 { // B1, B2, BX
		t.Fatalf("opname items: %d, want 3", len(opItems))
	}
	var b1Item int64
	for _, it := range opItems {
		m := it.(map[string]any)
		if m["batch_number"] == "B1" {
			b1Item = num(m, "id")
		}
	}
	// A sale after the session was created: system qty at posting must include it.
	mustCode(t, "sale during opname", do("POST", "/api/transactions", token, map[string]any{"status": "paid", "till_id": tillID, "items": cart([2]int64{tabletID, 4}), "payment": pay("cash", 4000)}), 201)
	var b1Now int64
	tx.Raw("SELECT quantity FROM product_batches WHERE id = ?", batchID("B1")).Scan(&b1Now)
	mustCode(t, "count opname", do("PUT", "/api/stock-opnames/"+id(op)+"/items", token, map[string]any{
		"items":     []map[string]any{{"id": b1Item, "counted_quantity": 10}},
		"new_items": []map[string]any{{"product_id": productID, "batch_number": "B-NEW", "expiration_date": day(300), "cost_price": 950, "counted_quantity": 7}},
	}), 200)
	posted := mustCode(t, "post opname", do("POST", "/api/stock-opnames/"+id(op)+"/post", token, nil), 200)
	for _, it := range posted.Data["items"].([]any) {
		m := it.(map[string]any)
		if m["batch_number"] == "B1" && num(m, "difference") != 10-b1Now {
			t.Errorf("opname diff for B1: %v, want %d", m["difference"], 10-b1Now)
		}
	}
	var newQty int64
	tx.Raw("SELECT quantity FROM product_batches WHERE id = ?", batchID("B-NEW")).Scan(&newQty)
	if newQty != 7 {
		t.Errorf("new batch from opname: %d, want 7", newQty)
	}
	expect(t, "post twice", do("POST", "/api/stock-opnames/"+id(op)+"/post", token, nil), 409)

	// ---------------------------------------------------------------- adjustment & payables
	expect(t, "adjust below zero", do("POST", "/api/batches/"+strconv.FormatInt(batchID("BX"), 10)+"/adjustment", token, map[string]any{"quantity": -6, "reason": "expired", "note": "musnah"}), 422)
	mustCode(t, "adjust expired", do("POST", "/api/batches/"+strconv.FormatInt(batchID("BX"), 10)+"/adjustment", token, map[string]any{"quantity": -5, "reason": "expired", "note": "musnah"}), 200)
	payables := mustCode(t, "payables", do("GET", "/api/purchases/payables?supplier_id="+id(sup), token, nil), 200)
	if num(payables.Data["summary"].(map[string]any), "unpaid_total") != 38000 {
		t.Errorf("unpaid total: %v", payables.Data["summary"])
	}
	mustCode(t, "mark paid", do("POST", "/api/purchases/"+id(p1)+"/mark-paid", token, map[string]any{"paid_at": day(0), "payment_note": "transfer"}), 200)
	expect(t, "mark paid twice", do("POST", "/api/purchases/"+id(p1)+"/mark-paid", token, map[string]any{"paid_at": day(0)}), 409)
	mustCode(t, "alerts", do("GET", "/api/alerts", token, nil), 200)
	mustCode(t, "batch list", do("GET", "/api/batches?product_id="+strconv.FormatInt(productID, 10), token, nil), 200)
	mustCode(t, "movements", do("GET", "/api/products/"+strconv.FormatInt(productID, 10)+"/stock-movements", token, nil), 200)
	mustCode(t, "transactions list", do("GET", "/api/transactions?start_date="+day(0), token, nil), 200)
	mustCode(t, "returns list", do("GET", "/api/sales-returns", token, nil), 200)
	expect(t, "delete product with stock", do("DELETE", "/api/products/"+strconv.FormatInt(productID, 10), token, nil), 409)

	// ---------------------------------------------------------------- close shift (F9, BR12)
	cur := mustCode(t, "current shift", do("GET", "/api/shifts/current", token, nil), 200)
	closed := mustCode(t, "close shift", do("POST", "/api/shifts/"+id(cur)+"/close", token, map[string]any{"counted_cash": 100000}), 200)
	// opening 100000 + cash sales (14000 + 4000; voided 3000 excluded) − cash refunds 9172
	if num(closed.Data, "expected_cash") != 108828 || num(closed.Data, "cash_difference") != 100000-108828 {
		t.Errorf("expected cash %v diff %v", closed.Data["expected_cash"], closed.Data["cash_difference"])
	}
	expect(t, "close twice", do("POST", "/api/shifts/"+id(cur)+"/close", token, map[string]any{"counted_cash": 1}), 409)
	expect(t, "void after shift closed", do("POST", "/api/transactions/"+id(nk)+"/void", token, map[string]any{"reason": "x"}), 409)

	// ---------------------------------------------------------------- what a cashier may read (M9-1)
	held2 := mustCode(t, "hold for cashier", do("POST", "/api/transactions", token, map[string]any{"status": "held", "till_id": tillID, "items": cart([2]int64{tabletID, 1}), "ref_number": "ZZ-TAB-2"}), 201)
	createUser(t, tx, "zz_kasir3", "rahasia123", false)
	kasir, _ := login(t, do, "zz_kasir3", "rahasia123")
	productPath := "/api/products/" + strconv.FormatInt(productID, 10)
	expect(t, "cashier: someone else's sale", do("GET", "/api/transactions/"+id(tx1), kasir, nil), 403)
	expect(t, "cashier: held order", do("GET", "/api/transactions/"+id(held2), kasir, nil), 200)
	expect(t, "cashier: return detail", do("GET", "/api/sales-returns/"+id(r1), kasir, nil), 403)
	expect(t, "manager: return detail", do("GET", "/api/sales-returns/"+id(r1), token, nil), 200)
	if b, _ := mustCode(t, "cashier: product detail", do("GET", productPath, kasir, nil), 200).Data["batches"].([]any); len(b) != 0 {
		t.Errorf("cashier sees %d batches (cost price)", len(b))
	}
	if b, _ := mustCode(t, "manager: product detail", do("GET", productPath, token, nil), 200).Data["batches"].([]any); len(b) == 0 {
		t.Error("perm_products should see batches")
	}
}

func TestPermissionsOnNewRoutes(t *testing.T) {
	tx, do := setup(t)
	createUser(t, tx, "zz_kasir2", "rahasia123", false)
	token, _ := login(t, do, "zz_kasir2", "rahasia123")
	expect(t, "products readable", do("GET", "/api/products", token, nil), 200)
	expect(t, "categories readable", do("GET", "/api/categories?all=1", token, nil), 200)
	expect(t, "customers", do("GET", "/api/customers", token, nil), 200)
	expect(t, "alerts", do("GET", "/api/alerts", token, nil), 200)
	expect(t, "held list", do("GET", "/api/transactions/held", token, nil), 200)
	expect(t, "own shifts", do("GET", "/api/shifts", token, nil), 200)
	for _, path := range []string{"/api/batches", "/api/stock-opnames", "/api/suppliers", "/api/purchases", "/api/purchases/payables", "/api/transactions", "/api/transactions/summary", "/api/sales-returns", "/api/products/export"} {
		expect(t, "forbidden "+path, do("GET", path, token, nil), 403)
	}
	expect(t, "create category", do("POST", "/api/categories", token, map[string]any{"name": "x"}), 403)
	expect(t, "void", do("POST", "/api/transactions/1/void", token, map[string]any{"reason": "x"}), 403)
}
