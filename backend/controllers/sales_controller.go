package controllers

import (
	"errors"
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
)

// SalesController serves shifts (F9), POS transactions and held orders (F10–F12), void/returns (F14),
// reports (F15) and alerts (F16).
type SalesController struct {
	DB     *gorm.DB
	Logger *services.ServiceLogger
}

func NewSalesController() *SalesController {
	return &SalesController{DB: config.GetDB(), Logger: services.GetServiceLogger("sales")}
}

// ==================================================================
// SHIFT
// ==================================================================

// ShiftCurrent godoc
// @Summary Shift terbuka milik user (null jika belum buka)
// @Tags Shifts
// @Produce json
// @Security BearerAuth
// @Success 200 {object} dto.Response{data=models.Shift}
// @Router /shifts/current [get]
func (c *SalesController) ShiftCurrent(ctx *gin.Context) {
	actor := middleware.CurrentUser(ctx)
	var s models.Shift
	err := c.DB.Preload("Till").Preload("User").Where("user_id = ? AND status = 'open'", actor.ID).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		ok(ctx, http.StatusOK, "Belum ada shift terbuka", nil)
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, "current shift", err)
		return
	}
	ok(ctx, http.StatusOK, "Shift terbuka", s)
}

// ShiftOpen godoc
// @Summary Buka shift dengan modal awal
// @Tags Shifts
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.ShiftOpenRequest true "Till + modal awal"
// @Success 201 {object} dto.Response{data=models.Shift}
// @Failure 409 {object} dto.Response
// @Router /shifts/open [post]
func (c *SalesController) ShiftOpen(ctx *gin.Context) {
	var req dto.ShiftOpenRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	actor := middleware.CurrentUser(ctx)
	var s *models.Shift
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		s, err = services.OpenShift(tx, actor.ID, req.TillID, req.OpeningCash, ctx.ClientIP())
		return err
	})
	if err != nil {
		handleError(ctx, c.Logger, "open shift", err)
		return
	}
	ok(ctx, http.StatusCreated, "Shift dibuka", s)
}

// ShiftIndex godoc
// @Summary Daftar shift (milik sendiri; semua jika perm_transactions)
// @Tags Shifts
// @Produce json
// @Security BearerAuth
// @Param user_id query int false "Kasir (perm_transactions)"
// @Param till_id query int false "Till"
// @Param status query string false "open|closed"
// @Success 200 {object} dto.Response{data=dto.ShiftListData}
// @Router /shifts [get]
func (c *SalesController) ShiftIndex(ctx *gin.Context) {
	actor := middleware.CurrentUser(ctx)
	page, perPage, offset := helpers.ParsePagination(ctx)
	q := c.DB.Model(&models.Shift{})
	if !actor.PermTransactions {
		q = q.Where("user_id = ?", actor.ID)
	} else if id := queryUint(ctx, "user_id"); id > 0 {
		q = q.Where("user_id = ?", id)
	}
	if id := queryUint(ctx, "till_id"); id > 0 {
		q = q.Where("till_id = ?", id)
	}
	if s := ctx.Query("status"); s != "" {
		q = q.Where("status = ?", s)
	}
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count shifts", err)
		return
	}
	shifts := []models.Shift{}
	if err := q.Preload("User").Preload("Till").Order("opened_at DESC, id DESC").Offset(offset).Limit(perPage).Find(&shifts).Error; err != nil {
		serverError(ctx, c.Logger, "list shifts", err)
		return
	}
	ok(ctx, http.StatusOK, "Data shift berhasil diambil", dto.ShiftListData{Shifts: shifts, Pagination: dto.NewPaginationMeta(page, perPage, total)})
}

// ShiftDetail godoc
// @Summary Detail shift + rekap per metode + kas seharusnya
// @Tags Shifts
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response{data=dto.ShiftDetail}
// @Router /shifts/{id} [get]
func (c *SalesController) ShiftDetail(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	var s models.Shift
	if err := c.DB.Preload("User").Preload("Till").First(&s, id).Error; err != nil {
		handleError(ctx, c.Logger, "shift detail", err)
		return
	}
	actor := middleware.CurrentUser(ctx)
	if s.UserID != actor.ID && !actor.PermTransactions {
		fail(ctx, http.StatusForbidden, "Anda hanya bisa melihat shift sendiri")
		return
	}
	recap, err := services.RecapShift(c.DB, &s)
	if err != nil {
		serverError(ctx, c.Logger, "shift recap", err)
		return
	}
	ok(ctx, http.StatusOK, "Data shift berhasil diambil", dto.ShiftDetail{Shift: s, Recap: recap})
}

