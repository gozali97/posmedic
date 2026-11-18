package controllers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"pos-apotek-api/config"
	"pos-apotek-api/dto"
	"pos-apotek-api/helpers"
	"pos-apotek-api/middleware"
	"pos-apotek-api/models"
	"pos-apotek-api/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// MasterController serves categories (F3), customers (F4) and suppliers (F5).
type MasterController struct {
	DB     *gorm.DB
	Logger *services.ServiceLogger
}

func NewMasterController() *MasterController {
	return &MasterController{DB: config.GetDB(), Logger: services.GetServiceLogger("master")}
}

func (c *MasterController) audit(ctx *gin.Context, tx *gorm.DB, action, entity string, id uint64, before, after any) error {
	actor := middleware.CurrentUser(ctx)
	return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: action, EntityType: entity, EntityID: &id, Before: before, After: after, IP: ctx.ClientIP()})
}

// ==================================================================
// KATEGORI
// ==================================================================

// CategoryIndex godoc
// @Summary Daftar kategori (all=1 untuk dropdown tanpa paginasi)
// @Tags Categories
// @Produce json
// @Security BearerAuth
// @Param search query string false "Cari nama"
// @Param all query int false "1 = semua tanpa paginasi"
// @Success 200 {object} dto.Response{data=dto.CategoryListData}
// @Router /categories [get]
func (c *MasterController) CategoryIndex(ctx *gin.Context) {
	search := strings.TrimSpace(ctx.Query("search"))
	q := func() *gorm.DB {
		q := c.DB.Table("categories")
		if search != "" {
			q = q.Where("categories.name ILIKE ?", helpers.LikePattern(search))
		}
		return q
	}
	sel := "categories.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = categories.id AND p.deleted_at IS NULL) AS product_count"
	data := dto.CategoryListData{Categories: []dto.CategoryItem{}, Filters: dto.SearchFilters{Search: search}}
	if ctx.Query("all") == "1" {
		if err := q().Select(sel).Order("categories.name").Scan(&data.Categories).Error; err != nil {
			serverError(ctx, c.Logger, "list categories", err)
			return
		}
		ok(ctx, http.StatusOK, "Data kategori berhasil diambil", data)
		return
	}
	page, perPage, offset := helpers.ParsePagination(ctx)
	var total int64
	if err := q().Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count categories", err)
		return
	}
	if err := q().Select(sel).Order("categories.name").Offset(offset).Limit(perPage).Scan(&data.Categories).Error; err != nil {
		serverError(ctx, c.Logger, "list categories", err)
		return
	}
	meta := dto.NewPaginationMeta(page, perPage, total)
	data.Pagination = &meta
	ok(ctx, http.StatusOK, "Data kategori berhasil diambil", data)
}

// CategoryStore godoc
// @Summary Tambah kategori
// @Tags Categories
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.CategoryRequest true "Kategori"
// @Success 201 {object} dto.Response{data=models.Category}
// @Failure 409 {object} dto.Response
// @Router /categories [post]
func (c *MasterController) CategoryStore(ctx *gin.Context) {
	var req dto.CategoryRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	cat := models.Category{Name: strings.TrimSpace(req.Name)}
	c.saveCategory(ctx, &cat, nil, "create", http.StatusCreated)
}

// CategoryUpdate godoc
// @Summary Ubah kategori
// @Tags Categories
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Param body body dto.CategoryRequest true "Kategori"
// @Success 200 {object} dto.Response{data=models.Category}
// @Router /categories/{id} [put]
func (c *MasterController) CategoryUpdate(ctx *gin.Context) {
	var req dto.CategoryRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	var cat models.Category
	if !c.find(ctx, &cat, "Kategori") {
		return
	}
	before := cat
	cat.Name = strings.TrimSpace(req.Name)
	c.saveCategory(ctx, &cat, before, "update", http.StatusOK)
}

