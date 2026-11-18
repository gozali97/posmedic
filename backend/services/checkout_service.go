package services

import (
	"errors"
	"math/bits"
	"sort"
	"strings"

	"pos-apotek-api/helpers"
	"pos-apotek-api/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type CartLine struct {
	ProductUnitID uint64
	Quantity      int
}

// CartInput is what the client may decide. Prices, totals, tax and cost always come from the database (BR2).
type CartInput struct {
	TillID             uint64
	Items              []CartLine
	Discount           int64
	CustomerID         *uint64
	RefNumber          string
	PrescriptionNumber string
	PrescriptionNote   string
}

type PaymentInput struct {
	Method string
	Paid   int64
	Info   string
}

type pricedCart struct {
	items     []models.TransactionItem
	products  map[uint64]models.Product
	baseNames map[uint64]string
	subtotal  int64
	discount  int64
	total     int64
}

// splitDiscount spreads the transaction discount over lines in proportion to line totals (BR10).
// Floors first, then hands the leftover rupiah to the lines with the largest remainders, so no line gets more than its total.
func splitDiscount(discount int64, lineTotals []int64, subtotal int64) []int64 {
	shares := make([]int64, len(lineTotals))
	if discount <= 0 || subtotal <= 0 {
		return shares
	}
	rems := make([]int64, len(lineTotals))
	var sum int64
	for i, lt := range lineTotals {
		high, low := bits.Mul64(uint64(discount), uint64(lt))
		share, remainder := bits.Div64(high, low, uint64(subtotal))
		shares[i], rems[i] = int64(share), int64(remainder)
		sum += shares[i]
	}
	idx := make([]int, len(lineTotals))
	for i := range idx {
		idx[i] = i
	}
	sort.SliceStable(idx, func(a, b int) bool {
		if rems[idx[a]] != rems[idx[b]] {
			return rems[idx[a]] > rems[idx[b]]
		}
		return idx[a] > idx[b] // ties go to the later line
	})
	for k := int64(0); k < discount-sum; k++ {
		shares[idx[k]]++
	}
	return shares
}

// priceCart snapshots names and prices from the database and computes totals (BR2, BR3, BR9, BR10).
func priceCart(tx *gorm.DB, lines []CartLine, discount int64) (*pricedCart, error) {
	if len(lines) == 0 {
		return nil, invalid("Keranjang kosong")
	}
	// The same unit twice becomes one line.
	merged := []CartLine{}
	pos := map[uint64]int{}
	for _, l := range lines {
		if l.Quantity <= 0 {
			return nil, invalid("Qty harus lebih dari 0")
		}
		if i, ok := pos[l.ProductUnitID]; ok {
			merged[i].Quantity += l.Quantity
			continue
		}
		pos[l.ProductUnitID] = len(merged)
		merged = append(merged, l)
	}
	ids := make([]uint64, len(merged))
	for i, l := range merged {
		ids[i] = l.ProductUnitID
	}
	units, products, err := loadUnits(tx, ids)
	if err != nil {
		return nil, err
	}

	productIDs := make([]uint64, 0, len(products))
	for id := range products {
		productIDs = append(productIDs, id)
	}
	var bases []models.ProductUnit
	if err := tx.Where("product_id IN ? AND is_base AND deleted_at IS NULL", productIDs).Find(&bases).Error; err != nil {
		return nil, err
	}
	baseNames := map[uint64]string{}
	for _, b := range bases {
		baseNames[b.ProductID] = b.Name
	}

	pc := &pricedCart{products: products, baseNames: baseNames, discount: discount}
	lineTotals := make([]int64, len(merged))
	for i, l := range merged {
		u := units[l.ProductUnitID]
		p := products[u.ProductID]
		lt := u.Price * int64(l.Quantity)
		lineTotals[i] = lt
		pc.subtotal += lt
		pc.items = append(pc.items, models.TransactionItem{
			ProductID: p.ID, ProductUnitID: u.ID, ProductName: p.Name, UnitName: u.Name, ConversionQty: u.ConversionQty,
			DrugClass: p.DrugClass, Price: u.Price, Quantity: l.Quantity, LineTotal: lt,
		})
	}
	if discount < 0 {
		return nil, invalid("Diskon tidak boleh negatif")
	}
	if discount > 0 && discount >= pc.subtotal {
		return nil, invalid("Diskon harus lebih kecil dari subtotal")
	}
	for i, s := range splitDiscount(discount, lineTotals, pc.subtotal) {
		pc.items[i].DiscountShare = s
	}
	pc.total = pc.subtotal - discount
	return pc, nil
}