// ShiftClose godoc
// @Summary Tutup shift (hanya pemilik): simpan kas fisik & selisih
// @Tags Shifts
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Param body body dto.ShiftCloseRequest true "Kas fisik"
// @Success 200 {object} dto.Response{data=dto.ShiftDetail}
// @Failure 409 {object} dto.Response
// @Router /shifts/{id}/close [post]
func (c *SalesController) ShiftClose(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	var req dto.ShiftCloseRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	actor := middleware.CurrentUser(ctx)
	var s *models.Shift
	var recap *dto.ShiftRecap
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		s, recap, err = services.CloseShift(tx, actor.ID, id, *req.CountedCash, req.Note, ctx.ClientIP())
		return err
	})
	if err != nil {
		handleError(ctx, c.Logger, "close shift", err)
		return
	}
	c.DB.Preload("User").Preload("Till").First(s, s.ID)
	ok(ctx, http.StatusOK, "Shift ditutup", dto.ShiftDetail{Shift: *s, Recap: recap})
}

// ==================================================================
// TRANSAKSI
// ==================================================================

func cartFrom(items []dto.CartLineRequest) []services.CartLine {
	out := make([]services.CartLine, len(items))
	for i, it := range items {
		out[i] = services.CartLine{ProductUnitID: it.ProductUnitID, Quantity: it.Quantity}
	}
	return out
}

// TransactionStore godoc
// @Summary Simpan transaksi POS: held (tahan) atau paid (bayar). Harga & total dihitung server.
// @Tags Transactions
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.TransactionRequest true "Keranjang"
// @Success 201 {object} dto.Response{data=models.Transaction}
// @Failure 409 {object} dto.Response
// @Failure 422 {object} dto.Response
// @Router /transactions [post]
func (c *SalesController) TransactionStore(ctx *gin.Context) {
	var req dto.TransactionRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	in := services.CartInput{TillID: req.TillID, Items: cartFrom(req.Items), Discount: req.Discount, CustomerID: req.CustomerID,
		RefNumber: req.RefNumber, PrescriptionNumber: req.PrescriptionNumber, PrescriptionNote: req.PrescriptionNote}
	if in.CustomerID != nil && *in.CustomerID == 0 {
		in.CustomerID = nil
	}
	if req.Status == "paid" && req.Payment == nil {
		fail(ctx, http.StatusUnprocessableEntity, "Data pembayaran wajib diisi")
		return
	}
	actor := middleware.CurrentUser(ctx)
	var t *models.Transaction
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		if req.Status == "held" {
			t, err = services.Hold(tx, actor.ID, in, ctx.ClientIP())
		} else {
			t, err = services.Checkout(tx, actor.ID, in, services.PaymentInput{Method: req.Payment.Method, Paid: req.Payment.Paid, Info: req.Payment.Info}, ctx.ClientIP())
		}
		return err
	})
	if err != nil {
		handleError(ctx, c.Logger, "store transaction", err)
		return
	}
	msg := "Transaksi berhasil dibayar"
	if req.Status == "held" {
		msg = "Pesanan ditahan"
	}
	c.respondTransaction(ctx, t.ID, http.StatusCreated, msg)
}

func (c *SalesController) loadTransaction(id uint64) (*models.Transaction, error) {
	var t models.Transaction
	err := c.DB.Preload("Customer").Preload("Till").Preload("Cashier").Preload("Creator").
		Preload("Items", func(db *gorm.DB) *gorm.DB { return db.Order("id") }).
		Preload("Items.Batches", func(db *gorm.DB) *gorm.DB { return db.Order("id") }).
		Preload("Items.Batches.Batch").
		Preload("Returns", func(db *gorm.DB) *gorm.DB { return db.Order("id") }).
		Preload("Returns.Items").Preload("Returns.User").
		First(&t, id).Error
	return &t, err
}

func (c *SalesController) respondTransaction(ctx *gin.Context, id uint64, code int, msg string) {
	t, err := c.loadTransaction(id)
	if err != nil {
		handleError(ctx, c.Logger, "load transaction", err)
		return
	}
	ok(ctx, code, msg, t)
}

