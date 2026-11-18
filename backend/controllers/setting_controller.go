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

type SettingController struct {
	DB     *gorm.DB
	Logger *services.ServiceLogger
}

func NewSettingController() *SettingController {
	return &SettingController{DB: config.GetDB(), Logger: services.GetServiceLogger("settings")}
}

// Show godoc
// @Summary Pengaturan toko (data kosong = belum diisi, arahkan ke halaman pengaturan)
// @Tags Settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} dto.Response{data=models.StoreSetting}
// @Router /settings [get]
func (c *SettingController) Show(ctx *gin.Context) {
	var s models.StoreSetting
	err := c.DB.First(&s, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		ok(ctx, http.StatusOK, "Pengaturan toko belum diisi", nil)
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, "get settings", err)
		return
	}
	ok(ctx, http.StatusOK, "Pengaturan toko berhasil diambil", s)
}

// Update godoc
// @Summary Simpan pengaturan toko
// @Tags Settings
// @Accept multipart/form-data
// @Produce json
// @Security BearerAuth
// @Param store_name formData string true "Nama toko"
// @Param address_one formData string true "Alamat 1"
// @Param contact formData string true "Telepon"
// @Param sia_number formData string true "No. SIA"
// @Param pharmacist_name formData string true "Apoteker penanggung jawab"
// @Param sipa_number formData string true "No. SIPA"
// @Param currency_symbol formData string true "Simbol mata uang"
// @Param expiry_warning_days formData int true "Batas peringatan ED (hari)"
// @Param is_pkp formData bool false "Toko PKP"
// @Param ppn_rate formData number false "Tarif PPN"
// @Param logo formData file false "Logo (jpg/png/webp, maks 2 MB)"
// @Param remove_logo formData bool false "Hapus logo"
// @Success 200 {object} dto.Response{data=models.StoreSetting}
// @Failure 422 {object} dto.Response
// @Router /settings [put]
func (c *SettingController) Update(ctx *gin.Context) {
	ctx.Request.Body = http.MaxBytesReader(ctx.Writer, ctx.Request.Body, helpers.MaxImageSize+(1<<20))
	var req dto.SettingUpdateRequest
	if err := ctx.ShouldBind(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	if req.IsPkp && (strings.TrimSpace(req.TaxNumber) == "" || req.PpnRate <= 0) {
		fail(ctx, http.StatusUnprocessableEntity, "Toko PKP wajib mengisi NPWP dan tarif PPN")
		return
	}

	var current models.StoreSetting
	err := c.DB.First(&current, 1).Error
	isNew := errors.Is(err, gorm.ErrRecordNotFound)
	if err != nil && !isNew {
		serverError(ctx, c.Logger, "get settings", err)
		return
	}
	var before any
	if !isNew {
		before = current
	}

	newLogo := ""
	if fh, err := ctx.FormFile("logo"); err == nil {
		if newLogo, err = helpers.SaveImage(fh, "settings"); err != nil {
			if errors.Is(err, helpers.ErrInvalidImage) {
				fail(ctx, http.StatusUnprocessableEntity, err.Error())
			} else {
				serverError(ctx, c.Logger, "save logo", err)
			}
			return
		}
	} else if !errors.Is(err, http.ErrMissingFile) {
		failValidation(ctx, err)
		return
	}

	oldLogo := current.Logo
	s := current
	s.ID = 1
	s.StoreName = strings.TrimSpace(req.StoreName)
	s.AddressOne = strings.TrimSpace(req.AddressOne)
	s.AddressTwo = optional(req.AddressTwo)
	s.Contact = strings.TrimSpace(req.Contact)
	s.SiaNumber = strings.TrimSpace(req.SiaNumber)
	s.PharmacistName = strings.TrimSpace(req.PharmacistName)
	s.SipaNumber = strings.TrimSpace(req.SipaNumber)
	s.TaxNumber = optional(req.TaxNumber)
	s.IsPkp = req.IsPkp
	s.PpnRate = req.PpnRate
	s.CurrencySymbol = strings.TrimSpace(req.CurrencySymbol)
	s.QuickBilling = req.QuickBilling
	s.ExpiryWarningDays = req.ExpiryWarningDays
	s.ReceiptFooter = optional(req.ReceiptFooter)
	switch {
	case newLogo != "":
		s.Logo = &newLogo
	case req.RemoveLogo:
		s.Logo = nil
	}
	if isNew {
		s.CreatedAt = time.Now()
	}

	actor := middleware.CurrentUser(ctx)
	err = c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&s).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: "update", EntityType: "store_settings", EntityID: ptr(uint64(1)), Before: before, After: s, IP: ctx.ClientIP()})
	})
	if err != nil {
		helpers.RemoveUpload(newLogo)
		serverError(ctx, c.Logger, "save settings", err)
		return
	}
	if oldLogo != nil && (s.Logo == nil || *s.Logo != *oldLogo) {
		helpers.RemoveUpload(*oldLogo)
	}
	ok(ctx, http.StatusOK, "Pengaturan toko berhasil disimpan", s)
}

// TillIndex godoc
// @Summary Daftar till (kasir)
// @Tags Tills
// @Produce json
// @Security BearerAuth
// @Success 200 {object} dto.Response{data=[]models.Till}
// @Router /tills [get]
func (c *SettingController) TillIndex(ctx *gin.Context) {
	tills := []models.Till{}
	if err := c.DB.Order("number").Find(&tills).Error; err != nil {
		serverError(ctx, c.Logger, "list tills", err)
		return
	}
	ok(ctx, http.StatusOK, "Data till berhasil diambil", tills)
}

