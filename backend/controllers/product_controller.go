package controllers

import (
	"encoding/json"
	"errors"
	"fmt"
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

type ProductController struct {
	DB     *gorm.DB
	Logger *services.ServiceLogger
}

func NewProductController() *ProductController {
	return &ProductController{DB: config.GetDB(), Logger: services.GetServiceLogger("product")}
}

// expiryWarningDays reads the store setting (default 90).
func expiryWarningDays(db *gorm.DB) int {
	days := 90
	db.Table("store_settings").Select("expiry_warning_days").Where("id = 1").Scan(&days)
	if days <= 0 {
		days = 90
	}
	return days
}

// productQuery returns products with stock aggregated from batches (D7): stock, sellable stock (unexpired) and nearest ED.
func (c *ProductController) productQuery() *gorm.DB {
	today, warn := helpers.Today(), helpers.TodayPlus(expiryWarningDays(c.DB))
	sub := c.DB.Table("products p").
		Select(`p.id, p.category_id, cat.name AS category_name, p.name, p.generic_name, p.drug_class, p.shelf_location,
			p.min_stock, p.track_stock, p.image, p.created_at, p.updated_at,
			COALESCE(s.stock, 0) AS stock, COALESCE(s.sellable, 0) AS sellable_stock, s.nearest_expiry,
			CASE WHEN NOT p.track_stock THEN 'ok' WHEN COALESCE(s.sellable, 0) = 0 THEN 'out'
				WHEN COALESCE(s.sellable, 0) <= p.min_stock THEN 'low' ELSE 'ok' END AS stock_status,
			CASE WHEN s.nearest_expiry IS NULL THEN 'none' WHEN s.nearest_expiry <= ?::date THEN 'expired'
				WHEN s.nearest_expiry <= ?::date THEN 'warning' ELSE 'ok' END AS expiry_status`, today, warn).
		Joins("LEFT JOIN categories cat ON cat.id = p.category_id").
		Joins(`LEFT JOIN LATERAL (SELECT SUM(b.quantity) AS stock, SUM(b.quantity) FILTER (WHERE b.expiration_date > ?::date) AS sellable,
			MIN(b.expiration_date) AS nearest_expiry FROM product_batches b WHERE b.product_id = p.id AND b.quantity > 0) s ON TRUE`, today).
		Where("p.deleted_at IS NULL")
	return c.DB.Table("(?) AS x", sub)
}

func (c *ProductController) filtered(ctx *gin.Context) (*gorm.DB, map[string]any) {
	q := c.productQuery()
	filters := map[string]any{}
	if s := strings.TrimSpace(ctx.Query("search")); s != "" {
		p := helpers.LikePattern(s)
		q = q.Where(`x.name ILIKE ? OR x.generic_name ILIKE ? OR EXISTS (SELECT 1 FROM product_units u
			WHERE u.product_id = x.id AND u.deleted_at IS NULL AND u.barcode ILIKE ?)`, p, p, p)
		filters["search"] = s
	}
	if id := queryUint(ctx, "category_id"); id > 0 {
		q = q.Where("x.category_id = ?", id)
		filters["category_id"] = id
	}
	if v := ctx.Query("drug_class"); v != "" {
		q = q.Where("x.drug_class = ?", v)
		filters["drug_class"] = v
	}
	if v := ctx.Query("stock_status"); v != "" {
		q = q.Where("x.stock_status = ?", v)
		filters["stock_status"] = v
	}
	if v := ctx.Query("expiry_status"); v != "" {
		q = q.Where("x.expiry_status = ?", v)
		filters["expiry_status"] = v
	}
	return q, filters
}

// attachUnits loads the active units of the given products, smallest unit first.
func (c *ProductController) attachUnits(items []dto.ProductItem) error {
	if len(items) == 0 {
		return nil
	}
	ids := make([]uint64, len(items))
	for i, it := range items {
		ids[i] = it.ID
	}
	var units []models.ProductUnit
	if err := c.DB.Where("product_id IN ? AND deleted_at IS NULL", ids).Order("conversion_qty, id").Find(&units).Error; err != nil {
		return err
	}
	byProduct := map[uint64][]models.ProductUnit{}
	for _, u := range units {
		byProduct[u.ProductID] = append(byProduct[u.ProductID], u)
	}
	for i := range items {
		items[i].Units = byProduct[items[i].ID]
		if items[i].Units == nil {
			items[i].Units = []models.ProductUnit{}
		}
	}
	return nil
}

func (c *ProductController) loadItem(id uint64) (*dto.ProductItem, error) {
	var items []dto.ProductItem
	if err := c.productQuery().Where("x.id = ?", id).Scan(&items).Error; err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if err := c.attachUnits(items); err != nil {
		return nil, err
	}
	return &items[0], nil
}

// Index godoc
// @Summary Daftar produk + stok dari batch
// @Tags Products
// @Produce json
// @Security BearerAuth
// @Param search query string false "Nama dagang, nama generik, atau barcode satuan"
// @Param category_id query int false "Kategori"
// @Param drug_class query string false "bebas|bebas_terbatas|keras|narkotika|psikotropika|non_obat"
// @Param stock_status query string false "out|low|ok"
// @Param expiry_status query string false "expired|warning|ok|none"
// @Param page query int false "Halaman"
// @Param per_page query int false "Per halaman (maks 100)"
// @Success 200 {object} dto.Response{data=dto.ProductListData}
// @Router /products [get]
func (c *ProductController) Index(ctx *gin.Context) {
	page, perPage, offset := helpers.ParsePagination(ctx)
	q, filters := c.filtered(ctx)
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count products", err)
		return
	}
	items := []dto.ProductItem{}
	if err := q.Order("x.name, x.id").Offset(offset).Limit(perPage).Scan(&items).Error; err != nil {
		serverError(ctx, c.Logger, "list products", err)
		return
	}
	if err := c.attachUnits(items); err != nil {
		serverError(ctx, c.Logger, "product units", err)
		return
	}
	ok(ctx, http.StatusOK, "Data produk berhasil diambil", dto.ProductListData{Products: items, Pagination: dto.NewPaginationMeta(page, perPage, total), Filters: filters})
}