func taxRate(tx *gorm.DB) (rate float64, err error) {
	var s models.StoreSetting
	err = tx.Select("is_pkp", "ppn_rate").First(&s, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, nil
	}
	if err != nil || !s.IsPkp {
		return 0, err
	}
	return s.PpnRate, nil
}

func checkCustomer(tx *gorm.DB, id *uint64) error {
	if id == nil {
		return nil
	}
	var n int64
	if err := tx.Model(&models.Customer{}).Where("id = ?", *id).Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return invalid("Pelanggan tidak ditemukan")
	}
	return nil
}

// lockOpenShift returns the actor's open shift, locked so it cannot be closed mid-checkout.
func lockOpenShift(tx *gorm.DB, userID uint64) (*models.Shift, error) {
	var s models.Shift
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND status = 'open'", userID).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, conflict("Buka shift terlebih dahulu")
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

type allocation struct {
	itemIndex int
	batch     *models.ProductBatch
	qty       int
}

// allocateFEFO picks batches for every tracked line: nearest unexpired ED first, then oldest batch (BR8).
// Candidate batches are locked in id order before any decision (BR1).
func allocateFEFO(tx *gorm.DB, pc *pricedCart) ([]allocation, error) {
	tracked := []uint64{}
	for id, p := range pc.products {
		if p.TrackStock {
			tracked = append(tracked, id)
		}
	}
	if len(tracked) == 0 {
		return nil, nil
	}
	var batches []models.ProductBatch
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("product_id IN ? AND quantity > 0 AND expiration_date > ?", tracked, helpers.Today()).
		Order("id").Find(&batches).Error
	if err != nil {
		return nil, err
	}
	byProduct := map[uint64][]*models.ProductBatch{}
	for i := range batches {
		b := &batches[i]
		byProduct[b.ProductID] = append(byProduct[b.ProductID], b)
	}
	for _, list := range byProduct {
		sort.SliceStable(list, func(a, b int) bool {
			x, y := list[a], list[b]
			if !x.ExpirationDate.Equal(y.ExpirationDate.Time) {
				return x.ExpirationDate.Before(y.ExpirationDate.Time)
			}
			if !x.CreatedAt.Equal(y.CreatedAt) {
				return x.CreatedAt.Before(y.CreatedAt)
			}
			return x.ID < y.ID
		})
	}

	// Check every product first so the message reports the full need, not a partial one.
	need := map[uint64]int{}
	for _, it := range pc.items {
		if pc.products[it.ProductID].TrackStock {
			need[it.ProductID] += it.BaseQuantity()
		}
	}
	for pid, n := range need {
		have := 0
		for _, b := range byProduct[pid] {
			have += b.Quantity
		}
		if n > have {
			return nil, invalid("Stok %s tidak cukup: butuh %d %s, tersedia %d", pc.products[pid].Name, n, pc.baseNames[pid], have)
		}
	}

	left := map[uint64]int{}
	for _, b := range batches {
		left[b.ID] = b.Quantity
	}
	var out []allocation
	for i, it := range pc.items {
		if !pc.products[it.ProductID].TrackStock {
			continue
		}
		rest := it.BaseQuantity()
		for _, b := range byProduct[it.ProductID] {
			if rest == 0 {
				break
			}
			take := min(rest, left[b.ID])
			if take == 0 {
				continue
			}
			left[b.ID] -= take
			rest -= take
			out = append(out, allocation{itemIndex: i, batch: b, qty: take})
		}
	}
	return out, nil
}

func validatePrescription(pc *pricedCart, customerID *uint64, prescription string) error {
	for _, it := range pc.items {
		if models.NeedsPrescription(it.DrugClass) && (customerID == nil || strings.TrimSpace(prescription) == "") {
			return invalid("%s golongan %s: wajib pilih pasien dan isi no. resep", it.ProductName, it.DrugClass)
		}
	}
	return nil
}

func applyPayment(t *models.Transaction, p PaymentInput) error {
	if !models.ValidPaymentMethod(p.Method) {
		return invalid("Metode bayar harus cash, card, atau qris")
	}
	if p.Method == "cash" {
		if p.Paid < t.Total {
			return invalid("Uang dibayar kurang dari total")
		}
		t.Paid, t.Change = p.Paid, p.Paid-t.Total
	} else {
		// No partial or split payment (F11): non-cash pays the exact total.
		t.Paid, t.Change = t.Total, 0
	}
	method := p.Method
	t.PaymentMethod, t.PaymentInfo = &method, optStr(p.Info)
	return nil
}

func (pc *pricedCart) applyTo(t *models.Transaction, rate float64) {
	t.Subtotal, t.Discount, t.Total = pc.subtotal, pc.discount, pc.total
	t.Dpp, t.Ppn = helpers.SplitTax(pc.total, helpers.RateBasisPoints(rate))
	t.PpnRate = rate
}

func replaceItems(tx *gorm.DB, t *models.Transaction, items []models.TransactionItem) error {
	if err := tx.Where("transaction_id = ?", t.ID).Delete(&models.TransactionItem{}).Error; err != nil {
		return err
	}
	for i := range items {
		items[i].ID = 0
		items[i].TransactionID = t.ID
	}
	if err := tx.Create(&items).Error; err != nil {
		return err
	}
	t.Items = items
	return nil
}

// settle turns a priced cart into a paid sale: FEFO allocation, stock out, invoice number (BR1).
func settle(tx *gorm.DB, actorID uint64, t *models.Transaction, lines []CartLine, discount int64, pay PaymentInput, tillID uint64) error {
	shift, err := lockOpenShift(tx, actorID)
	if err != nil {
		return err
	}
	if tillID != 0 && tillID != shift.TillID {
		return invalid("Till tidak sesuai dengan shift yang sedang dibuka")
	}
	pc, err := priceCart(tx, lines, discount)
	if err != nil {
		return err
	}
	if err := checkCustomer(tx, t.CustomerID); err != nil {
		return err
	}
	if err := validatePrescription(pc, t.CustomerID, derefStr(t.PrescriptionNumber)); err != nil {
		return err
	}
	rate, err := taxRate(tx)
	if err != nil {
		return err
	}
	pc.applyTo(t, rate)
	if err := applyPayment(t, pay); err != nil {
		return err
	}
	allocs, err := allocateFEFO(tx, pc)
	if err != nil {
		return err
	}

	var till models.Till
	if err := tx.First(&till, shift.TillID).Error; err != nil {
		return err
	}
	now := helpers.Now()
	number, err := helpers.NextDocNumber(tx, "INV", till.ID, till.Number, now)
	if err != nil {
		return err
	}
	t.InvoiceNumber, t.TillID, t.ShiftID, t.PaidBy, t.PaidAt, t.Status = &number, till.ID, &shift.ID, &actorID, &now, "paid"
	if t.ID == 0 {
		t.CreatedBy = actorID
		if err := tx.Omit(clause.Associations).Create(t).Error; err != nil {
			return err
		}
	} else if err := tx.Omit(clause.Associations).Save(t).Error; err != nil {
		return err
	}
	if err := replaceItems(tx, t, pc.items); err != nil {
		return err
	}

	for _, a := range allocs {
		item := &t.Items[a.itemIndex]
		tib := models.TransactionItemBatch{TransactionItemID: item.ID, ProductBatchID: a.batch.ID, Quantity: a.qty, CostPrice: a.batch.CostPrice}
		if err := tx.Create(&tib).Error; err != nil {
			return err
		}
		item.Batches = append(item.Batches, tib)
		if err := MoveStock(tx, a.batch, -a.qty, Movement{Type: "sale", ReferenceType: "transaction", ReferenceID: t.ID, UserID: actorID}); err != nil {
			return err
		}
	}
	return nil
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func auditSale(tx *gorm.DB, actorID uint64, action string, t *models.Transaction, ip string) error {
	after := map[string]any{
		"invoice_number": t.InvoiceNumber, "status": t.Status, "total": t.Total, "discount": t.Discount,
		"payment_method": t.PaymentMethod, "shift_id": t.ShiftID, "items": len(t.Items),
	}
	return WriteAudit(tx, AuditEntry{UserID: &actorID, Action: action, EntityType: "transaction", EntityID: &t.ID, After: after, IP: ip})
}

// Checkout records a new paid sale (POST /transactions with status=paid).
func Checkout(tx *gorm.DB, actorID uint64, in CartInput, pay PaymentInput, ip string) (*models.Transaction, error) {
	t := &models.Transaction{
		CustomerID: in.CustomerID, RefNumber: optStr(in.RefNumber),
		PrescriptionNumber: optStr(in.PrescriptionNumber), PrescriptionNote: optStr(in.PrescriptionNote),
	}
	if err := settle(tx, actorID, t, in.Items, in.Discount, pay, in.TillID); err != nil {
		return nil, err
	}
	if err := auditSale(tx, actorID, "create", t, ip); err != nil {
		return nil, err
	}
	return t, nil
}

// lockTransaction loads and locks a transaction row.
func lockTransaction(tx *gorm.DB, id uint64) (*models.Transaction, error) {
	var t models.Transaction
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&t, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, notFound("Transaksi tidak ditemukan")
	}
	return &t, err
}

func validateHold(tx *gorm.DB, in CartInput) error {
	if strings.TrimSpace(in.RefNumber) == "" && in.CustomerID == nil {
		return invalid("Pesanan tertunda butuh no. referensi atau pelanggan")
	}
	if err := checkCustomer(tx, in.CustomerID); err != nil {
		return err
	}
	var n int64
	if err := tx.Model(&models.Till{}).Where("id = ?", in.TillID).Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return invalid("Till tidak ditemukan")
	}
	return nil
}