// TillStore godoc
// @Summary Tambah till
// @Tags Tills
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.TillRequest true "Data till"
// @Success 201 {object} dto.Response{data=models.Till}
// @Failure 409 {object} dto.Response
// @Router /tills [post]
func (c *SettingController) TillStore(ctx *gin.Context) {
	var req dto.TillRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	till := models.Till{Number: req.Number, Name: strings.TrimSpace(req.Name)}
	c.saveTill(ctx, &till, nil, "create", http.StatusCreated)
}

// TillUpdate godoc
// @Summary Ubah till
// @Tags Tills
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID till"
// @Param body body dto.TillRequest true "Data till"
// @Success 200 {object} dto.Response{data=models.Till}
// @Failure 409 {object} dto.Response
// @Router /tills/{id} [put]
func (c *SettingController) TillUpdate(ctx *gin.Context) {
	var req dto.TillRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	till, found := c.findTill(ctx)
	if !found {
		return
	}
	before := *till
	till.Number, till.Name = req.Number, strings.TrimSpace(req.Name)
	c.saveTill(ctx, till, before, "update", http.StatusOK)
}

// TillDelete godoc
// @Summary Hapus till (yang sudah dipakai tidak bisa dihapus)
// @Tags Tills
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID till"
// @Success 200 {object} dto.Response
// @Failure 409 {object} dto.Response
// @Router /tills/{id} [delete]
func (c *SettingController) TillDelete(ctx *gin.Context) {
	till, found := c.findTill(ctx)
	if !found {
		return
	}
	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(till).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: "delete", EntityType: "till", EntityID: &till.ID, Before: till, IP: ctx.ClientIP()})
	})
	if helpers.IsFKViolation(err) {
		fail(ctx, http.StatusConflict, "Till sudah dipakai di shift atau transaksi")
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, "delete till", err)
		return
	}
	ok(ctx, http.StatusOK, "Till berhasil dihapus", nil)
}

func (c *SettingController) saveTill(ctx *gin.Context, till *models.Till, before any, action string, code int) {
	if till.Name == "" {
		fail(ctx, http.StatusUnprocessableEntity, "Nama till wajib diisi")
		return
	}
	actor := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(till).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: action, EntityType: "till", EntityID: &till.ID, Before: before, After: till, IP: ctx.ClientIP()})
	})
	if helpers.IsUniqueViolation(err) {
		fail(ctx, http.StatusConflict, "Nomor till sudah dipakai")
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, action+" till", err)
		return
	}
	ok(ctx, code, "Till berhasil disimpan", till)
}

func (c *SettingController) findTill(ctx *gin.Context) (*models.Till, bool) {
	id, valid := parseID(ctx)
	if !valid {
		return nil, false
	}
	var till models.Till
	err := c.DB.First(&till, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(ctx, http.StatusNotFound, "Till tidak ditemukan")
		return nil, false
	}
	if err != nil {
		serverError(ctx, c.Logger, "find till", err)
		return nil, false
	}
	return &till, true
}

// AuditLogIndex godoc
// @Summary Daftar audit log (hanya baca)
// @Tags Audit Log
// @Produce json
// @Security BearerAuth
// @Param user_id query int false "ID user pelaku"
// @Param entity_type query string false "Entitas, mis. user, till, store_settings"
// @Param action query string false "Aksi, mis. login, login_failed, update"
// @Param start_date query string false "YYYY-MM-DD"
// @Param end_date query string false "YYYY-MM-DD (inklusif)"
// @Param page query int false "Halaman"
// @Param per_page query int false "Per halaman (maks 100)"
// @Success 200 {object} dto.Response{data=dto.AuditLogListData}
// @Router /audit-logs [get]
func (c *SettingController) AuditLogIndex(ctx *gin.Context) {
	page, perPage, offset := helpers.ParsePagination(ctx)
	var start, end time.Time
	var err error
	if s := ctx.Query("start_date"); s != "" {
		if start, err = helpers.ParseDay(s); err != nil {
			fail(ctx, http.StatusUnprocessableEntity, "Format start_date harus YYYY-MM-DD")
			return
		}
	}
	if s := ctx.Query("end_date"); s != "" {
		if end, err = helpers.ParseDay(s); err != nil {
			fail(ctx, http.StatusUnprocessableEntity, "Format end_date harus YYYY-MM-DD")
			return
		}
	}

	filtered := func() *gorm.DB {
		q := c.DB.Table("audit_logs")
		if v := ctx.Query("user_id"); v != "" {
			q = q.Where("audit_logs.user_id = ?", v)
		}
		if v := ctx.Query("entity_type"); v != "" {
			q = q.Where("audit_logs.entity_type = ?", v)
		}
		if v := ctx.Query("action"); v != "" {
			q = q.Where("audit_logs.action = ?", v)
		}
		if !start.IsZero() {
			q = q.Where("audit_logs.created_at >= ?", start)
		}
		if !end.IsZero() {
			q = q.Where("audit_logs.created_at < ?", end.AddDate(0, 0, 1))
		}
		return q
	}

	var total int64
	if err := filtered().Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count audit logs", err)
		return
	}
	logs := []dto.AuditLogItem{}
	err = filtered().Select("audit_logs.*, users.username").
		Joins("LEFT JOIN users ON users.id = audit_logs.user_id").
		Order("audit_logs.created_at DESC, audit_logs.id DESC").
		Offset(offset).Limit(perPage).Scan(&logs).Error
	if err != nil {
		serverError(ctx, c.Logger, "list audit logs", err)
		return
	}
	ok(ctx, http.StatusOK, "Audit log berhasil diambil", dto.AuditLogListData{AuditLogs: logs, Pagination: dto.NewPaginationMeta(page, perPage, total)})
}

func optional(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

func ptr[T any](v T) *T { return &v }