// TransactionDetail godoc
// @Summary Detail transaksi + item + batch + retur (untuk struk)
// @Tags Transactions
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response{data=models.Transaction}
// @Failure 403 {object} dto.Response "tanpa perm_transactions: hanya pesanan tertunda & transaksi sendiri"
// @Router /transactions/{id} [get]
func (c *SalesController) TransactionDetail(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	t, err := c.loadTransaction(id)
	if err != nil {
		handleError(ctx, c.Logger, "load transaction", err)
		return
	}
	// Without perm_transactions: held orders (a shared queue) and the user's own sales only.
	actor := middleware.CurrentUser(ctx)
	own := t.CreatedBy == actor.ID || (t.PaidBy != nil && *t.PaidBy == actor.ID)
	if !actor.PermTransactions && t.Status != "held" && !own {
		fail(ctx, http.StatusForbidden, "Anda hanya bisa melihat transaksi sendiri")
		return
	}
	ok(ctx, http.StatusOK, "Data transaksi berhasil diambil", t)
}

// HeldIndex godoc
// @Summary Pesanan tertunda: type=tab (ada no. ref) atau customer (pelanggan tanpa ref)
// @Tags Transactions
// @Produce json
// @Security BearerAuth
// @Param type query string false "tab|customer"
// @Param search query string false "No. ref / nama pelanggan"
// @Success 200 {object} dto.Response{data=dto.HeldListData}
// @Router /transactions/held [get]
func (c *SalesController) HeldIndex(ctx *gin.Context) {
	page, perPage, offset := helpers.ParsePagination(ctx)
	q := c.DB.Table("transactions t").Where("t.status = 'held'").
		Joins("LEFT JOIN customers cu ON cu.id = t.customer_id").
		Joins("JOIN users u ON u.id = t.created_by")
	switch ctx.Query("type") {
	case "tab":
		q = q.Where("t.ref_number IS NOT NULL")
	case "customer":
		q = q.Where("t.ref_number IS NULL AND t.customer_id IS NOT NULL")
	}
	if s := strings.TrimSpace(ctx.Query("search")); s != "" {
		p := helpers.LikePattern(s)
		q = q.Where("t.ref_number ILIKE ? OR cu.name ILIKE ?", p, p)
	}
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count held", err)
		return
	}
	rows := []dto.HeldItem{}
	err := q.Select(`t.id, t.ref_number, t.customer_id, cu.name AS customer_name, t.till_id, t.total, t.created_by, u.fullname AS creator_name, t.created_at,
		(SELECT COUNT(*) FROM transaction_items i WHERE i.transaction_id = t.id) AS item_count`).
		Order("t.created_at DESC, t.id DESC").Offset(offset).Limit(perPage).Scan(&rows).Error
	if err != nil {
		serverError(ctx, c.Logger, "list held", err)
		return
	}
	ok(ctx, http.StatusOK, "Data pesanan tertunda berhasil diambil", dto.HeldListData{Transactions: rows, Pagination: dto.NewPaginationMeta(page, perPage, total)})
}

// HeldUpdate godoc
// @Summary Ubah isi pesanan tertunda
// @Tags Transactions
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Param body body dto.HeldUpdateRequest true "Keranjang"
// @Success 200 {object} dto.Response{data=models.Transaction}
// @Router /transactions/{id} [put]
func (c *SalesController) HeldUpdate(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	var req dto.HeldUpdateRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	in := services.CartInput{TillID: req.TillID, Items: cartFrom(req.Items), Discount: req.Discount, CustomerID: req.CustomerID,
		RefNumber: req.RefNumber, PrescriptionNumber: req.PrescriptionNumber, PrescriptionNote: req.PrescriptionNote}
	if in.CustomerID != nil && *in.CustomerID == 0 {
		in.CustomerID = nil
	}
	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		_, err := services.UpdateHeld(tx, actor.ID, id, in, ctx.ClientIP())
		return err
	})
	if err != nil {
		handleError(ctx, c.Logger, "update held", err)
		return
	}
	c.respondTransaction(ctx, id, http.StatusOK, "Pesanan tertunda diperbarui")
}

