package controllers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"pos-apotek-api/config"
	"pos-apotek-api/dto"
	"pos-apotek-api/helpers"
	"pos-apotek-api/middleware"
	"pos-apotek-api/models"
	"pos-apotek-api/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// StockController serves purchases & payables (F6), batches & adjustments (F7, F8) and stock opname (F8).
type StockController struct {
	DB     *gorm.DB
	Logger *services.ServiceLogger
}

func NewStockController() *StockController {
	return &StockController{DB: config.GetDB(), Logger: services.GetServiceLogger("stock")}
}

// ==================================================================
// PENERIMAAN & HUTANG
// ==================================================================

func (c *StockController) purchaseQuery() *gorm.DB {
	return c.DB.Table("purchases").
		Select("purchases.*, s.name AS supplier_name, (SELECT COUNT(*) FROM purchase_items i WHERE i.purchase_id = purchases.id) AS item_count, (purchases.payment_status = 'unpaid' AND purchases.due_date < ?::date) AS is_overdue", helpers.Today()).
		Joins("JOIN suppliers s ON s.id = purchases.supplier_id")
}

func (c *StockController) listPurchases(ctx *gin.Context, q *gorm.DB, order string, summary *dto.PayableSummary) {
	page, perPage, offset := helpers.ParsePagination(ctx)
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count purchases", err)
		return
	}
	rows := []dto.PurchaseListItem{}
	if err := q.Order(order).Offset(offset).Limit(perPage).Scan(&rows).Error; err != nil {
		serverError(ctx, c.Logger, "list purchases", err)
		return
	}
	ok(ctx, http.StatusOK, "Data penerimaan berhasil diambil", dto.PurchaseListData{Purchases: rows, Pagination: dto.NewPaginationMeta(page, perPage, total), Summary: summary})
}

// PurchaseIndex godoc
// @Summary Daftar penerimaan barang
// @Tags Purchases
// @Produce json
// @Security BearerAuth
// @Param supplier_id query int false "Supplier"
// @Param search query string false "No. faktur"
// @Param start_date query string false "Tanggal faktur dari (YYYY-MM-DD)"
// @Param end_date query string false "Tanggal faktur sampai (YYYY-MM-DD)"
// @Param payment_status query string false "unpaid|paid"
// @Success 200 {object} dto.Response{data=dto.PurchaseListData}
// @Router /purchases [get]
func (c *StockController) PurchaseIndex(ctx *gin.Context) {
	q := c.purchaseQuery()
	if id := queryUint(ctx, "supplier_id"); id > 0 {
		q = q.Where("purchases.supplier_id = ?", id)
	}
	if s := strings.TrimSpace(ctx.Query("search")); s != "" {
		q = q.Where("purchases.invoice_number ILIKE ?", helpers.LikePattern(s))
	}
	if s := ctx.Query("payment_status"); s != "" {
		q = q.Where("purchases.payment_status = ?", s)
	}
	if s := ctx.Query("start_date"); s != "" {
		q = q.Where("purchases.invoice_date >= ?::date", s)
	}
	if s := ctx.Query("end_date"); s != "" {
		q = q.Where("purchases.invoice_date <= ?::date", s)
	}
	if _, _, valid := parseDayRange(ctx); !valid {
		return
	}
	c.listPurchases(ctx, q, "purchases.invoice_date DESC, purchases.id DESC", nil)
}

// Payables godoc
// @Summary Daftar hutang (penerimaan belum lunas)
// @Tags Purchases
// @Produce json
// @Security BearerAuth
// @Param supplier_id query int false "Supplier"
// @Param due query string false "overdue = lewat jatuh tempo, week = jatuh tempo ≤ 7 hari"
// @Success 200 {object} dto.Response{data=dto.PurchaseListData}
// @Router /purchases/payables [get]
func (c *StockController) Payables(ctx *gin.Context) {
	today := helpers.Today()
	q := c.purchaseQuery().Where("purchases.payment_status = 'unpaid'")
	sum := c.DB.Table("purchases").Where("payment_status = 'unpaid'")
	if id := queryUint(ctx, "supplier_id"); id > 0 {
		q = q.Where("purchases.supplier_id = ?", id)
		sum = sum.Where("supplier_id = ?", id)
	}
	switch ctx.Query("due") {
	case "overdue":
		q = q.Where("purchases.due_date < ?::date", today)
	case "week":
		q = q.Where("purchases.due_date <= ?::date", helpers.TodayPlus(7))
	}
	var summary dto.PayableSummary
	if err := sum.Select("COALESCE(SUM(total), 0) AS unpaid_total, COALESCE(SUM(total) FILTER (WHERE due_date < ?::date), 0) AS overdue_total, COUNT(*) FILTER (WHERE due_date < ?::date) AS overdue_count", today, today).
		Scan(&summary).Error; err != nil {
		serverError(ctx, c.Logger, "payable summary", err)
		return
	}
	c.listPurchases(ctx, q, "purchases.due_date, purchases.id", &summary)
}