// Barcode godoc
// @Summary Cari produk dari barcode satuan (scanner POS)
// @Tags Products
// @Produce json
// @Security BearerAuth
// @Param code path string true "Barcode"
// @Success 200 {object} dto.Response{data=dto.BarcodeData}
// @Failure 404 {object} dto.Response
// @Router /products/barcode/{code} [get]
func (c *ProductController) Barcode(ctx *gin.Context) {
	code := strings.TrimSpace(ctx.Param("code"))
	var unit models.ProductUnit
	err := c.DB.Joins("JOIN products p ON p.id = product_units.product_id AND p.deleted_at IS NULL").
		Where("product_units.barcode = ? AND product_units.deleted_at IS NULL", code).First(&unit).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(ctx, http.StatusNotFound, "Barcode "+code+" tidak ditemukan")
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, "barcode", err)
		return
	}
	item, err := c.loadItem(unit.ProductID)
	if err != nil {
		serverError(ctx, c.Logger, "barcode product", err)
		return
	}
	ok(ctx, http.StatusOK, "Produk ditemukan", dto.BarcodeData{Product: *item, Unit: unit})
}

// Detail godoc
// @Summary Detail produk + satuan + batch berstok (batch & HPP hanya untuk perm_products)
// @Tags Products
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response{data=dto.ProductDetail}
// @Router /products/{id} [get]
func (c *ProductController) Detail(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	item, err := c.loadItem(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(ctx, http.StatusNotFound, "Produk tidak ditemukan")
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, "product detail", err)
		return
	}
	// Batches carry the cost price (HPP): only for users who manage stock. The POS only needs units and stock.
	batches := []models.ProductBatch{}
	if middleware.CurrentUser(ctx).PermProducts {
		if err := c.DB.Where("product_id = ? AND quantity > 0", id).Order("expiration_date, id").Find(&batches).Error; err != nil {
			serverError(ctx, c.Logger, "product batches", err)
			return
		}
	}
	ok(ctx, http.StatusOK, "Data produk berhasil diambil", dto.ProductDetail{ProductItem: *item, Batches: batches})
}

