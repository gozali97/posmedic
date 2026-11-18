package services

import (
	"errors"
	"sort"
	"strings"

	"pos-apotek-api/helpers"
	"pos-apotek-api/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Movement describes one stock_movements row; the batch delta and stock_after are filled by MoveStock.
type Movement struct {
	Type          string
	Reason        string
	ReferenceType string
	ReferenceID   uint64
	Note          string
	UserID        uint64
}

func optStr(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

func optID(id uint64) *uint64 {
	if id == 0 {
		return nil
	}
	return &id
}

// MoveStock changes a batch that the caller already locked FOR UPDATE and logs the movement (D7, BR14).
func MoveStock(tx *gorm.DB, batch *models.ProductBatch, delta int, m Movement) error {
	if delta == 0 {
		return nil
	}
	if batch.Quantity+delta < 0 {
		return invalid("Stok batch %s tidak cukup (sisa %d)", batch.BatchNumber, batch.Quantity)
	}
	batch.Quantity += delta
	if err := tx.Model(batch).Updates(map[string]any{"quantity": batch.Quantity, "updated_at": helpers.Now()}).Error; err != nil {
		return err
	}
	return tx.Create(&models.StockMovement{
		ProductID: batch.ProductID, ProductBatchID: &batch.ID, Type: m.Type, Reason: optStr(m.Reason),
		Quantity: delta, StockAfter: batch.Quantity, ReferenceType: optStr(m.ReferenceType), ReferenceID: optID(m.ReferenceID),
		Note: optStr(m.Note), UserID: m.UserID,
	}).Error
}

// LockBatches locks the given batches in id order (one global order avoids deadlocks, BR1) and returns them by id.
func LockBatches(tx *gorm.DB, ids []uint64) (map[uint64]*models.ProductBatch, error) {
	out := map[uint64]*models.ProductBatch{}
	if len(ids) == 0 {
		return out, nil
	}
	var batches []models.ProductBatch
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id IN ?", ids).Order("id").Find(&batches).Error; err != nil {
		return nil, err
	}
	for i := range batches {
		out[batches[i].ID] = &batches[i]
	}
	return out, nil
}

// findOrCreateBatch returns the locked batch for product+batch+ED, creating an empty one if needed.
func findOrCreateBatch(tx *gorm.DB, productID uint64, batchNumber string, ed models.Date, source string, cost int64) (*models.ProductBatch, error) {
	if err := tx.Exec(`INSERT INTO product_batches (product_id, batch_number, expiration_date, quantity, cost_price, source)
		VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT (product_id, batch_number, expiration_date) DO NOTHING`,
		productID, batchNumber, ed, cost, source).Error; err != nil {
		return nil, err
	}
	var b models.ProductBatch
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("product_id = ? AND batch_number = ? AND expiration_date = ?", productID, batchNumber, ed).First(&b).Error
	return &b, err
}

// ---------------------------------------------------------------- penerimaan (F6)

type PurchaseItemInput struct {
	ProductUnitID  uint64
	Quantity       int
	UnitCost       int64
	BatchNumber    string
	ExpirationDate models.Date
}

type PurchaseInput struct {
	SupplierID    uint64
	InvoiceNumber string
	InvoiceDate   models.Date
	DueDate       *models.Date
	Note          string
	Items         []PurchaseItemInput
}

// ReceivePurchase posts a supplier invoice: batches are created or merged (weighted average cost), stock moves in (F6).
func ReceivePurchase(tx *gorm.DB, actorID uint64, in PurchaseInput, ip string) (*models.Purchase, error) {
	in.InvoiceNumber = strings.TrimSpace(in.InvoiceNumber)
	if in.InvoiceNumber == "" {
		return nil, invalid("No. faktur wajib diisi")
	}
	if len(in.Items) == 0 {
		return nil, invalid("Item penerimaan wajib diisi")
	}
	var supplier models.Supplier
	if err := tx.Where("deleted_at IS NULL").First(&supplier, in.SupplierID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, invalid("Supplier tidak ditemukan")
		}
		return nil, err
	}
	due := models.NewDate(in.InvoiceDate.AddDate(0, 0, supplier.PaymentTermDays))
	if in.DueDate != nil {
		due = *in.DueDate
	}
	if due.Before(in.InvoiceDate.Time) {
		return nil, invalid("Jatuh tempo tidak boleh sebelum tanggal faktur")
	}

	today := helpers.Today()
	unitIDs := make([]uint64, 0, len(in.Items))
	for i, it := range in.Items {
		in.Items[i].BatchNumber = strings.TrimSpace(it.BatchNumber)
		switch {
		case it.Quantity <= 0:
			return nil, invalid("Baris %d: qty harus lebih dari 0", i+1)
		case it.UnitCost < 0:
			return nil, invalid("Baris %d: harga beli tidak boleh negatif", i+1)
		case in.Items[i].BatchNumber == "":
			return nil, invalid("Baris %d: no. batch wajib diisi", i+1)
		case it.ExpirationDate.String() <= today:
			return nil, invalid("Baris %d: ED harus setelah hari ini", i+1)
		}
		unitIDs = append(unitIDs, it.ProductUnitID)
	}
	units, products, err := loadUnits(tx, unitIDs)
	if err != nil {
		return nil, err
	}

	purchase := models.Purchase{
		SupplierID: supplier.ID, InvoiceNumber: in.InvoiceNumber, InvoiceDate: in.InvoiceDate, DueDate: due,
		PaymentStatus: "unpaid", Note: optStr(in.Note), UserID: actorID,
	}
	for _, it := range in.Items {
		purchase.Total += int64(it.Quantity) * it.UnitCost
	}
	if err := tx.Create(&purchase).Error; err != nil {
		if helpers.IsUniqueViolation(err) {
			return nil, conflict("No. faktur %s sudah pernah diinput untuk supplier ini", in.InvoiceNumber)
		}
		return nil, err
	}

	// Lock batches in a stable order so concurrent receipts of the same batches cannot deadlock.
	order := make([]int, len(in.Items))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool {
		x, y := in.Items[order[a]], in.Items[order[b]]
		px, py := units[x.ProductUnitID].ProductID, units[y.ProductUnitID].ProductID
		if px != py {
			return px < py
		}
		if x.BatchNumber != y.BatchNumber {
			return x.BatchNumber < y.BatchNumber
		}
		return x.ExpirationDate.Before(y.ExpirationDate.Time)
	})

	items := make([]models.PurchaseItem, len(in.Items))
	for _, i := range order {
		it := in.Items[i]
		unit := units[it.ProductUnitID]
		product := products[unit.ProductID]
		if !product.TrackStock {
			return nil, invalid("Baris %d: %s tidak memakai stok (jasa)", i+1, product.Name)
		}
		base := it.Quantity * unit.ConversionQty
		cost := helpers.DivCeil(it.UnitCost, int64(unit.ConversionQty))
		batch, err := findOrCreateBatch(tx, product.ID, it.BatchNumber, it.ExpirationDate, "purchase", cost)
		if err != nil {
			return nil, err
		}
		if batch.Quantity > 0 {
			cost = helpers.DivRound(int64(batch.Quantity)*batch.CostPrice+int64(base)*cost, int64(batch.Quantity+base))
		}
		if err := tx.Model(batch).Update("cost_price", cost).Error; err != nil {
			return nil, err
		}
		batch.CostPrice = cost
		if err := MoveStock(tx, batch, base, Movement{Type: "purchase", ReferenceType: "purchase", ReferenceID: purchase.ID, UserID: actorID}); err != nil {
			return nil, err
		}
		items[i] = models.PurchaseItem{
			PurchaseID: purchase.ID, ProductID: product.ID, ProductUnitID: unit.ID, UnitName: unit.Name, ConversionQty: unit.ConversionQty,
			Quantity: it.Quantity, UnitCost: it.UnitCost, LineTotal: int64(it.Quantity) * it.UnitCost,
			BatchNumber: it.BatchNumber, ExpirationDate: it.ExpirationDate, ProductBatchID: batch.ID,
		}
	}
	if err := tx.Create(&items).Error; err != nil {
		return nil, err
	}
	purchase.Items = items
	if err := WriteAudit(tx, AuditEntry{UserID: &actorID, Action: "post", EntityType: "purchase", EntityID: &purchase.ID, After: purchase, IP: ip}); err != nil {
		return nil, err
	}
	return &purchase, nil
}