// PurchaseStore godoc
// @Summary Posting penerimaan barang (menambah batch & stok, membuat hutang)
// @Tags Purchases
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.PurchaseRequest true "Faktur + item"
// @Success 201 {object} dto.Response{data=models.Purchase}
// @Failure 409 {object} dto.Response
// @Failure 422 {object} dto.Response
// @Router /purchases [post]
func (c *StockController) PurchaseStore(ctx *gin.Context) {
	var req dto.PurchaseRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	if req.InvoiceDate.IsZero() {
		fail(ctx, http.StatusUnprocessableEntity, "Tanggal faktur wajib diisi")
		return
	}
	in := services.PurchaseInput{SupplierID: req.SupplierID, InvoiceNumber: req.InvoiceNumber, InvoiceDate: req.InvoiceDate, DueDate: req.DueDate, Note: req.Note}
	for _, it := range req.Items {
		in.Items = append(in.Items, services.PurchaseItemInput{ProductUnitID: it.ProductUnitID, Quantity: it.Quantity, UnitCost: it.UnitCost, BatchNumber: it.BatchNumber, ExpirationDate: it.ExpirationDate})
	}
	actor := middleware.CurrentUser(ctx)
	var purchase *models.Purchase
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		purchase, err = services.ReceivePurchase(tx, actor.ID, in, ctx.ClientIP())
		return err
	})
	if err != nil {
		handleError(ctx, c.Logger, "post purchase", err)
		return
	}
	c.respondPurchase(ctx, purchase.ID, http.StatusCreated, "Penerimaan barang berhasil diposting")
}

func (c *StockController) respondPurchase(ctx *gin.Context, id uint64, code int, msg string) {
	var p models.Purchase
	err := c.DB.Preload("Supplier").Preload("User").Preload("Items", func(db *gorm.DB) *gorm.DB { return db.Order("id") }).Preload("Items.Product").First(&p, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(ctx, http.StatusNotFound, "Penerimaan tidak ditemukan")
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, "purchase detail", err)
		return
	}
	ok(ctx, code, msg, p)
}

// PurchaseDetail godoc
// @Summary Detail penerimaan + item
// @Tags Purchases
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response{data=models.Purchase}
// @Router /purchases/{id} [get]
func (c *StockController) PurchaseDetail(ctx *gin.Context) {
	if id, valid := parseID(ctx); valid {
		c.respondPurchase(ctx, id, http.StatusOK, "Data penerimaan berhasil diambil")
	}
}

// MarkPaid godoc
// @Summary Tandai hutang lunas
// @Tags Purchases
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Param body body dto.MarkPaidRequest true "Tanggal bayar"
// @Success 200 {object} dto.Response{data=models.Purchase}
// @Failure 409 {object} dto.Response
// @Router /purchases/{id}/mark-paid [post]
func (c *StockController) MarkPaid(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	var req dto.MarkPaidRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	if req.PaidAt.IsZero() {
		fail(ctx, http.StatusUnprocessableEntity, "Tanggal bayar wajib diisi")
		return
	}
	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		var p models.Purchase
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&p, id).Error; err != nil {
			return err
		}
		if p.PaymentStatus == "paid" {
			return &services.BizError{Status: http.StatusConflict, Message: "Hutang ini sudah lunas"}
		}
		note := optional(req.PaymentNote)
		if err := tx.Model(&p).Updates(map[string]any{"payment_status": "paid", "paid_at": req.PaidAt, "payment_note": note}).Error; err != nil {
			return err
		}
		after := map[string]any{"payment_status": "paid", "paid_at": req.PaidAt, "payment_note": note}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: "mark_paid", EntityType: "purchase", EntityID: &p.ID, Before: map[string]any{"payment_status": "unpaid"}, After: after, IP: ctx.ClientIP()})
	})
	if err != nil {
		handleError(ctx, c.Logger, "mark paid", err)
		return
	}
	c.respondPurchase(ctx, id, http.StatusOK, "Hutang ditandai lunas")
}