// Hold saves a cart as a held order: no stock reserved, no invoice number yet (F12, BR6).
func Hold(tx *gorm.DB, actorID uint64, in CartInput, ip string) (*models.Transaction, error) {
	if err := validateHold(tx, in); err != nil {
		return nil, err
	}
	pc, err := priceCart(tx, in.Items, in.Discount)
	if err != nil {
		return nil, err
	}
	rate, err := taxRate(tx)
	if err != nil {
		return nil, err
	}
	t := &models.Transaction{
		TillID: in.TillID, CreatedBy: actorID, Status: "held", CustomerID: in.CustomerID, RefNumber: optStr(in.RefNumber),
		PrescriptionNumber: optStr(in.PrescriptionNumber), PrescriptionNote: optStr(in.PrescriptionNote),
	}
	pc.applyTo(t, rate)
	if err := tx.Omit(clause.Associations).Create(t).Error; err != nil {
		return nil, err
	}
	if err := replaceItems(tx, t, pc.items); err != nil {
		return nil, err
	}
	if err := auditSale(tx, actorID, "hold", t, ip); err != nil {
		return nil, err
	}
	return t, nil
}

// UpdateHeld replaces the content of a held order.
func UpdateHeld(tx *gorm.DB, actorID, id uint64, in CartInput, ip string) (*models.Transaction, error) {
	t, err := lockTransaction(tx, id)
	if err != nil {
		return nil, err
	}
	if t.Status != "held" {
		return nil, conflict("Hanya pesanan tertunda yang bisa diubah")
	}
	if in.TillID == 0 {
		in.TillID = t.TillID
	}
	if err := validateHold(tx, in); err != nil {
		return nil, err
	}
	pc, err := priceCart(tx, in.Items, in.Discount)
	if err != nil {
		return nil, err
	}
	rate, err := taxRate(tx)
	if err != nil {
		return nil, err
	}
	t.TillID, t.CustomerID, t.RefNumber = in.TillID, in.CustomerID, optStr(in.RefNumber)
	t.PrescriptionNumber, t.PrescriptionNote = optStr(in.PrescriptionNumber), optStr(in.PrescriptionNote)
	pc.applyTo(t, rate)
	if err := tx.Omit(clause.Associations).Save(t).Error; err != nil {
		return nil, err
	}
	if err := replaceItems(tx, t, pc.items); err != nil {
		return nil, err
	}
	if err := auditSale(tx, actorID, "update", t, ip); err != nil {
		return nil, err
	}
	return t, nil
}