// HeldPay godoc
// @Summary Bayar pesanan tertunda (stok, harga, FEFO dihitung ulang)
// @Tags Transactions
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Param body body dto.PayHeldRequest true "Pembayaran"
// @Success 200 {object} dto.Response{data=models.Transaction}
// @Router /transactions/{id}/pay [post]
func (c *SalesController) HeldPay(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	var req dto.PayHeldRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	if req.CustomerID != nil && *req.CustomerID == 0 {
		req.CustomerID = nil
	}
	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		_, err := services.PayHeld(tx, actor.ID, id, services.PaymentInput{Method: req.Payment.Method, Paid: req.Payment.Paid, Info: req.Payment.Info}, req.TillID,
			services.PayHeldOverrides{CustomerID: req.CustomerID, PrescriptionNumber: req.PrescriptionNumber, PrescriptionNote: req.PrescriptionNote}, ctx.ClientIP())
		return err
	})
	if err != nil {
		handleError(ctx, c.Logger, "pay held", err)
		return
	}
	c.respondTransaction(ctx, id, http.StatusOK, "Pesanan berhasil dibayar")
}

// HeldDelete godoc
// @Summary Hapus pesanan tertunda (hanya status held)
// @Tags Transactions
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response
// @Failure 409 {object} dto.Response
// @Router /transactions/{id} [delete]
func (c *SalesController) HeldDelete(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error { return services.DeleteHeld(tx, actor.ID, id, ctx.ClientIP()) })
	if err != nil {
		handleError(ctx, c.Logger, "delete held", err)
		return
	}
	ok(ctx, http.StatusOK, "Pesanan tertunda dihapus", nil)
}

// Void godoc
// @Summary Void transaksi lunas (shift masih buka, belum ada retur)
// @Tags Transactions
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Param body body dto.VoidRequest true "Alasan"
// @Success 200 {object} dto.Response{data=models.Transaction}
// @Failure 409 {object} dto.Response
// @Router /transactions/{id}/void [post]
func (c *SalesController) Void(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	var req dto.VoidRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		_, err := services.Void(tx, actor.ID, id, req.Reason, ctx.ClientIP())
		return err
	})
	if err != nil {
		handleError(ctx, c.Logger, "void", err)
		return
	}
	c.respondTransaction(ctx, id, http.StatusOK, "Transaksi di-void")
}

// Return godoc
// @Summary Retur penjualan (refund dihitung server)
// @Tags Transactions
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID transaksi"
// @Param body body dto.ReturnRequest true "Item retur"
// @Success 201 {object} dto.Response{data=models.SalesReturn}
// @Failure 409 {object} dto.Response
// @Failure 422 {object} dto.Response
// @Router /transactions/{id}/returns [post]
func (c *SalesController) Return(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	var req dto.ReturnRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	in := services.ReturnInput{Reason: req.Reason, RefundMethod: req.RefundMethod}
	for _, it := range req.Items {
		in.Items = append(in.Items, services.ReturnLine{TransactionItemID: it.TransactionItemID, BaseQuantity: it.BaseQuantity, Restock: it.Restock})
	}
	actor := middleware.CurrentUser(ctx)
	var ret *models.SalesReturn
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		ret, err = services.CreateReturn(tx, actor.ID, id, in, ctx.ClientIP())
		return err
	})
	if err != nil {
		handleError(ctx, c.Logger, "create return", err)
		return
	}
	c.respondReturn(ctx, ret.ID, http.StatusCreated, "Retur berhasil disimpan")
}

// transactionFilter applies the report filters (F15). Dates are Jakarta days on paid_at (created_at for held orders).
func (c *SalesController) transactionFilter(ctx *gin.Context, q *gorm.DB, alias string, defaultStatuses []string) (*gorm.DB, bool) {
	start, end, valid := parseDayRange(ctx)
	if !valid {
		return nil, false
	}
	a := alias + "."
	when := "COALESCE(" + a + "paid_at, " + a + "created_at)"
	if !start.IsZero() {
		q = q.Where(when+" >= ?", start)
	}
	if !end.IsZero() {
		q = q.Where(when+" < ?", end)
	}
	if id := queryUint(ctx, "user_id"); id > 0 {
		q = q.Where(a+"paid_by = ?", id)
	}
	if id := queryUint(ctx, "till_id"); id > 0 {
		q = q.Where(a+"till_id = ?", id)
	}
	if id := queryUint(ctx, "shift_id"); id > 0 {
		q = q.Where(a+"shift_id = ?", id)
	}
	if s := ctx.Query("status"); s != "" && defaultStatuses != nil {
		q = q.Where(a+"status = ?", s)
	} else if defaultStatuses != nil {
		q = q.Where(a+"status IN ?", defaultStatuses)
	}
	return q, true
}

