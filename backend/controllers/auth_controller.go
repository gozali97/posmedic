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
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Compared against when the username does not exist, so both failure paths take the same time.
var dummyPasswordHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-password-for-timing"), bcrypt.DefaultCost)

type AuthController struct {
	DB     *gorm.DB
	Logger *services.ServiceLogger
}

func NewAuthController() *AuthController {
	return &AuthController{DB: config.GetDB(), Logger: services.GetServiceLogger("auth")}
}

// Login godoc
// @Summary Login dengan username dan password
// @Tags Auth
// @Accept json
// @Produce json
// @Param body body dto.LoginRequest true "Kredensial"
// @Success 200 {object} dto.Response{data=dto.LoginData}
// @Failure 401 {object} dto.Response
// @Failure 403 {object} dto.Response
// @Failure 429 {object} dto.Response
// @Router /auth/login [post]
func (c *AuthController) Login(ctx *gin.Context) {
	var req dto.LoginRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	username := normalizeUsername(req.Username)

	var user models.User
	err := c.DB.Where("username = ?", username).First(&user).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		serverError(ctx, c.Logger, "login", err)
		return
	}
	found := err == nil
	hash := dummyPasswordHash
	if found {
		hash = []byte(user.PasswordHash)
	}
	if bcrypt.CompareHashAndPassword(hash, []byte(req.Password)) != nil || !found {
		entry := services.AuditEntry{Action: "login_failed", EntityType: "user", After: map[string]any{"username": username}, IP: ctx.ClientIP()}
		if found {
			entry.UserID, entry.EntityID = &user.ID, &user.ID
		}
		if err := services.WriteAudit(c.DB, entry); err != nil {
			c.Logger.Error("audit login_failed", map[string]any{"error": err.Error()})
		}
		fail(ctx, http.StatusUnauthorized, "Username atau password salah")
		return
	}
	if !user.IsActive {
		fail(ctx, http.StatusForbidden, "Akun dinonaktifkan")
		return
	}

	// PostgreSQL stores microseconds; truncating keeps the JWT claim equal to the stored value.
	now := time.Now().Truncate(time.Microsecond)
	err = c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&user).Updates(map[string]any{"token_issued_at": now, "last_login_at": now}).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &user.ID, Action: "login", EntityType: "user", EntityID: &user.ID, IP: ctx.ClientIP()})
	})
	if err != nil {
		serverError(ctx, c.Logger, "login", err)
		return
	}
	user.TokenIssuedAt, user.LastLoginAt = &now, &now

	data, err := issueTokens(&user, now)
	if err != nil {
		serverError(ctx, c.Logger, "login token", err)
		return
	}
	ok(ctx, http.StatusOK, "Login berhasil", data)
}

// RefreshToken godoc
// @Summary Tukar refresh token dengan access token baru
// @Tags Auth
// @Accept json
// @Produce json
// @Param body body dto.RefreshTokenRequest true "Refresh token"
// @Success 200 {object} dto.Response{data=dto.LoginData}
// @Failure 401 {object} dto.Response
// @Router /auth/refresh-token [post]
func (c *AuthController) RefreshToken(ctx *gin.Context) {
	var req dto.RefreshTokenRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	claims, err := helpers.ParseToken(req.RefreshToken, helpers.RefreshSecret())
	if err != nil {
		fail(ctx, http.StatusUnauthorized, "Refresh token tidak valid atau kedaluwarsa")
		return
	}
	var user models.User
	err = c.DB.First(&user, claims.UserID).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		serverError(ctx, c.Logger, "refresh session", err)
		return
	}
	if err != nil || !user.SessionValid(claims.TokenIssuedAt) {
		fail(ctx, http.StatusUnauthorized, "Sesi berakhir, silakan login ulang")
		return
	}
	data, err := issueTokens(&user, *user.TokenIssuedAt)
	if err != nil {
		serverError(ctx, c.Logger, "refresh token", err)
		return
	}
	ok(ctx, http.StatusOK, "Token diperbarui", data)
}