func (c *MasterController) saveCategory(ctx *gin.Context, cat *models.Category, before any, action string, code int) {
	if cat.Name == "" {
		fail(ctx, http.StatusUnprocessableEntity, "Nama kategori wajib diisi")
		return
	}
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(cat).Error; err != nil {
			return err
		}
		return c.audit(ctx, tx, action, "category", cat.ID, before, cat)
	})
	if helpers.IsUniqueViolation(err) {
		fail(ctx, http.StatusConflict, "Nama kategori sudah dipakai")
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, action+" category", err)
		return
	}
	ok(ctx, code, "Kategori berhasil disimpan", cat)
}

// CategoryDelete godoc
// @Summary Hapus kategori (ditolak jika masih dipakai produk)
// @Tags Categories
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response
// @Failure 409 {object} dto.Response
// @Router /categories/{id} [delete]
func (c *MasterController) CategoryDelete(ctx *gin.Context) {
	var cat models.Category
	if !c.find(ctx, &cat, "Kategori") {
		return
	}
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&cat).Error; err != nil {
			return err
		}
		return c.audit(ctx, tx, "delete", "category", cat.ID, cat, nil)
	})
	if helpers.IsFKViolation(err) {
		fail(ctx, http.StatusConflict, "Kategori masih dipakai produk")
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, "delete category", err)
		return
	}
	ok(ctx, http.StatusOK, "Kategori berhasil dihapus", nil)
}

// ==================================================================
// PELANGGAN
// ==================================================================

// CustomerIndex godoc
// @Summary Daftar pelanggan
// @Tags Customers
// @Produce json
// @Security BearerAuth
// @Param search query string false "Cari nama/telepon"
// @Success 200 {object} dto.Response{data=dto.CustomerListData}
// @Router /customers [get]
func (c *MasterController) CustomerIndex(ctx *gin.Context) {
	page, perPage, offset := helpers.ParsePagination(ctx)
	search := strings.TrimSpace(ctx.Query("search"))
	q := func() *gorm.DB {
		q := c.DB.Model(&models.Customer{})
		if search != "" {
			p := helpers.LikePattern(search)
			q = q.Where("name ILIKE ? OR phone ILIKE ?", p, p)
		}
		return q
	}
	var total int64
	if err := q().Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count customers", err)
		return
	}
	customers := []models.Customer{}
	if err := q().Order("name, id").Offset(offset).Limit(perPage).Find(&customers).Error; err != nil {
		serverError(ctx, c.Logger, "list customers", err)
		return
	}
	ok(ctx, http.StatusOK, "Data pelanggan berhasil diambil", dto.CustomerListData{Customers: customers, Pagination: dto.NewPaginationMeta(page, perPage, total), Filters: dto.SearchFilters{Search: search}})
}

// CustomerDetail godoc
// @Summary Detail pelanggan
// @Tags Customers
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response{data=models.Customer}
// @Router /customers/{id} [get]
func (c *MasterController) CustomerDetail(ctx *gin.Context) {
	var cu models.Customer
	if c.find(ctx, &cu, "Pelanggan") {
		ok(ctx, http.StatusOK, "Data pelanggan berhasil diambil", cu)
	}
}

// CustomerStore godoc
// @Summary Tambah pelanggan
// @Tags Customers
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.CustomerRequest true "Pelanggan"
// @Success 201 {object} dto.Response{data=models.Customer}
// @Router /customers [post]
func (c *MasterController) CustomerStore(ctx *gin.Context) {
	var req dto.CustomerRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	var cu models.Customer
	c.saveCustomer(ctx, &cu, req, nil, "create", http.StatusCreated)
}

// CustomerUpdate godoc
// @Summary Ubah pelanggan
// @Tags Customers
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Param body body dto.CustomerRequest true "Pelanggan"
// @Success 200 {object} dto.Response{data=models.Customer}
// @Router /customers/{id} [put]
func (c *MasterController) CustomerUpdate(ctx *gin.Context) {
	var req dto.CustomerRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	var cu models.Customer
	if !c.find(ctx, &cu, "Pelanggan") {
		return
	}
	c.saveCustomer(ctx, &cu, req, cu, "update", http.StatusOK)
}