// PayHeldOverrides lets the cashier complete patient/prescription data at payment time.
type PayHeldOverrides struct {
	CustomerID         *uint64
	PrescriptionNumber *string
	PrescriptionNote   *string
}

// PayHeld pays a held order: prices, stock and FEFO are recomputed now, and the sale joins the payer's shift (F12).
func PayHeld(tx *gorm.DB, actorID, id uint64, pay PaymentInput, tillID uint64, o PayHeldOverrides, ip string) (*models.Transaction, error) {
	t, err := lockTransaction(tx, id)
	if err != nil {
		return nil, err
	}
	if t.Status != "held" {
		return nil, conflict("Pesanan ini sudah dibayar atau dibatalkan")
	}
	if o.CustomerID != nil {
		t.CustomerID = o.CustomerID
	}
	if o.PrescriptionNumber != nil {
		t.PrescriptionNumber = optStr(*o.PrescriptionNumber)
	}
	if o.PrescriptionNote != nil {
		t.PrescriptionNote = optStr(*o.PrescriptionNote)
	}
	var held []models.TransactionItem
	if err := tx.Where("transaction_id = ?", id).Order("id").Find(&held).Error; err != nil {
		return nil, err
	}
	lines := make([]CartLine, len(held))
	for i, it := range held {
		lines[i] = CartLine{ProductUnitID: it.ProductUnitID, Quantity: it.Quantity}
	}
	if err := settle(tx, actorID, t, lines, t.Discount, pay, tillID); err != nil {
		return nil, err
	}
	if err := auditSale(tx, actorID, "pay", t, ip); err != nil {
		return nil, err
	}
	return t, nil
}

