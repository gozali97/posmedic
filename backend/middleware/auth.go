package middleware

import (
	"errors"
	"net/http"
	"strings"

	"pos-apotek-api/config"
	"pos-apotek-api/dto"
	"pos-apotek-api/helpers"
	"pos-apotek-api/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const ctxUserKey = "user"

// Routes a user may call while must_change_password is still set.
var allowedWhileMustChangePassword = map[string]bool{
	"/api/auth/me":       true,
	"/api/auth/logout":   true,
	"/api/auth/password": true,
}

func AuthMiddleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		token, found := strings.CutPrefix(ctx.GetHeader("Authorization"), "Bearer ")
		if !found || token == "" {
			abort(ctx, http.StatusUnauthorized, "Token tidak ditemukan")
			return
		}
		claims, err := helpers.ParseToken(token, helpers.AccessSecret())
		if err != nil {
			abort(ctx, http.StatusUnauthorized, "Token tidak valid atau kedaluwarsa")
			return
		}

		var user models.User
		err = config.GetDB().First(&user, claims.UserID).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			abort(ctx, http.StatusInternalServerError, "Gagal memeriksa sesi, silakan coba lagi")
			return
		}
		if err != nil || !user.SessionValid(claims.TokenIssuedAt) {
			abort(ctx, http.StatusUnauthorized, "Sesi berakhir, silakan login ulang")
			return
		}
		if user.MustChangePassword && !allowedWhileMustChangePassword[ctx.FullPath()] {
			abort(ctx, http.StatusForbidden, "Wajib ganti password terlebih dahulu")
			return
		}

		ctx.Set(ctxUserKey, &user)
		ctx.Next()
	}
}

// RequirePerm checks a users.perm_* flag on the user loaded by AuthMiddleware.
func RequirePerm(perm string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if user := CurrentUser(ctx); user == nil || !user.HasPerm(perm) {
			abort(ctx, http.StatusForbidden, "Anda tidak punya izin untuk aksi ini")
			return
		}
		ctx.Next()
	}
}

func CurrentUser(ctx *gin.Context) *models.User {
	v, _ := ctx.Get(ctxUserKey)
	user, _ := v.(*models.User)
	return user
}

func abort(ctx *gin.Context, code int, message string) {
	ctx.AbortWithStatusJSON(code, dto.Response{Status: "failed", Code: code, Message: message})
}