// ==================================================================
// BATCH & PENYESUAIAN
// ==================================================================

func (c *StockController) batchQuery(ctx *gin.Context) *gorm.DB {
	today := helpers.Today()
	warn := helpers.TodayPlus(expiryWarningDays(c.DB))
	q := c.DB.Table("product_batches b").
		Select(`b.*, p.name AS product_name, p.generic_name, p.shelf_location, u.name AS base_unit,
			(b.expiration_date - ?::date) AS days_to_expiry,
			CASE WHEN b.expiration_date <= ?::date THEN 'expired' WHEN b.expiration_date <= ?::date THEN 'warning' ELSE 'ok' END AS expiry_status`, today, today, warn).
		Joins("JOIN products p ON p.id = b.product_id").
		Joins("LEFT JOIN product_units u ON u.product_id = p.id AND u.is_base AND u.deleted_at IS NULL")
	if id := queryUint(ctx, "product_id"); id > 0 {
		q = q.Where("b.product_id = ?", id)
	}
	if s := strings.TrimSpace(ctx.Query("shelf_location")); s != "" {
		q = q.Where("p.shelf_location = ?", s)
	}
	if s := strings.TrimSpace(ctx.Query("search")); s != "" {
		p := helpers.LikePattern(s)
		q = q.Where("p.name ILIKE ? OR p.generic_name ILIKE ? OR b.batch_number ILIKE ?", p, p, p)
	}
	switch ctx.Query("expiry_status") {
	case "expired":
		q = q.Where("b.expiration_date <= ?::date", today)
	case "30":
		q = q.Where("b.expiration_date > ?::date AND b.expiration_date <= ?::date", today, helpers.TodayPlus(30))
	case "warning":
		q = q.Where("b.expiration_date > ?::date AND b.expiration_date <= ?::date", today, warn)
	}
	// Default: only batches in stock (in_stock=0 to include empty ones).
	if ctx.DefaultQuery("in_stock", "1") != "0" {
		q = q.Where("b.quantity > 0")
	}
	return q
}

// BatchIndex godoc
// @Summary Stok per batch
// @Tags Batches
// @Produce json
// @Security BearerAuth
// @Param product_id query int false "Produk"
// @Param shelf_location query string false "Rak"
// @Param search query string false "Nama produk / no. batch"
// @Param expiry_status query string false "expired | 30 | warning"
// @Param in_stock query int false "1 (default) = hanya berstok, 0 = semua"
// @Success 200 {object} dto.Response{data=dto.BatchListData}
// @Router /batches [get]
func (c *StockController) BatchIndex(ctx *gin.Context) {
	page, perPage, offset := helpers.ParsePagination(ctx)
	q := c.batchQuery(ctx)
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count batches", err)
		return
	}
	rows := []dto.BatchItem{}
	if err := q.Order("b.expiration_date, p.name, b.id").Offset(offset).Limit(perPage).Scan(&rows).Error; err != nil {
		serverError(ctx, c.Logger, "list batches", err)
		return
	}
	ok(ctx, http.StatusOK, "Data batch berhasil diambil", dto.BatchListData{Batches: rows, Pagination: dto.NewPaginationMeta(page, perPage, total)})
}

// BatchExport godoc
// @Summary Export stok per batch ke Excel
// @Tags Batches
// @Produce application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// @Security BearerAuth
// @Success 200 {file} file
// @Router /batches/export [get]
func (c *StockController) BatchExport(ctx *gin.Context) {
	rows := []dto.BatchItem{}
	if err := c.batchQuery(ctx).Order("b.expiration_date, p.name, b.id").Limit(maxExportRows).Scan(&rows).Error; err != nil {
		serverError(ctx, c.Logger, "export batches", err)
		return
	}
	headers := []string{"Produk", "Nama generik", "Rak", "No. batch", "ED", "Sisa hari", "Status ED", "Qty", "Satuan", "HPP/satuan", "Nilai stok", "Asal"}
	out := make([][]any, len(rows))
	for i, r := range rows {
		out[i] = []any{r.ProductName, deref(r.GenericName), deref(r.ShelfLocation), r.BatchNumber, r.ExpirationDate.String(), r.DaysToExpiry, r.ExpiryStatus,
			r.Quantity, deref(r.BaseUnit), r.CostPrice, int64(r.Quantity) * r.CostPrice, r.Source}
	}
	if err := writeXLSX(ctx, "stok-batch-"+helpers.Today()+".xlsx", headers, out); err != nil {
		c.Logger.Error("write xlsx", map[string]any{"error": err.Error()})
	}
}