// DeleteHeld removes a held order; paid and void transactions are never deleted (BR7).
func DeleteHeld(tx *gorm.DB, actorID, id uint64, ip string) error {
	t, err := lockTransaction(tx, id)
	if err != nil {
		return err
	}
	if t.Status != "held" {
		return conflict("Hanya pesanan tertunda yang bisa dihapus")
	}
	if err := tx.Delete(t).Error; err != nil {
		return err
	}
	return WriteAudit(tx, AuditEntry{UserID: &actorID, Action: "delete", EntityType: "transaction", EntityID: &t.ID, Before: map[string]any{"ref_number": t.RefNumber, "customer_id": t.CustomerID, "total": t.Total}, IP: ip})
}

// Void cancels a paid sale while its shift is open and nothing was returned; stock goes back to the original batches (BR7).
func Void(tx *gorm.DB, actorID, id uint64, reason, ip string) (*models.Transaction, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return nil, invalid("Alasan void wajib diisi")
	}
	t, err := lockTransaction(tx, id)
	if err != nil {
		return nil, err
	}
	if t.Status != "paid" {
		return nil, conflict("Hanya transaksi lunas yang bisa di-void")
	}
	var shiftStatus string
	if err := tx.Raw("SELECT status FROM shifts WHERE id = ? FOR SHARE", t.ShiftID).Scan(&shiftStatus).Error; err != nil {
		return nil, err
	}
	if shiftStatus != "open" {
		return nil, conflict("Shift transaksi sudah ditutup; gunakan retur")
	}
	var returns int64
	if err := tx.Model(&models.SalesReturn{}).Where("transaction_id = ?", id).Count(&returns).Error; err != nil {
		return nil, err
	}
	if returns > 0 {
		return nil, conflict("Transaksi sudah punya retur; tidak bisa di-void")
	}

	var tibs []models.TransactionItemBatch
	if err := tx.Joins("JOIN transaction_items ti ON ti.id = transaction_item_batches.transaction_item_id").
		Where("ti.transaction_id = ?", id).Order("transaction_item_batches.id").Find(&tibs).Error; err != nil {
		return nil, err
	}
	ids := make([]uint64, len(tibs))
	for i, b := range tibs {
		ids[i] = b.ProductBatchID
	}
	batches, err := LockBatches(tx, ids)
	if err != nil {
		return nil, err
	}
	for _, b := range tibs {
		if err := MoveStock(tx, batches[b.ProductBatchID], b.Quantity, Movement{Type: "void", ReferenceType: "transaction", ReferenceID: id, UserID: actorID}); err != nil {
			return nil, err
		}
	}

	now := helpers.Now()
	before := map[string]any{"status": t.Status}
	t.Status, t.VoidReason, t.VoidedBy, t.VoidedAt = "void", &reason, &actorID, &now
	if err := tx.Model(t).Updates(map[string]any{"status": "void", "void_reason": reason, "voided_by": actorID, "voided_at": now}).Error; err != nil {
		return nil, err
	}
	after := map[string]any{"status": "void", "void_reason": reason, "invoice_number": t.InvoiceNumber, "total": t.Total}
	if err := WriteAudit(tx, AuditEntry{UserID: &actorID, Action: "void", EntityType: "transaction", EntityID: &t.ID, Before: before, After: after, IP: ip}); err != nil {
		return nil, err
	}
	return t, nil
}