// parseUnits validates the units table sent with the product form (F2).
func parseUnits(raw string) ([]dto.ProductUnitInput, error) {
	var units []dto.ProductUnitInput
	if err := json.Unmarshal([]byte(raw), &units); err != nil {
		return nil, errors.New("Format satuan tidak valid")
	}
	if len(units) == 0 {
		return nil, errors.New("Minimal satu satuan")
	}
	bases := 0
	names := map[string]bool{}
	barcodes := map[string]bool{}
	for i := range units {
		u := &units[i]
		u.Name = strings.TrimSpace(u.Name)
		key := strings.ToLower(u.Name)
		switch {
		case u.Name == "" || len(u.Name) > 30:
			return nil, fmt.Errorf("Satuan %d: nama wajib diisi (maks. 30 karakter)", i+1)
		case names[key]:
			return nil, fmt.Errorf("Nama satuan %s dipakai dua kali", u.Name)
		case u.ConversionQty <= 0:
			return nil, fmt.Errorf("Satuan %s: konversi harus lebih dari 0", u.Name)
		case u.Price < 0:
			return nil, fmt.Errorf("Satuan %s: harga tidak boleh negatif", u.Name)
		}
		names[key] = true
		if u.IsBase {
			bases++
			if u.ConversionQty != 1 {
				return nil, fmt.Errorf("Satuan dasar %s harus berkonversi 1", u.Name)
			}
		}
		u.Barcode = trimPtr(u.Barcode)
		if u.Barcode != nil {
			if len(*u.Barcode) > 64 {
				return nil, fmt.Errorf("Barcode satuan %s maksimal 64 karakter", u.Name)
			}
			if barcodes[*u.Barcode] {
				return nil, fmt.Errorf("Barcode %s dipakai dua kali", *u.Barcode)
			}
			barcodes[*u.Barcode] = true
		}
	}
	if bases != 1 {
		return nil, errors.New("Harus ada tepat satu satuan dasar (konversi 1)")
	}
	return units, nil
}

// bindProduct reads the multipart form into product fields and validated units.
func (c *ProductController) bindProduct(ctx *gin.Context, p *models.Product) ([]dto.ProductUnitInput, bool, bool) {
	var form dto.ProductForm
	if err := ctx.ShouldBind(&form); err != nil {
		failValidation(ctx, err)
		return nil, false, false
	}
	units, err := parseUnits(form.Units)
	if err != nil {
		fail(ctx, http.StatusUnprocessableEntity, err.Error())
		return nil, false, false
	}
	if !models.ValidDrugClass(form.DrugClass) {
		fail(ctx, http.StatusUnprocessableEntity, "Golongan obat tidak valid")
		return nil, false, false
	}
	p.Name = strings.TrimSpace(form.Name)
	if p.Name == "" {
		fail(ctx, http.StatusUnprocessableEntity, "Nama produk wajib diisi")
		return nil, false, false
	}
	if form.CategoryID != nil && *form.CategoryID == 0 {
		form.CategoryID = nil
	}
	if form.CategoryID != nil {
		var n int64
		c.DB.Model(&models.Category{}).Where("id = ?", *form.CategoryID).Count(&n)
		if n == 0 {
			fail(ctx, http.StatusUnprocessableEntity, "Kategori tidak ditemukan")
			return nil, false, false
		}
	}
	p.CategoryID, p.GenericName, p.DrugClass, p.ShelfLocation = form.CategoryID, optional(form.GenericName), form.DrugClass, optional(form.ShelfLocation)
	p.MinStock = form.MinStock
	if form.TrackStock != nil {
		p.TrackStock = *form.TrackStock
	}
	return units, form.RemoveImage, true
}

// unitConflictMessage explains a unique-index violation on product_units.
func unitConflictMessage(err error) string {
	switch helpers.ConstraintName(err) {
	case "uq_product_units_barcode":
		return "Barcode sudah dipakai produk lain"
	case "uq_product_units_name":
		return "Nama satuan dipakai dua kali"
	case "uq_product_units_base":
		return "Harus ada tepat satu satuan dasar"
	}
	return "Data satuan bentrok dengan data lain"
}