// loadUnits loads active units and their active products.
func loadUnits(tx *gorm.DB, unitIDs []uint64) (map[uint64]models.ProductUnit, map[uint64]models.Product, error) {
	var units []models.ProductUnit
	if err := tx.Where("id IN ? AND deleted_at IS NULL", unitIDs).Find(&units).Error; err != nil {
		return nil, nil, err
	}
	unitMap := map[uint64]models.ProductUnit{}
	productIDs := []uint64{}
	for _, u := range units {
		unitMap[u.ID] = u
		productIDs = append(productIDs, u.ProductID)
	}
	for _, id := range unitIDs {
		if _, ok := unitMap[id]; !ok {
			return nil, nil, invalid("Satuan produk #%d tidak ditemukan", id)
		}
	}
	var products []models.Product
	if err := tx.Where("id IN ? AND deleted_at IS NULL", productIDs).Find(&products).Error; err != nil {
		return nil, nil, err
	}
	productMap := map[uint64]models.Product{}
	for _, p := range products {
		productMap[p.ID] = p
	}
	for _, u := range units {
		if _, ok := productMap[u.ProductID]; !ok {
			return nil, nil, invalid("Produk untuk satuan #%d sudah dihapus", u.ID)
		}
	}
	return unitMap, productMap, nil
}