// Me godoc
// @Summary Data user yang sedang login
// @Tags Auth
// @Produce json
// @Security BearerAuth
// @Success 200 {object} dto.Response{data=models.User}
// @Router /auth/me [get]
func (c *AuthController) Me(ctx *gin.Context) {
	ok(ctx, http.StatusOK, "Data user berhasil diambil", middleware.CurrentUser(ctx))
}

// Logout godoc
// @Summary Logout dan batalkan sesi
// @Tags Auth
// @Produce json
// @Security BearerAuth
// @Success 200 {object} dto.Response
// @Router /auth/logout [post]
func (c *AuthController) Logout(ctx *gin.Context) {
	user := middleware.CurrentUser(ctx)
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(user).Updates(map[string]any{"token_issued_at": nil, "last_logout_at": time.Now()}).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &user.ID, Action: "logout", EntityType: "user", EntityID: &user.ID, IP: ctx.ClientIP()})
	})
	if err != nil {
		serverError(ctx, c.Logger, "logout", err)
		return
	}
	ok(ctx, http.StatusOK, "Logout berhasil", nil)
}

// ChangePassword godoc
// @Summary Ganti password sendiri
// @Tags Auth
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.ChangePasswordRequest true "Password lama dan baru"
// @Success 200 {object} dto.Response{data=models.User}
// @Failure 422 {object} dto.Response
// @Router /auth/password [put]
func (c *AuthController) ChangePassword(ctx *gin.Context) {
	var req dto.ChangePasswordRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	user := middleware.CurrentUser(ctx)
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword)) != nil {
		fail(ctx, http.StatusUnprocessableEntity, "Password lama salah")
		return
	}
	if req.OldPassword == req.NewPassword {
		fail(ctx, http.StatusUnprocessableEntity, "Password baru harus berbeda dari password lama")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		serverError(ctx, c.Logger, "hash password", err)
		return
	}
	err = c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(user).Updates(map[string]any{"password_hash": string(hash), "must_change_password": false}).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &user.ID, Action: "change_password", EntityType: "user", EntityID: &user.ID, IP: ctx.ClientIP()})
	})
	if err != nil {
		serverError(ctx, c.Logger, "change password", err)
		return
	}
	user.MustChangePassword = false
	ok(ctx, http.StatusOK, "Password berhasil diganti", user)
}

// UpdateProfile godoc
// @Summary Ubah nama sendiri
// @Tags Auth
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body dto.UpdateProfileRequest true "Nama lengkap"
// @Success 200 {object} dto.Response{data=models.User}
// @Router /auth/profile [put]
func (c *AuthController) UpdateProfile(ctx *gin.Context) {
	var req dto.UpdateProfileRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		failValidation(ctx, err)
		return
	}
	fullname := strings.TrimSpace(req.Fullname)
	if fullname == "" {
		fail(ctx, http.StatusUnprocessableEntity, "Nama lengkap wajib diisi")
		return
	}
	user := middleware.CurrentUser(ctx)
	before := *user
	err := c.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(user).Update("fullname", fullname).Error; err != nil {
			return err
		}
		return services.WriteAudit(tx, services.AuditEntry{UserID: &user.ID, Action: "update_profile", EntityType: "user", EntityID: &user.ID, Before: before, After: user, IP: ctx.ClientIP()})
	})
	if err != nil {
		serverError(ctx, c.Logger, "update profile", err)
		return
	}
	ok(ctx, http.StatusOK, "Profil berhasil diperbarui", user)
}

func issueTokens(user *models.User, issuedAt time.Time) (*dto.LoginData, error) {
	access, err := helpers.GenerateToken(user.ID, user.Username, issuedAt, helpers.AccessSecret(), helpers.AccessTokenTTL)
	if err != nil {
		return nil, err
	}
	refresh, err := helpers.GenerateToken(user.ID, user.Username, issuedAt, helpers.RefreshSecret(), helpers.RefreshTokenTTL)
	if err != nil {
		return nil, err
	}
	return &dto.LoginData{
		AccessToken: access, RefreshToken: refresh, TokenType: "Bearer",
		ExpiresIn: int(helpers.AccessTokenTTL.Seconds()), User: user,
	}, nil
}