func (c *SalesController) transactionList(ctx *gin.Context) (*gorm.DB, bool) {
	q := c.DB.Table("transactions t").
		Select(`t.id, t.invoice_number, t.ref_number, t.status, t.total, t.paid, t."change", t.payment_method, t.paid_at, t.created_at,
			t.till_id, tl.number AS till_number, tl.name AS till_name, t.shift_id, u.fullname AS cashier_name, cu.name AS customer_name,
			COALESCE(r.refund_total, 0) AS refund_total, COALESCE(r.return_count, 0) AS return_count`).
		Joins("JOIN tills tl ON tl.id = t.till_id").
		Joins("LEFT JOIN users u ON u.id = t.paid_by").
		Joins("LEFT JOIN customers cu ON cu.id = t.customer_id").
		Joins("LEFT JOIN LATERAL (SELECT SUM(total_refund) AS refund_total, COUNT(*) AS return_count FROM sales_returns sr WHERE sr.transaction_id = t.id) r ON TRUE")
	if s := strings.TrimSpace(ctx.Query("search")); s != "" {
		p := helpers.LikePattern(s)
		q = q.Where("t.invoice_number ILIKE ? OR t.ref_number ILIKE ? OR cu.name ILIKE ?", p, p, p)
	}
	return c.transactionFilter(ctx, q, "t", []string{"paid", "void"})
}

// TransactionIndex godoc
// @Summary Daftar transaksi (default lunas + void)
// @Tags Transactions
// @Produce json
// @Security BearerAuth
// @Param start_date query string false "YYYY-MM-DD"
// @Param end_date query string false "YYYY-MM-DD (inklusif)"
// @Param user_id query int false "Kasir"
// @Param till_id query int false "Till"
// @Param shift_id query int false "Shift"
// @Param status query string false "paid|void|held"
// @Param search query string false "No. invoice / ref / pelanggan"
// @Success 200 {object} dto.Response{data=dto.TransactionListData}
// @Router /transactions [get]
func (c *SalesController) TransactionIndex(ctx *gin.Context) {
	q, valid := c.transactionList(ctx)
	if !valid {
		return
	}
	page, perPage, offset := helpers.ParsePagination(ctx)
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count transactions", err)
		return
	}
	rows := []dto.TransactionListItem{}
	if err := q.Order("COALESCE(t.paid_at, t.created_at) DESC, t.id DESC").Offset(offset).Limit(perPage).Scan(&rows).Error; err != nil {
		serverError(ctx, c.Logger, "list transactions", err)
		return
	}
	ok(ctx, http.StatusOK, "Data transaksi berhasil diambil", dto.TransactionListData{Transactions: rows, Pagination: dto.NewPaginationMeta(page, perPage, total)})
}

var paymentLabels = map[string]string{"cash": "Tunai", "card": "Kartu/Debit", "qris": "QRIS/Transfer"}
var statusLabels = map[string]string{"paid": "Lunas", "void": "Void", "held": "Tertunda"}

// TransactionExport godoc
// @Summary Export transaksi ke Excel (filter sama dengan daftar)
// @Tags Transactions
// @Produce application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// @Security BearerAuth
// @Success 200 {file} file
// @Router /transactions/export [get]
func (c *SalesController) TransactionExport(ctx *gin.Context) {
	q, valid := c.transactionList(ctx)
	if !valid {
		return
	}
	rows := []dto.TransactionListItem{}
	if err := q.Order("COALESCE(t.paid_at, t.created_at), t.id").Limit(maxExportRows).Scan(&rows).Error; err != nil {
		serverError(ctx, c.Logger, "export transactions", err)
		return
	}
	headers := []string{"No. invoice", "Tanggal", "Status", "Total", "Dibayar", "Kembalian", "Metode", "Till", "Kasir", "Pelanggan", "Refund"}
	out := make([][]any, len(rows))
	for i, r := range rows {
		when := ""
		if r.PaidAt != nil {
			when = r.PaidAt.In(helpers.Jakarta).Format("2006-01-02 15:04")
		}
		method := ""
		if r.PaymentMethod != nil {
			method = paymentLabels[*r.PaymentMethod]
		}
		out[i] = []any{deref(r.InvoiceNumber), when, statusLabels[r.Status], r.Total, r.Paid, r.Change, method, r.TillName, deref(r.CashierName), deref(r.CustomerName), r.RefundTotal}
	}
	if err := writeXLSX(ctx, "transaksi-"+helpers.Today()+".xlsx", headers, out); err != nil {
		c.Logger.Error("write xlsx", map[string]any{"error": err.Error()})
	}
}