// Store godoc
// @Summary Tambah produk + satuan (multipart)
// @Tags Products
// @Accept mpfd
// @Produce json
// @Security BearerAuth
// @Param name formData string true "Nama dagang"
// @Param drug_class formData string true "Golongan obat"
// @Param units formData string true "JSON array satuan [{name, conversion_qty, price, barcode, is_base}]"
// @Param image formData file false "Gambar (jpg/png/webp, maks 2 MB)"
// @Success 201 {object} dto.Response{data=dto.ProductItem}
// @Failure 409 {object} dto.Response
// @Failure 422 {object} dto.Response
// @Router /products [post]
func (c *ProductController) Store(ctx *gin.Context) {
	p := models.Product{TrackStock: true}
	units, _, valid := c.bindProduct(ctx, &p)
	if !valid {
		return
	}
	image, valid := c.saveImage(ctx)
	if !valid {
		return
	}
	if image != "" {
		p.Image = &image
	}
	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("Units").Create(&p).Error; err != nil {
			return err
		}
		rows := make([]models.ProductUnit, len(units))
		for i, u := range units {
			rows[i] = models.ProductUnit{ProductID: p.ID, Name: u.Name, ConversionQty: u.ConversionQty, Price: u.Price, Barcode: u.Barcode, IsBase: u.IsBase}
		}
		if err := tx.Create(&rows).Error; err != nil {
			return err
		}
		p.Units = rows
		return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: "create", EntityType: "product", EntityID: &p.ID, After: p, IP: ctx.ClientIP()})
	})
	if err != nil {
		helpers.RemoveUpload(image)
		if helpers.IsUniqueViolation(err) {
			fail(ctx, http.StatusConflict, unitConflictMessage(err))
			return
		}
		serverError(ctx, c.Logger, "create product", err)
		return
	}
	c.respondItem(ctx, p.ID, http.StatusCreated, "Produk berhasil disimpan")
}

func (c *ProductController) saveImage(ctx *gin.Context) (string, bool) {
	fh, err := ctx.FormFile("image")
	if errors.Is(err, http.ErrMissingFile) {
		return "", true
	}
	if err != nil {
		failValidation(ctx, err)
		return "", false
	}
	path, err := helpers.SaveImage(fh, "products")
	if errors.Is(err, helpers.ErrInvalidImage) {
		fail(ctx, http.StatusUnprocessableEntity, err.Error())
		return "", false
	}
	if err != nil {
		serverError(ctx, c.Logger, "save product image", err)
		return "", false
	}
	return path, true
}

func (c *ProductController) respondItem(ctx *gin.Context, id uint64, code int, msg string) {
	item, err := c.loadItem(id)
	if err != nil {
		serverError(ctx, c.Logger, "reload product", err)
		return
	}
	ok(ctx, code, msg, item)
}

func (c *ProductController) findProduct(ctx *gin.Context) (*models.Product, bool) {
	id, valid := parseID(ctx)
	if !valid {
		return nil, false
	}
	var p models.Product
	err := c.DB.Where("deleted_at IS NULL").Preload("Units", "deleted_at IS NULL").First(&p, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(ctx, http.StatusNotFound, "Produk tidak ditemukan")
		return nil, false
	}
	if err != nil {
		serverError(ctx, c.Logger, "find product", err)
		return nil, false
	}
	return &p, true
}

