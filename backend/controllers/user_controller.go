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
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const builtinAdminID = 1

type UserController struct {
	DB     *gorm.DB
	Logger *services.ServiceLogger
}

func NewUserController() *UserController {
	return &UserController{DB: config.GetDB(), Logger: services.GetServiceLogger("users")}
}

// Index godoc
// @Summary Daftar user
// @Tags Users
// @Produce json
// @Security BearerAuth
// @Param search query string false "Cari username / nama"
// @Param page query int false "Halaman"
// @Param per_page query int false "Per halaman (maks 100)"
// @Success 200 {object} dto.Response{data=dto.UserListData}
// @Router /users [get]
func (c *UserController) Index(ctx *gin.Context) {
	page, perPage, offset := helpers.ParsePagination(ctx)
	search := strings.TrimSpace(ctx.Query("search"))
	filtered := func() *gorm.DB {
		q := c.DB.Model(&models.User{})
		if search != "" {
			p := helpers.LikePattern(search)
			q = q.Where("username ILIKE ? OR fullname ILIKE ?", p, p)
		}
		return q
	}

	var total int64
	if err := filtered().Count(&total).Error; err != nil {
		serverError(ctx, c.Logger, "count users", err)
		return
	}
	users := []models.User{}
	if err := filtered().Order("id").Offset(offset).Limit(perPage).Find(&users).Error; err != nil {
		serverError(ctx, c.Logger, "list users", err)
		return
	}
	ok(ctx, http.StatusOK, "Data user berhasil diambil", dto.UserListData{
		Users: users, Pagination: dto.NewPaginationMeta(page, perPage, total), Filters: dto.SearchFilters{Search: search},
	})
}

// Detail godoc
// @Summary Detail user
// @Tags Users
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID user"
// @Success 200 {object} dto.Response{data=models.User}
// @Failure 404 {object} dto.Response
// @Router /users/{id} [get]
func (c *UserController) Detail(ctx *gin.Context) {
	user, found := c.find(ctx)
	if found {
		ok(ctx, http.StatusOK, "Data user berhasil diambil", user)
	}
}

// Store godoc
// @Summary Tambah user
// @Tags Users
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.UserCreateRequest true "Data user"
// @Success 201 {object} dto.Response{data=models.User}
// @Failure 409 {object} dto.Response
// @Failure 422 {object} dto.Response
// @Router /users [post]
func (c *UserController) Store(ctx *gin.Context) {
	var req dto.UserCreateRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	username := normalizeUsername(req.Username)
	fullname := strings.TrimSpace(req.Fullname)
	if !usernamePattern.MatchString(username) {
		fail(ctx, http.StatusUnprocessableEntity, "Username 3-50 karakter: huruf kecil, angka, titik, minus, atau garis bawah")
		return
	}
	if fullname == "" {
		fail(ctx, http.StatusUnprocessableEntity, "Nama lengkap wajib diisi")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		serverError(ctx, c.Logger, "hash password", err)
		return
	}

	user := models.User{
		Username: username, Fullname: fullname, PasswordHash: string(hash),
		PermProducts: req.PermProducts, PermPurchases: req.PermPurchases, PermCategories: req.PermCategories,
		PermTransactions: req.PermTransactions, PermUsers: req.PermUsers, PermSettings: req.PermSettings,
		IsActive: req.IsActive == nil || *req.IsActive, MustChangePassword: true,
	}
	actor := middleware.CurrentUser(ctx)
	err = c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: "create", EntityType: "user", EntityID: &user.ID, After: user, IP: ctx.ClientIP()})
	})
	if helpers.IsUniqueViolation(err) {
		fail(ctx, http.StatusConflict, "Username sudah dipakai")
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, "create user", err)
		return
	}
	ok(ctx, http.StatusCreated, "User berhasil dibuat", user)
}