// Adjust godoc
// @Summary Penyesuaian stok per batch (+/-) dengan alasan
// @Tags Batches
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID batch"
// @Param body body dto.AdjustmentRequest true "Penyesuaian"
// @Success 200 {object} dto.Response{data=models.ProductBatch}
// @Failure 422 {object} dto.Response
// @Router /batches/{id}/adjustment [post]
func (c *StockController) Adjust(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	var req dto.AdjustmentRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	actor := middleware.CurrentUser(ctx)
	var batch *models.ProductBatch
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		batch, err = services.AdjustBatch(tx, actor.ID, id, req.Quantity, req.Reason, req.Note, ctx.ClientIP())
		return err
	})
	if err != nil {
		handleError(ctx, c.Logger, "adjust batch", err)
		return
	}
	ok(ctx, http.StatusOK, "Penyesuaian stok berhasil disimpan", batch)
}

// ==================================================================
// STOK OPNAME
// ==================================================================

// OpnameIndex godoc
// @Summary Daftar sesi stok opname
// @Tags Stock Opname
// @Produce json
// @Security BearerAuth
// @Param status query string false "draft|posted"
// @Success 200 {object} dto.Response{data=dto.OpnameListData}
// @Router /stock-opnames [get]
func (c *StockController) OpnameIndex(ctx *gin.Context) {
	page, perPage, offset := helpers.ParsePagination(ctx)
	q := c.DB.Table("stock_opnames o").
		Select(`o.*, cat.name AS category_name, u.username,
			(SELECT COUNT(*) FROM stock_opname_items i WHERE i.stock_opname_id = o.id) AS item_count,
			(SELECT COUNT(*) FROM stock_opname_items i WHERE i.stock_opname_id = o.id AND i.counted_quantity IS NOT NULL) AS counted_count`).
		Joins("LEFT JOIN categories cat ON cat.id = o.category_id").
		Joins("JOIN users u ON u.id = o.user_id")
	if s := ctx.Query("status"); s != "" {
		q = q.Where("o.status = ?", s)
	}
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count opnames", err)
		return
	}
	rows := []dto.OpnameListItem{}
	if err := q.Order("o.created_at DESC, o.id DESC").Offset(offset).Limit(perPage).Scan(&rows).Error; err != nil {
		serverError(ctx, c.Logger, "list opnames", err)
		return
	}
	ok(ctx, http.StatusOK, "Data stok opname berhasil diambil", dto.OpnameListData{StockOpnames: rows, Pagination: dto.NewPaginationMeta(page, perPage, total)})
}

// OpnameStore godoc
// @Summary Buat sesi stok opname (draft) dari batch berstok
// @Tags Stock Opname
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.OpnameCreateRequest true "Filter"
// @Success 201 {object} dto.Response{data=dto.OpnameDetail}
// @Router /stock-opnames [post]
func (c *StockController) OpnameStore(ctx *gin.Context) {
	var req dto.OpnameCreateRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	if req.CategoryID != nil && *req.CategoryID == 0 {
		req.CategoryID = nil
	}
	actor := middleware.CurrentUser(ctx)
	var op *models.StockOpname
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		op, err = services.CreateOpname(tx, actor.ID, req.CategoryID, req.ShelfLocation, req.Note, ctx.ClientIP())
		return err
	})
	if err != nil {
		if helpers.IsFKViolation(err) {
			fail(ctx, http.StatusUnprocessableEntity, "Kategori tidak ditemukan")
			return
		}
		handleError(ctx, c.Logger, "create opname", err)
		return
	}
	c.respondOpname(ctx, op.ID, http.StatusCreated, "Sesi stok opname dibuat")
}