func (c *MasterController) saveCustomer(ctx *gin.Context, cu *models.Customer, req dto.CustomerRequest, before any, action string, code int) {
	cu.Name, cu.Phone, cu.Email, cu.Address = strings.TrimSpace(req.Name), trimPtr(req.Phone), trimPtr(req.Email), trimPtr(req.Address)
	if cu.Name == "" {
		fail(ctx, http.StatusUnprocessableEntity, "Nama pelanggan wajib diisi")
		return
	}
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(cu).Error; err != nil {
			return err
		}
		return c.audit(ctx, tx, action, "customer", cu.ID, before, cu)
	})
	if err != nil {
		serverError(ctx, c.Logger, action+" customer", err)
		return
	}
	ok(ctx, code, "Pelanggan berhasil disimpan", cu)
}

// CustomerDelete godoc
// @Summary Hapus pelanggan (ditolak jika sudah punya transaksi)
// @Tags Customers
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response
// @Failure 409 {object} dto.Response
// @Router /customers/{id} [delete]
func (c *MasterController) CustomerDelete(ctx *gin.Context) {
	var cu models.Customer
	if !c.find(ctx, &cu, "Pelanggan") {
		return
	}
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&cu).Error; err != nil {
			return err
		}
		return c.audit(ctx, tx, "delete", "customer", cu.ID, cu, nil)
	})
	if helpers.IsFKViolation(err) {
		fail(ctx, http.StatusConflict, "Pelanggan sudah punya transaksi; data tidak bisa dihapus")
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, "delete customer", err)
		return
	}
	ok(ctx, http.StatusOK, "Pelanggan berhasil dihapus", nil)
}

// ==================================================================
// SUPPLIER
// ==================================================================

// SupplierIndex godoc
// @Summary Daftar supplier (all=1 untuk dropdown)
// @Tags Suppliers
// @Produce json
// @Security BearerAuth
// @Param search query string false "Cari nama/kontak/telepon"
// @Param all query int false "1 = semua tanpa paginasi"
// @Success 200 {object} dto.Response{data=dto.SupplierListData}
// @Router /suppliers [get]
func (c *MasterController) SupplierIndex(ctx *gin.Context) {
	search := strings.TrimSpace(ctx.Query("search"))
	q := func() *gorm.DB {
		q := c.DB.Model(&models.Supplier{}).Where("deleted_at IS NULL")
		if search != "" {
			p := helpers.LikePattern(search)
			q = q.Where("name ILIKE ? OR contact_name ILIKE ? OR phone ILIKE ?", p, p, p)
		}
		return q
	}
	data := dto.SupplierListData{Suppliers: []models.Supplier{}, Filters: dto.SearchFilters{Search: search}}
	if ctx.Query("all") == "1" {
		if err := q().Order("name").Find(&data.Suppliers).Error; err != nil {
			serverError(ctx, c.Logger, "list suppliers", err)
			return
		}
		ok(ctx, http.StatusOK, "Data supplier berhasil diambil", data)
		return
	}
	page, perPage, offset := helpers.ParsePagination(ctx)
	var total int64
	if err := q().Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count suppliers", err)
		return
	}
	if err := q().Order("name, id").Offset(offset).Limit(perPage).Find(&data.Suppliers).Error; err != nil {
		serverError(ctx, c.Logger, "list suppliers", err)
		return
	}
	meta := dto.NewPaginationMeta(page, perPage, total)
	data.Pagination = &meta
	ok(ctx, http.StatusOK, "Data supplier berhasil diambil", data)
}

// SupplierDetail godoc
// @Summary Detail supplier
// @Tags Suppliers
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response{data=models.Supplier}
// @Router /suppliers/{id} [get]
func (c *MasterController) SupplierDetail(ctx *gin.Context) {
	var s models.Supplier
	if c.findSupplier(ctx, &s) {
		ok(ctx, http.StatusOK, "Data supplier berhasil diambil", s)
	}
}