// Update godoc
// @Summary Ubah user (field kosong/tidak dikirim = tidak berubah)
// @Tags Users
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID user"
// @Param body body dto.UserUpdateRequest true "Data user"
// @Success 200 {object} dto.Response{data=models.User}
// @Failure 403 {object} dto.Response
// @Failure 409 {object} dto.Response
// @Router /users/{id} [put]
func (c *UserController) Update(ctx *gin.Context) {
	var req dto.UserUpdateRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	user, found := c.find(ctx)
	if !found {
		return
	}
	actor := middleware.CurrentUser(ctx)
	before := *user
	endSession := false

	if req.Username != nil {
		user.Username = normalizeUsername(*req.Username)
		if !usernamePattern.MatchString(user.Username) {
			fail(ctx, http.StatusUnprocessableEntity, "Username 3-50 karakter: huruf kecil, angka, titik, minus, atau garis bawah")
			return
		}
	}
	if req.Fullname != nil {
		user.Fullname = strings.TrimSpace(*req.Fullname)
		if user.Fullname == "" {
			fail(ctx, http.StatusUnprocessableEntity, "Nama lengkap wajib diisi")
			return
		}
	}
	if req.Password != nil && *req.Password != "" {
		if len([]rune(*req.Password)) < 8 {
			fail(ctx, http.StatusUnprocessableEntity, "Password minimal 8 karakter")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(*req.Password), bcrypt.DefaultCost)
		if err != nil {
			serverError(ctx, c.Logger, "hash password", err)
			return
		}
		user.PasswordHash = string(hash)
		if user.ID != actor.ID {
			user.MustChangePassword = true
			endSession = true
		}
	}
	for _, f := range []struct {
		dst *bool
		src *bool
	}{
		{&user.PermProducts, req.PermProducts}, {&user.PermPurchases, req.PermPurchases},
		{&user.PermCategories, req.PermCategories}, {&user.PermTransactions, req.PermTransactions},
		{&user.PermUsers, req.PermUsers}, {&user.PermSettings, req.PermSettings},
		{&user.IsActive, req.IsActive},
	} {
		if f.src != nil {
			*f.dst = *f.src
		}
	}

	if user.ID == builtinAdminID && !(user.IsActive && user.PermProducts && user.PermPurchases && user.PermCategories &&
		user.PermTransactions && user.PermUsers && user.PermSettings) {
		fail(ctx, http.StatusForbidden, "Izin dan status admin bawaan tidak bisa diubah")
		return
	}
	if user.ID == actor.ID && !user.IsActive {
		fail(ctx, http.StatusUnprocessableEntity, "Tidak bisa menonaktifkan akun sendiri")
		return
	}
	if !user.IsActive || endSession {
		user.TokenIssuedAt = nil
	}

	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(user).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: "update", EntityType: "user", EntityID: &user.ID, Before: before, After: user, IP: ctx.ClientIP()})
	})
	if helpers.IsUniqueViolation(err) {
		fail(ctx, http.StatusConflict, "Username sudah dipakai")
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, "update user", err)
		return
	}
	ok(ctx, http.StatusOK, "User berhasil diperbarui", user)
}

// Delete godoc
// @Summary Hapus user (yang sudah punya riwayat hanya bisa dinonaktifkan)
// @Tags Users
// @Produce json
// @Security BearerAuth
// @Param id path int true "ID user"
// @Success 200 {object} dto.Response
// @Failure 403 {object} dto.Response
// @Failure 409 {object} dto.Response
// @Router /users/{id} [delete]
func (c *UserController) Delete(ctx *gin.Context) {
	user, found := c.find(ctx)
	if !found {
		return
	}
	actor := middleware.CurrentUser(ctx)
	if user.ID == builtinAdminID {
		fail(ctx, http.StatusForbidden, "Admin bawaan tidak bisa dihapus")
		return
	}
	if user.ID == actor.ID {
		fail(ctx, http.StatusUnprocessableEntity, "Tidak bisa menghapus akun sendiri")
		return
	}
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(user).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &actor.ID, Action: "delete", EntityType: "user", EntityID: &user.ID, Before: user, IP: ctx.ClientIP()})
	})
	if helpers.IsFKViolation(err) {
		fail(ctx, http.StatusConflict, "User sudah punya riwayat aktivitas, nonaktifkan saja")
		return
	}
	if err != nil {
		serverError(ctx, c.Logger, "delete user", err)
		return
	}
	ok(ctx, http.StatusOK, "User berhasil dihapus", nil)
}

func (c *UserController) find(ctx *gin.Context) (*models.User, bool) {
	id, valid := parseID(ctx)
	if !valid {
		return nil, false
	}
	var user models.User
	err := c.DB.First(&user, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		fail(ctx, http.StatusNotFound, "User tidak ditemukan")
		return nil, false
	}
	if err != nil {
		serverError(ctx, c.Logger, "find user", err)
		return nil, false
	}
	return &user, true
}