// Update godoc
// @Summary Ubah produk + satuan (multipart; satuan tanpa id = baru, yang tidak dikirim dihapus)
// @Tags Products
// @Accept mpfd
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Param units formData string true "JSON array satuan"
// @Param remove_image formData bool false "Hapus gambar"
// @Success 200 {object} dto.Response{data=dto.ProductItem}
// @Router /products/{id} [put]
func (c *ProductController) Update(ctx *gin.Context) {
	p, found := c.findProduct(ctx)
	if !found {
		return
	}
	before := *p
	units, removeImage, valid := c.bindProduct(ctx, p)
	if !valid {
		return
	}
	existing := map[uint64]models.ProductUnit{}
	var oldBase uint64
	for _, u := range before.Units {
		existing[u.ID] = u
		if u.IsBase {
			oldBase = u.ID
		}
	}
	var newBase uint64
	for _, u := range units {
		if u.ID != 0 {
			if _, ok := existing[u.ID]; !ok {
				fail(ctx, http.StatusUnprocessableEntity, fmt.Sprintf("Satuan #%d bukan milik produk ini", u.ID))
				return
			}
		}
		if u.IsBase {
			newBase = u.ID
		}
	}
	if newBase != oldBase {
		// Stock is stored in base units; switching the base would silently rescale every batch.
		var batches int64
		c.DB.Model(&models.ProductBatch{}).Where("product_id = ?", p.ID).Count(&batches)
		if batches > 0 {
			fail(ctx, http.StatusUnprocessableEntity, "Satuan dasar tidak bisa diganti karena produk sudah punya batch stok")
			return
		}
	}

	image, valid := c.saveImage(ctx)
	if !valid {
		return
	}
	oldImage := p.Image
	switch {
	case image != "":
		p.Image = &image
	case removeImage:
		p.Image = nil
	}

	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("Units").Save(p).Error; err != nil {
			return err
		}
		now := time.Now()
		keep := map[uint64]bool{}
		for _, u := range units {
			keep[u.ID] = true
		}
		for id := range existing {
			if !keep[id] {
				if err := tx.Model(&models.ProductUnit{}).Where("id = ?", id).Update("deleted_at", now).Error; err != nil {
					return err
				}
			}
		}
		// Clear the old base flag before setting a new one (partial unique index on is_base).
		ordered := make([]dto.ProductUnitInput, 0, len(units))
		for _, u := range units {
			if u.ID != 0 && !u.IsBase {
				ordered = append(ordered, u)
			}
		}
		for _, u := range units {
			if u.ID != 0 && u.IsBase {
				ordered = append(ordered, u)
			}
		}
		for _, u := range ordered {
			if err := tx.Model(&models.ProductUnit{}).Where("id = ?", u.ID).Updates(map[string]any{
				"name": u.Name, "conversion_qty": u.ConversionQty, "price": u.Price, "barcode": u.Barcode, "is_base": u.IsBase, "updated_at": now,
			}).Error; err != nil {
				return err
			}
		}
		for _, u := range units {
			if u.ID == 0 {
				row := models.ProductUnit{ProductID: p.ID, Name: u.Name, ConversionQty: u.ConversionQty, Price: u.Price, Barcode: u.Barcode, IsBase: u.IsBase}
				if err := tx.Create(&row).Error; err != nil {
					return err
				}
			}
		}
		var after models.Product
		if err := tx.Preload("Units", "deleted_at IS NULL").First(&after, p.ID).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: "update", EntityType: "product", EntityID: &p.ID, Before: before, After: after, IP: ctx.ClientIP()})
	})
	if err != nil {
		helpers.RemoveUpload(image)
		if helpers.IsUniqueViolation(err) {
			fail(ctx, http.StatusConflict, unitConflictMessage(err))
			return
		}
		serverError(ctx, c.Logger, "update product", err)
		return
	}
	if oldImage != nil && (p.Image == nil || *p.Image != *oldImage) {
		helpers.RemoveUpload(*oldImage)
	}
	c.respondItem(ctx, p.ID, http.StatusOK, "Produk berhasil diperbarui")
}

// Delete godoc
// @Summary Hapus produk (soft delete; ditolak jika stok > 0)
// @Tags Products
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response
// @Failure 409 {object} dto.Response
// @Router /products/{id} [delete]
func (c *ProductController) Delete(ctx *gin.Context) {
	p, found := c.findProduct(ctx)
	if !found {
		return
	}
	var stock int64
	if err := c.DB.Model(&models.ProductBatch{}).Where("product_id = ?", p.ID).Select("COALESCE(SUM(quantity), 0)").Scan(&stock).Error; err != nil {
		serverError(ctx, c.Logger, "product stock", err)
		return
	}
	if stock > 0 {
		fail(ctx, http.StatusConflict, fmt.Sprintf("Produk masih punya stok %d; kosongkan lewat penyesuaian dulu", stock))
		return
	}
	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		if err := tx.Model(&models.ProductUnit{}).Where("product_id = ? AND deleted_at IS NULL", p.ID).Update("deleted_at", now).Error; err != nil {
			return err
		}
		if err := tx.Model(p).Update("deleted_at", now).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: "delete", EntityType: "product", EntityID: &p.ID, Before: p, IP: ctx.ClientIP()})
	})
	if err != nil {
		serverError(ctx, c.Logger, "delete product", err)
		return
	}
	ok(ctx, http.StatusOK, "Produk berhasil dihapus", nil)
}