// Summary godoc
// @Summary Ringkasan laporan: bruto, retur, bersih, HPP, laba kotor, DPP/PPN, produk terjual
// @Description Angka untuk transaksi lunas yang dibayar dalam periode, termasuk retur atas transaksi tersebut.
// @Tags Transactions
// @Produce json
// @Security BearerAuth
// @Param start_date query string false "YYYY-MM-DD"
// @Param end_date query string false "YYYY-MM-DD (inklusif)"
// @Param user_id query int false "Kasir"
// @Param till_id query int false "Till"
// @Param shift_id query int false "Shift"
// @Success 200 {object} dto.Response{data=dto.SalesSummary}
// @Router /transactions/summary [get]
func (c *SalesController) Summary(ctx *gin.Context) {
	paidTx, valid := c.transactionFilter(ctx, c.DB.Table("transactions st").Select("st.id").Where("st.status = 'paid'"), "st", nil)
	if !valid {
		return
	}
	var s dto.SalesSummary

	var head struct {
		Count int64
		Dpp   int64
		Ppn   int64
	}
	if err := c.DB.Table("transactions").Select("COUNT(*) AS count, COALESCE(SUM(dpp), 0) AS dpp, COALESCE(SUM(ppn), 0) AS ppn").
		Where("id IN (?)", paidTx).Scan(&head).Error; err != nil {
		serverError(ctx, c.Logger, "summary head", err)
		return
	}
	s.TransactionCount, s.Dpp, s.Ppn = head.Count, head.Dpp, head.Ppn

	// Output tax on refunds, split with each transaction's own rate (BR9).
	var refundsByRate []struct {
		PpnRate float64
		Refund  int64
	}
	if err := c.DB.Table("sales_returns sr").Select("t.ppn_rate, COALESCE(SUM(sr.total_refund), 0) AS refund").
		Joins("JOIN transactions t ON t.id = sr.transaction_id").Where("sr.transaction_id IN (?)", paidTx).
		Group("t.ppn_rate").Scan(&refundsByRate).Error; err != nil {
		serverError(ctx, c.Logger, "summary refund tax", err)
		return
	}
	for _, r := range refundsByRate {
		dpp, ppn := helpers.SplitTax(r.Refund, helpers.RateBasisPoints(r.PpnRate))
		s.Dpp -= dpp
		s.Ppn -= ppn
	}

	// One row per product; the cards are the column sums (BR11).
	var summaryRows []summaryRow
	err := c.DB.Table("transaction_items ti").
		Select(`ti.product_id, MAX(ti.product_name) AS product_name, MAX(bu.name) AS base_unit,
			SUM(ti.quantity * ti.conversion_qty - ti.returned_base_quantity) AS sold_quantity,
			MAX(COALESCE(st.qty, 0)) AS stock_quantity,
			SUM(ti.line_total - ti.discount_share) AS gross,
			SUM(COALESCE(r.refund, 0)) AS refund,
			SUM(COALESCE(b.cost, 0) - COALESCE(r.restock_cost, 0)) AS cogs`).
		Joins("LEFT JOIN (SELECT transaction_item_id, SUM(quantity * cost_price) AS cost FROM transaction_item_batches GROUP BY transaction_item_id) b ON b.transaction_item_id = ti.id").
		Joins("LEFT JOIN (SELECT transaction_item_id, SUM(refund_amount) AS refund, SUM(cost_amount) FILTER (WHERE restock) AS restock_cost FROM sales_return_items GROUP BY transaction_item_id) r ON r.transaction_item_id = ti.id").
		// quantity > 0 does not change the sum but lets the partial FEFO index serve it.
		Joins("LEFT JOIN (SELECT product_id, SUM(quantity) AS qty FROM product_batches WHERE quantity > 0 GROUP BY product_id) st ON st.product_id = ti.product_id").
		Joins("LEFT JOIN product_units bu ON bu.product_id = ti.product_id AND bu.is_base AND bu.deleted_at IS NULL").
		Where("ti.transaction_id IN (?)", paidTx).
		Group("ti.product_id").Order("gross DESC").
		Scan(&summaryRows).Error
	if err != nil {
		serverError(ctx, c.Logger, "summary products", err)
		return
	}
	s.Products = make([]dto.SoldProductItem, 0, len(summaryRows))
	for _, r := range summaryRows {
		net := r.Gross - r.Refund
		s.GrossSales += r.Gross
		s.Returns += r.Refund
		s.Cogs += r.Cogs
		s.ItemsSold += r.SoldQuantity
		s.Products = append(s.Products, dto.SoldProductItem{ProductID: r.ProductID, ProductName: r.ProductName, BaseUnit: r.BaseUnit,
			SoldQuantity: r.SoldQuantity, StockQuantity: r.StockQuantity, NetSales: net, Cogs: r.Cogs, Profit: net - r.Cogs})
	}
	s.NetSales = s.GrossSales - s.Returns
	s.GrossProfit = s.NetSales - s.Cogs
	ok(ctx, http.StatusOK, "Ringkasan penjualan berhasil diambil", s)
}