// ---------------------------------------------------------------- penyesuaian (F8)

func ValidReason(r string) bool {
	for _, x := range models.AdjustmentReasons {
		if x == r {
			return true
		}
	}
	return false
}

// AdjustBatch adds or removes stock from one batch with a reason (F8).
func AdjustBatch(tx *gorm.DB, actorID, batchID uint64, qty int, reason, note, ip string) (*models.ProductBatch, error) {
	if qty == 0 {
		return nil, invalid("Qty penyesuaian tidak boleh 0")
	}
	if !ValidReason(reason) {
		return nil, invalid("Alasan harus expired, damaged, lost, atau correction")
	}
	if strings.TrimSpace(note) == "" {
		return nil, invalid("Catatan penyesuaian wajib diisi")
	}
	locked, err := LockBatches(tx, []uint64{batchID})
	if err != nil {
		return nil, err
	}
	batch := locked[batchID]
	if batch == nil {
		return nil, notFound("Batch tidak ditemukan")
	}
	before := *batch
	if err := MoveStock(tx, batch, qty, Movement{Type: "adjustment", Reason: reason, Note: note, ReferenceType: "product_batch", ReferenceID: batch.ID, UserID: actorID}); err != nil {
		return nil, err
	}
	after := map[string]any{"quantity": batch.Quantity, "delta": qty, "reason": reason, "note": note}
	if err := WriteAudit(tx, AuditEntry{UserID: &actorID, Action: "adjust", EntityType: "product_batch", EntityID: &batch.ID, Before: map[string]any{"quantity": before.Quantity}, After: after, IP: ip}); err != nil {
		return nil, err
	}
	return batch, nil
}

// ---------------------------------------------------------------- stok opname (F8)

// CreateOpname opens a draft session listing every batch in stock, optionally limited to a category or shelf.
func CreateOpname(tx *gorm.DB, actorID uint64, categoryID *uint64, shelf, note, ip string) (*models.StockOpname, error) {
	number, err := helpers.NextDocNumber(tx, "OPN", 0, 0, helpers.Now())
	if err != nil {
		return nil, err
	}
	op := models.StockOpname{OpnameNumber: number, Status: "draft", CategoryID: categoryID, ShelfLocation: optStr(shelf), Note: optStr(note), UserID: actorID}
	if err := tx.Create(&op).Error; err != nil {
		return nil, err
	}

	q := tx.Table("product_batches b").Select("b.*").Joins("JOIN products p ON p.id = b.product_id").
		Where("b.quantity > 0 AND p.deleted_at IS NULL AND p.track_stock")
	if categoryID != nil {
		q = q.Where("p.category_id = ?", *categoryID)
	}
	if op.ShelfLocation != nil {
		q = q.Where("p.shelf_location = ?", *op.ShelfLocation)
	}
	var batches []models.ProductBatch
	if err := q.Order("p.name, b.expiration_date, b.id").Find(&batches).Error; err != nil {
		return nil, err
	}
	if len(batches) > 0 {
		items := make([]models.StockOpnameItem, len(batches))
		for i, b := range batches {
			sys := b.Quantity
			items[i] = models.StockOpnameItem{StockOpnameID: op.ID, ProductID: b.ProductID, ProductBatchID: &batches[i].ID,
				BatchNumber: b.BatchNumber, ExpirationDate: b.ExpirationDate, CostPrice: b.CostPrice, SystemQuantity: &sys}
		}
		if err := tx.CreateInBatches(&items, 500).Error; err != nil {
			return nil, err
		}
	}
	if err := WriteAudit(tx, AuditEntry{UserID: &actorID, Action: "create", EntityType: "stock_opname", EntityID: &op.ID, After: op, IP: ip}); err != nil {
		return nil, err
	}
	return &op, nil
}

type OpnameCount struct {
	ID              uint64
	CountedQuantity *int
}

type OpnameNewBatch struct {
	ProductID       uint64
	BatchNumber     string
	ExpirationDate  models.Date
	CostPrice       int64
	CountedQuantity int
}

// lockDraftOpname locks a draft session row so saving and posting cannot interleave.
func lockDraftOpname(tx *gorm.DB, id uint64) (*models.StockOpname, error) {
	var op models.StockOpname
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&op, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, notFound("Sesi opname tidak ditemukan")
		}
		return nil, err
	}
	if op.Status != "draft" {
		return nil, conflict("Sesi opname sudah diposting")
	}
	return &op, nil
}