// SupplierStore godoc
// @Summary Tambah supplier
// @Tags Suppliers
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.SupplierRequest true "Supplier"
// @Success 201 {object} dto.Response{data=models.Supplier}
// @Router /suppliers [post]
func (c *MasterController) SupplierStore(ctx *gin.Context) {
	var req dto.SupplierRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	s := models.Supplier{PaymentTermDays: 30}
	c.saveSupplier(ctx, &s, req, nil, "create", http.StatusCreated)
}

// SupplierUpdate godoc
// @Summary Ubah supplier
// @Tags Suppliers
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Param body body dto.SupplierRequest true "Supplier"
// @Success 200 {object} dto.Response{data=models.Supplier}
// @Router /suppliers/{id} [put]
func (c *MasterController) SupplierUpdate(ctx *gin.Context) {
	var req dto.SupplierRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	var s models.Supplier
	if !c.findSupplier(ctx, &s) {
		return
	}
	c.saveSupplier(ctx, &s, req, s, "update", http.StatusOK)
}

func (c *MasterController) saveSupplier(ctx *gin.Context, s *models.Supplier, req dto.SupplierRequest, before any, action string, code int) {
	s.Name = strings.TrimSpace(req.Name)
	s.Address, s.Phone, s.ContactName, s.TaxNumber = trimPtr(req.Address), trimPtr(req.Phone), trimPtr(req.ContactName), trimPtr(req.TaxNumber)
	if req.PaymentTermDays != nil {
		s.PaymentTermDays = *req.PaymentTermDays
	}
	if s.Name == "" {
		fail(ctx, http.StatusUnprocessableEntity, "Nama supplier wajib diisi")
		return
	}
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(s).Error; err != nil {
			return err
		}
		return c.audit(ctx, tx, action, "supplier", s.ID, before, s)
	})
	if err != nil {
		serverError(ctx, c.Logger, action+" supplier", err)
		return
	}
	ok(ctx, code, "Supplier berhasil disimpan", s)
}

// SupplierDelete godoc
// @Summary Hapus supplier (soft delete; ditolak jika sudah punya penerimaan)
// @Tags Suppliers
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response
// @Failure 409 {object} dto.Response
// @Router /suppliers/{id} [delete]
func (c *MasterController) SupplierDelete(ctx *gin.Context) {
	var s models.Supplier
	if !c.findSupplier(ctx, &s) {
		return
	}
	var purchases int64
	if err := c.DB.Model(&models.Purchase{}).Where("supplier_id = ?", s.ID).Count(&purchases).Error; err != nil {
		serverError(ctx, c.Logger, "count purchases", err)
		return
	}
	if purchases > 0 {
		fail(ctx, http.StatusConflict, "Supplier sudah punya penerimaan barang; tidak bisa dihapus")
		return
	}
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&s).Update("deleted_at", time.Now()).Error; err != nil {
			return err
		}
		return c.audit(ctx, tx, "delete", "supplier", s.ID, s, nil)
	})
	if err != nil {
		serverError(ctx, c.Logger, "delete supplier", err)
		return
	}
	ok(ctx, http.StatusOK, "Supplier berhasil dihapus", nil)
}

func (c *MasterController) findSupplier(ctx *gin.Context, s *models.Supplier) bool {
	id, valid := parseID(ctx)
	if !valid {
		return false
	}
	err := c.DB.Where("deleted_at IS NULL").First(s, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(ctx, http.StatusNotFound, "Supplier tidak ditemukan")
		return false
	}
	if err != nil {
		serverError(ctx, c.Logger, "find supplier", err)
		return false
	}
	return true
}

// find loads a row by :id into dst; label names the entity in the 404 message.
func (c *MasterController) find(ctx *gin.Context, dst any, label string) bool {
	id, valid := parseID(ctx)
	if !valid {
		return false
	}
	err := c.DB.First(dst, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(ctx, http.StatusNotFound, label+" tidak ditemukan")
		return false
	}
	if err != nil {
		serverError(ctx, c.Logger, "find "+label, err)
		return false
	}
	return true
}