// ==================================================================
// RETUR
// ==================================================================

// ReturnIndex godoc
// @Summary Daftar retur penjualan
// @Tags Sales Returns
// @Produce json
// @Security BearerAuth
// @Param start_date query string false "YYYY-MM-DD"
// @Param end_date query string false "YYYY-MM-DD (inklusif)"
// @Param search query string false "No. retur / no. invoice"
// @Success 200 {object} dto.Response{data=dto.SalesReturnListData}
// @Router /sales-returns [get]
func (c *SalesController) ReturnIndex(ctx *gin.Context) {
	start, end, valid := parseDayRange(ctx)
	if !valid {
		return
	}
	page, perPage, offset := helpers.ParsePagination(ctx)
	q := c.DB.Table("sales_returns sr").
		Joins("JOIN transactions t ON t.id = sr.transaction_id").
		Joins("JOIN users u ON u.id = sr.user_id").
		Joins("JOIN tills tl ON tl.id = sr.till_id")
	if !start.IsZero() {
		q = q.Where("sr.created_at >= ?", start)
	}
	if !end.IsZero() {
		q = q.Where("sr.created_at < ?", end)
	}
	if s := strings.TrimSpace(ctx.Query("search")); s != "" {
		p := helpers.LikePattern(s)
		q = q.Where("sr.return_number ILIKE ? OR t.invoice_number ILIKE ?", p, p)
	}
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count returns", err)
		return
	}
	rows := []dto.SalesReturnListItem{}
	if err := q.Select("sr.*, t.invoice_number, u.username, tl.number AS till_number").Order("sr.created_at DESC, sr.id DESC").Offset(offset).Limit(perPage).Scan(&rows).Error; err != nil {
		serverError(ctx, c.Logger, "list returns", err)
		return
	}
	ok(ctx, http.StatusOK, "Data retur berhasil diambil", dto.SalesReturnListData{SalesReturns: rows, Pagination: dto.NewPaginationMeta(page, perPage, total)})
}

func (c *SalesController) respondReturn(ctx *gin.Context, id uint64, code int, msg string) {
	var r models.SalesReturn
	err := c.DB.Preload("User").Preload("Till").Preload("Transaction").Preload("Transaction.Customer").
		Preload("Items", func(db *gorm.DB) *gorm.DB { return db.Order("id") }).Preload("Items.TransactionItem").
		First(&r, id).Error
	if err != nil {
		handleError(ctx, c.Logger, "load return", err)
		return
	}
	ok(ctx, code, msg, r)
}

// ReturnDetail godoc
// @Summary Detail retur (untuk struk retur)
// @Tags Sales Returns
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response{data=models.SalesReturn}
// @Failure 403 {object} dto.Response "tanpa perm_transactions: hanya retur sendiri"
// @Router /sales-returns/{id} [get]
func (c *SalesController) ReturnDetail(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	actor := middleware.CurrentUser(ctx)
	if !actor.PermTransactions {
		var owner uint64
		if err := c.DB.Table("sales_returns").Select("user_id").Where("id = ?", id).Scan(&owner).Error; err != nil {
			serverError(ctx, c.Logger, "return owner", err)
			return
		}
		if owner != actor.ID {
			fail(ctx, http.StatusForbidden, "Anda hanya bisa melihat retur yang Anda buat")
			return
		}
	}
	c.respondReturn(ctx, id, http.StatusOK, "Data retur berhasil diambil")
}