type ReturnLine struct {
	TransactionItemID uint64
	BaseQuantity      int
	Restock           bool
}

type ReturnInput struct {
	Items        []ReturnLine
	Reason       string
	RefundMethod string
}

// CreateReturn refunds part of a paid sale from the actor's open shift (F14, BR10).
// Restocked quantity goes back to the batches it came from; the rest is logged as damaged.
func CreateReturn(tx *gorm.DB, actorID, transactionID uint64, in ReturnInput, ip string) (*models.SalesReturn, error) {
	in.Reason = strings.TrimSpace(in.Reason)
	switch {
	case in.Reason == "":
		return nil, invalid("Alasan retur wajib diisi")
	case !models.ValidPaymentMethod(in.RefundMethod):
		return nil, invalid("Metode refund harus cash, card, atau qris")
	case len(in.Items) == 0:
		return nil, invalid("Pilih item yang diretur")
	}
	t, err := lockTransaction(tx, transactionID)
	if err != nil {
		return nil, err
	}
	if t.Status != "paid" {
		return nil, conflict("Hanya transaksi lunas yang bisa diretur")
	}
	shift, err := lockOpenShift(tx, actorID)
	if err != nil {
		return nil, err
	}

	itemIDs := make([]uint64, 0, len(in.Items))
	seen := map[uint64]bool{}
	for _, l := range in.Items {
		if l.BaseQuantity <= 0 {
			return nil, invalid("Qty retur harus lebih dari 0")
		}
		if seen[l.TransactionItemID] {
			return nil, invalid("Item retur tercatat lebih dari sekali")
		}
		seen[l.TransactionItemID] = true
		itemIDs = append(itemIDs, l.TransactionItemID)
	}
	var items []models.TransactionItem
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id IN ? AND transaction_id = ?", itemIDs, transactionID).Order("id").Find(&items).Error; err != nil {
		return nil, err
	}
	itemByID := map[uint64]*models.TransactionItem{}
	for i := range items {
		itemByID[items[i].ID] = &items[i]
	}
	var tibs []models.TransactionItemBatch
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("transaction_item_id IN ?", itemIDs).Order("id").Find(&tibs).Error; err != nil {
		return nil, err
	}
	batchIDs := make([]uint64, len(tibs))
	for i, b := range tibs {
		batchIDs[i] = b.ProductBatchID
	}
	batches, err := LockBatches(tx, batchIDs)
	if err != nil {
		return nil, err
	}

	var till models.Till
	if err := tx.First(&till, shift.TillID).Error; err != nil {
		return nil, err
	}
	number, err := helpers.NextDocNumber(tx, "RTR", till.ID, till.Number, helpers.Now())
	if err != nil {
		return nil, err
	}
	ret := models.SalesReturn{ReturnNumber: number, TransactionID: t.ID, UserID: actorID, ShiftID: shift.ID, TillID: till.ID, RefundMethod: in.RefundMethod, Reason: in.Reason}
	if err := tx.Omit(clause.Associations).Create(&ret).Error; err != nil {
		return nil, err
	}

	for _, l := range in.Items {
		item := itemByID[l.TransactionItemID]
		if item == nil {
			return nil, invalid("Item #%d bukan bagian dari transaksi ini", l.TransactionItemID)
		}
		sold := item.BaseQuantity()
		remaining := sold - item.ReturnedBaseQuantity
		if l.BaseQuantity > remaining {
			return nil, invalid("%s: maksimal retur %d (terjual %d, sudah diretur %d)", item.ProductName, remaining, sold, item.ReturnedBaseQuantity)
		}

		net := item.LineTotal - item.DiscountShare
		var refund int64
		if l.BaseQuantity == remaining {
			var already int64
			if err := tx.Model(&models.SalesReturnItem{}).Where("transaction_item_id = ?", item.ID).Select("COALESCE(SUM(refund_amount), 0)").Scan(&already).Error; err != nil {
				return nil, err
			}
			refund = net - already
		} else {
			refund = helpers.DivRound(net*int64(l.BaseQuantity), int64(sold))
		}

		var cost int64
		rest := l.BaseQuantity
		for i := range tibs {
			tib := &tibs[i]
			if tib.TransactionItemID != item.ID || rest == 0 {
				continue
			}
			take := min(rest, tib.Quantity-tib.ReturnedQuantity)
			if take == 0 {
				continue
			}
			rest -= take
			cost += int64(take) * tib.CostPrice
			tib.ReturnedQuantity += take
			if err := tx.Model(tib).Update("returned_quantity", tib.ReturnedQuantity).Error; err != nil {
				return nil, err
			}
			b := batches[tib.ProductBatchID]
			mv := Movement{Type: "return", ReferenceType: "sales_return", ReferenceID: ret.ID, UserID: actorID}
			if err := MoveStock(tx, b, take, mv); err != nil {
				return nil, err
			}
			if !l.Restock {
				mv = Movement{Type: "adjustment", Reason: "damaged", Note: "Retur tidak kembali ke stok: " + number, ReferenceType: "sales_return", ReferenceID: ret.ID, UserID: actorID}
				if err := MoveStock(tx, b, -take, mv); err != nil {
					return nil, err
				}
			}
		}

		item.ReturnedBaseQuantity += l.BaseQuantity
		if err := tx.Model(item).Update("returned_base_quantity", item.ReturnedBaseQuantity).Error; err != nil {
			return nil, err
		}
		ri := models.SalesReturnItem{SalesReturnID: ret.ID, TransactionItemID: item.ID, BaseQuantity: l.BaseQuantity, RefundAmount: refund, CostAmount: cost, Restock: l.Restock}
		if err := tx.Omit(clause.Associations).Create(&ri).Error; err != nil {
			return nil, err
		}
		ret.Items = append(ret.Items, ri)
		ret.TotalRefund += refund
	}

	if err := tx.Model(&ret).Update("total_refund", ret.TotalRefund).Error; err != nil {
		return nil, err
	}
	after := map[string]any{"return_number": number, "invoice_number": t.InvoiceNumber, "total_refund": ret.TotalRefund, "refund_method": in.RefundMethod, "reason": in.Reason, "items": len(ret.Items)}
	if err := WriteAudit(tx, AuditEntry{UserID: &actorID, Action: "return", EntityType: "transaction", EntityID: &t.ID, After: after, IP: ip}); err != nil {
		return nil, err
	}
	return &ret, nil
}