func (c *StockController) respondOpname(ctx *gin.Context, id uint64, code int, msg string) {
	var detail dto.OpnameDetail
	if err := c.DB.Preload("User").First(&detail.StockOpname, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			fail(ctx, http.StatusNotFound, "Sesi opname tidak ditemukan")
			return
		}
		serverError(ctx, c.Logger, "opname detail", err)
		return
	}
	if detail.CategoryID != nil {
		var name string
		c.DB.Table("categories").Select("name").Where("id = ?", *detail.CategoryID).Scan(&name)
		detail.CategoryName = &name
	}
	detail.Items = []dto.OpnameItemDetail{}
	err := c.DB.Table("stock_opname_items i").
		Select("i.*, p.name AS product_name, p.shelf_location, u.name AS base_unit, b.quantity AS current_quantity").
		Joins("JOIN products p ON p.id = i.product_id").
		Joins("LEFT JOIN product_units u ON u.product_id = p.id AND u.is_base AND u.deleted_at IS NULL").
		Joins("LEFT JOIN product_batches b ON b.id = i.product_batch_id").
		Where("i.stock_opname_id = ?", id).Order("p.name, i.expiration_date, i.id").Scan(&detail.Items).Error
	if err != nil {
		serverError(ctx, c.Logger, "opname items", err)
		return
	}
	ok(ctx, code, msg, detail)
}

// OpnameDetail godoc
// @Summary Detail sesi opname + item
// @Tags Stock Opname
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response{data=dto.OpnameDetail}
// @Router /stock-opnames/{id} [get]
func (c *StockController) OpnameDetail(ctx *gin.Context) {
	if id, valid := parseID(ctx); valid {
		c.respondOpname(ctx, id, http.StatusOK, "Data stok opname berhasil diambil")
	}
}

// OpnameSaveItems godoc
// @Summary Simpan qty fisik, tambah batch baru, hapus batch tambahan (hanya draft)
// @Tags Stock Opname
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Param body body dto.OpnameItemsRequest true "Item"
// @Success 200 {object} dto.Response{data=dto.OpnameDetail}
// @Router /stock-opnames/{id}/items [put]
func (c *StockController) OpnameSaveItems(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	var req dto.OpnameItemsRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	counts := make([]services.OpnameCount, len(req.Items))
	for i, it := range req.Items {
		counts[i] = services.OpnameCount{ID: it.ID, CountedQuantity: it.CountedQuantity}
	}
	added := make([]services.OpnameNewBatch, len(req.NewItems))
	for i, n := range req.NewItems {
		if n.ExpirationDate.IsZero() {
			fail(ctx, http.StatusUnprocessableEntity, fmt.Sprintf("Batch baru %d: ED wajib diisi", i+1))
			return
		}
		added[i] = services.OpnameNewBatch{ProductID: n.ProductID, BatchNumber: n.BatchNumber, ExpirationDate: n.ExpirationDate, CostPrice: n.CostPrice, CountedQuantity: n.CountedQuantity}
	}
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		return services.SaveOpnameItems(tx, id, counts, added, req.RemoveItemIDs)
	})
	if err != nil {
		handleError(ctx, c.Logger, "save opname items", err)
		return
	}
	c.respondOpname(ctx, id, http.StatusOK, "Qty fisik tersimpan")
}

// OpnamePost godoc
// @Summary Posting opname: selisih = qty fisik − qty sistem saat posting
// @Tags Stock Opname
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response{data=dto.OpnameDetail}
// @Failure 409 {object} dto.Response
// @Router /stock-opnames/{id}/post [post]
func (c *StockController) OpnamePost(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		_, err := services.PostOpname(tx, actor.ID, id, ctx.ClientIP())
		return err
	})
	if err != nil {
		handleError(ctx, c.Logger, "post opname", err)
		return
	}
	c.respondOpname(ctx, id, http.StatusOK, "Stok opname berhasil diposting")
}

// OpnameDelete godoc
// @Summary Hapus sesi opname (hanya draft)
// @Tags Stock Opname
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response
// @Failure 409 {object} dto.Response
// @Router /stock-opnames/{id} [delete]
func (c *StockController) OpnameDelete(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		var op models.StockOpname
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&op, id).Error; err != nil {
			return err
		}
		if op.Status != "draft" {
			return &services.BizError{Status: http.StatusConflict, Message: "Sesi opname yang sudah diposting tidak bisa dihapus"}
		}
		if err := tx.Delete(&op).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: "delete", EntityType: "stock_opname", EntityID: &op.ID, Before: op, IP: ctx.ClientIP()})
	})
	if err != nil {
		handleError(ctx, c.Logger, "delete opname", err)
		return
	}
	ok(ctx, http.StatusOK, "Sesi opname dihapus", nil)
}