// SaveOpnameItems stores counted quantities, adds batches found on the shelf, and removes added batches.
func SaveOpnameItems(tx *gorm.DB, opnameID uint64, counts []OpnameCount, added []OpnameNewBatch, removeIDs []uint64) error {
	if _, err := lockDraftOpname(tx, opnameID); err != nil {
		return err
	}
	for _, c := range counts {
		if c.CountedQuantity != nil && *c.CountedQuantity < 0 {
			return invalid("Qty fisik tidak boleh negatif")
		}
		res := tx.Model(&models.StockOpnameItem{}).Where("id = ? AND stock_opname_id = ?", c.ID, opnameID).
			Updates(map[string]any{"counted_quantity": c.CountedQuantity, "updated_at": helpers.Now()})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return invalid("Item opname #%d tidak ada di sesi ini", c.ID)
		}
	}
	if len(removeIDs) > 0 {
		// Only manually added rows may be removed; listed batches are kept (leave counted empty to skip them).
		if err := tx.Where("id IN ? AND stock_opname_id = ? AND product_batch_id IS NULL", removeIDs, opnameID).Delete(&models.StockOpnameItem{}).Error; err != nil {
			return err
		}
	}
	for i, n := range added {
		n.BatchNumber = strings.TrimSpace(n.BatchNumber)
		switch {
		case n.BatchNumber == "":
			return invalid("Batch baru %d: no. batch wajib diisi", i+1)
		case n.CountedQuantity < 0:
			return invalid("Batch baru %d: qty fisik tidak boleh negatif", i+1)
		case n.CostPrice < 0:
			return invalid("Batch baru %d: harga beli tidak boleh negatif", i+1)
		}
		var p models.Product
		if err := tx.Where("deleted_at IS NULL AND track_stock").First(&p, n.ProductID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return invalid("Batch baru %d: produk tidak ditemukan atau tidak memakai stok", i+1)
			}
			return err
		}
		counted := n.CountedQuantity
		if err := tx.Create(&models.StockOpnameItem{StockOpnameID: opnameID, ProductID: p.ID, BatchNumber: n.BatchNumber,
			ExpirationDate: n.ExpirationDate, CostPrice: n.CostPrice, CountedQuantity: &counted}).Error; err != nil {
			return err
		}
	}
	return nil
}

// PostOpname applies counted − system (system read at posting time, under lock) as opname movements (F8).
func PostOpname(tx *gorm.DB, actorID, opnameID uint64, ip string) (*models.StockOpname, error) {
	op, err := lockDraftOpname(tx, opnameID)
	if err != nil {
		return nil, err
	}
	var items []models.StockOpnameItem
	if err := tx.Where("stock_opname_id = ? AND counted_quantity IS NOT NULL", opnameID).Order("id").Find(&items).Error; err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, invalid("Belum ada qty fisik yang diisi")
	}

	// New rows that match an existing batch are treated as that batch.
	for i := range items {
		it := &items[i]
		if it.ProductBatchID != nil {
			continue
		}
		b, err := findOrCreateBatch(tx, it.ProductID, it.BatchNumber, it.ExpirationDate, "opname", it.CostPrice)
		if err != nil {
			return nil, err
		}
		it.ProductBatchID = &b.ID
	}
	ids := make([]uint64, 0, len(items))
	seen := map[uint64]bool{}
	for _, it := range items {
		if seen[*it.ProductBatchID] {
			return nil, invalid("Batch %s (ED %s) tercatat lebih dari sekali di sesi ini", it.BatchNumber, it.ExpirationDate)
		}
		seen[*it.ProductBatchID] = true
		ids = append(ids, *it.ProductBatchID)
	}
	batches, err := LockBatches(tx, ids)
	if err != nil {
		return nil, err
	}

	totalDiff := 0
	for i := range items {
		it := &items[i]
		b := batches[*it.ProductBatchID]
		sys := b.Quantity
		diff := *it.CountedQuantity - sys
		if err := MoveStock(tx, b, diff, Movement{Type: "opname", ReferenceType: "stock_opname", ReferenceID: op.ID, UserID: actorID}); err != nil {
			return nil, err
		}
		it.SystemQuantity, it.Difference = &sys, &diff
		totalDiff += diff
		if err := tx.Model(it).Updates(map[string]any{"product_batch_id": it.ProductBatchID, "system_quantity": sys, "difference": diff, "updated_at": helpers.Now()}).Error; err != nil {
			return nil, err
		}
	}

	now := helpers.Now()
	op.Status, op.PostedBy, op.PostedAt = "posted", &actorID, &now
	if err := tx.Model(op).Updates(map[string]any{"status": "posted", "posted_by": actorID, "posted_at": now}).Error; err != nil {
		return nil, err
	}
	after := map[string]any{"opname_number": op.OpnameNumber, "items_posted": len(items), "total_difference": totalDiff}
	if err := WriteAudit(tx, AuditEntry{UserID: &actorID, Action: "post", EntityType: "stock_opname", EntityID: &op.ID, After: after, IP: ip}); err != nil {
		return nil, err
	}
	return op, nil
}