// StockMovements godoc
// @Summary Riwayat pergerakan stok produk
// @Tags Products
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID"
// @Success 200 {object} dto.Response{data=dto.StockMovementListData}
// @Router /products/{id}/stock-movements [get]
func (c *ProductController) StockMovements(ctx *gin.Context) {
	id, valid := parseID(ctx)
	if !valid {
		return
	}
	page, perPage, offset := helpers.ParsePagination(ctx)
	q := c.DB.Table("stock_movements m").Where("m.product_id = ?", id)
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count movements", err)
		return
	}
	rows := []dto.StockMovementItem{}
	err := q.Select("m.*, b.batch_number, u.username").
		Joins("LEFT JOIN product_batches b ON b.id = m.product_batch_id").
		Joins("LEFT JOIN users u ON u.id = m.user_id").
		Order("m.created_at DESC, m.id DESC").Offset(offset).Limit(perPage).Scan(&rows).Error
	if err != nil {
		serverError(ctx, c.Logger, "list movements", err)
		return
	}
	ok(ctx, http.StatusOK, "Riwayat stok berhasil diambil", dto.StockMovementListData{StockMovements: rows, Pagination: dto.NewPaginationMeta(page, perPage, total)})
}

var drugClassLabels = map[string]string{
	"bebas": "Obat bebas", "bebas_terbatas": "Bebas terbatas", "keras": "Obat keras",
	"narkotika": "Narkotika", "psikotropika": "Psikotropika", "non_obat": "Non obat",
}

// Export godoc
// @Summary Export produk ke Excel (filter sama dengan daftar)
// @Tags Products
// @Produce application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
// @Security BearerAuth
// @Success 200 {file} file
// @Router /products/export [get]
func (c *ProductController) Export(ctx *gin.Context) {
	q, _ := c.filtered(ctx)
	items := []dto.ProductItem{}
	if err := q.Order("x.name, x.id").Limit(maxExportRows).Scan(&items).Error; err != nil {
		serverError(ctx, c.Logger, "export products", err)
		return
	}
	if err := c.attachUnits(items); err != nil {
		serverError(ctx, c.Logger, "export units", err)
		return
	}
	headers := []string{"Nama dagang", "Nama generik", "Kategori", "Golongan", "Rak", "Satuan dasar", "Harga satuan dasar", "Satuan lain", "Stok", "Stok jual", "Stok minimum", "ED terdekat", "Status stok"}
	rows := make([][]any, 0, len(items))
	for _, it := range items {
		var baseName string
		var basePrice int64
		others := []string{}
		for _, u := range it.Units {
			if u.IsBase {
				baseName, basePrice = u.Name, u.Price
			} else {
				others = append(others, fmt.Sprintf("%s (%d) %d", u.Name, u.ConversionQty, u.Price))
			}
		}
		ed := ""
		if it.NearestExpiry != nil {
			ed = it.NearestExpiry.String()
		}
		rows = append(rows, []any{it.Name, deref(it.GenericName), deref(it.CategoryName), drugClassLabels[it.DrugClass], deref(it.ShelfLocation),
			baseName, basePrice, strings.Join(others, "; "), it.Stock, it.SellableStock, it.MinStock, ed, it.StockStatus})
	}
	if err := writeXLSX(ctx, "produk-"+helpers.Today()+".xlsx", headers, rows); err != nil {
		c.Logger.Error("write xlsx", map[string]any{"error": err.Error()})
	}
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