// ==================================================================
// PERINGATAN
// ==================================================================

const alertListLimit = 20

// Alerts godoc
// @Summary Peringatan: batch ED, hampir ED, stok menipis/habis, hutang jatuh tempo (perm_purchases)
// @Tags Alerts
// @Produce json
// @Security BearerAuth
// @Success 200 {object} dto.Response{data=dto.AlertsData}
// @Router /alerts [get]
func (c *SalesController) Alerts(ctx *gin.Context) {
	today := helpers.Today()
	warn := helpers.TodayPlus(expiryWarningDays(c.DB))
	data := dto.AlertsData{ExpiredBatches: []dto.AlertBatch{}, NearExpiryBatches: []dto.AlertBatch{}, LowStock: []dto.AlertProduct{}, OutOfStock: []dto.AlertProduct{}}

	batches := func(where string, args ...any) *gorm.DB {
		return c.DB.Table("product_batches b").Joins("JOIN products p ON p.id = b.product_id AND p.deleted_at IS NULL").Where("b.quantity > 0").Where(where, args...)
	}
	const batchSel = "b.id, b.product_id, p.name AS product_name, b.batch_number, b.expiration_date, b.quantity"
	if err := batches("b.expiration_date <= ?::date", today).Count(&data.Counts.ExpiredBatches).Error; err != nil {
		serverError(ctx, c.Logger, "alerts", err)
		return
	}
	batches("b.expiration_date <= ?::date", today).Select(batchSel).Order("b.expiration_date, b.id").Limit(alertListLimit).Scan(&data.ExpiredBatches)
	batches("b.expiration_date > ?::date AND b.expiration_date <= ?::date", today, warn).Count(&data.Counts.NearExpiryBatches)
	batches("b.expiration_date > ?::date AND b.expiration_date <= ?::date", today, warn).Select(batchSel).Order("b.expiration_date, b.id").Limit(alertListLimit).Scan(&data.NearExpiryBatches)

	stock := c.DB.Table("products p").
		Select("p.id, p.name, p.min_stock, COALESCE((SELECT SUM(quantity) FROM product_batches b WHERE b.product_id = p.id AND b.expiration_date > ?::date), 0) AS sellable_stock", today).
		Where("p.deleted_at IS NULL AND p.track_stock")
	products := func() *gorm.DB { return c.DB.Table("(?) AS s", stock) }
	products().Where("s.sellable_stock = 0").Count(&data.Counts.OutOfStock)
	products().Where("s.sellable_stock = 0").Order("s.name").Limit(alertListLimit).Scan(&data.OutOfStock)
	products().Where("s.sellable_stock > 0 AND s.sellable_stock <= s.min_stock").Count(&data.Counts.LowStock)
	products().Where("s.sellable_stock > 0 AND s.sellable_stock <= s.min_stock").Order("s.sellable_stock, s.name").Limit(alertListLimit).Scan(&data.LowStock)

	if middleware.CurrentUser(ctx).PermPurchases {
		var due int64
		payables := func() *gorm.DB {
			return c.DB.Table("purchases pu").Joins("JOIN suppliers s ON s.id = pu.supplier_id").
				Where("pu.payment_status = 'unpaid' AND pu.due_date <= ?::date", helpers.TodayPlus(7))
		}
		payables().Count(&due)
		data.Counts.PayablesDue = &due
		data.PayablesDue = []dto.AlertPayable{}
		payables().Select("pu.id, s.name AS supplier_name, pu.invoice_number, pu.due_date, pu.total").Order("pu.due_date, pu.id").Limit(alertListLimit).Scan(&data.PayablesDue)
	}
	ok(ctx, http.StatusOK, "Data peringatan berhasil diambil", data)
}

// summaryRow is one product line of the sales summary query.
type summaryRow struct {
	ProductID     uint64
	ProductName   string
	BaseUnit      *string
	SoldQuantity  int64
	StockQuantity int64
	Gross         int64
	Refund        int64
	Cogs          int64
}
