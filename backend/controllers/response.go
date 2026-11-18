package controllers

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"pos-apotek-api/dto"
	"pos-apotek-api/helpers"
	"pos-apotek-api/services"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9._-]{3,50}$`)

func ok(ctx *gin.Context, code int, message string, data any) {
	ctx.JSON(code, dto.Response{Status: "success", Code: code, Message: message, Data: data})
}

func fail(ctx *gin.Context, code int, message string) {
	ctx.JSON(code, dto.Response{Status: "failed", Code: code, Message: message})
}

func failValidation(ctx *gin.Context, err error) {
	ctx.JSON(http.StatusUnprocessableEntity, dto.Response{Status: "failed", Code: http.StatusUnprocessableEntity, Message: "Data tidak valid", Errors: err.Error()})
}

func serverError(ctx *gin.Context, logger *services.ServiceLogger, action string, err error) {
	logger.Error(action, map[string]any{"error": err.Error(), "path": ctx.FullPath()})
	fail(ctx, http.StatusInternalServerError, "Terjadi kesalahan server")
}

func parseID(ctx *gin.Context) (uint64, bool) {
	id, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil || id == 0 {
		fail(ctx, http.StatusBadRequest, "ID tidak valid")
		return 0, false
	}
	return id, true
}

func normalizeUsername(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

// handleError maps service rule violations to their status and logs everything else as a server error.
func handleError(ctx *gin.Context, logger *services.ServiceLogger, action string, err error) {
	var biz *services.BizError
	switch {
	case errors.As(err, &biz):
		fail(ctx, biz.Status, biz.Message)
	case errors.Is(err, gorm.ErrRecordNotFound):
		fail(ctx, http.StatusNotFound, "Data tidak ditemukan")
	default:
		serverError(ctx, logger, action, err)
	}
}

// queryUint reads an optional positive integer query parameter; 0 means absent or invalid.
func queryUint(ctx *gin.Context, key string) uint64 {
	v, err := strconv.ParseUint(ctx.Query(key), 10, 64)
	if err != nil {
		return 0
	}
	return v
}

// parseDayRange reads start_date/end_date (YYYY-MM-DD, Jakarta days) as [start, end+1day).
func parseDayRange(ctx *gin.Context) (start, end time.Time, ok bool) {
	var err error
	if s := ctx.Query("start_date"); s != "" {
		if start, err = helpers.ParseDay(s); err != nil {
			fail(ctx, http.StatusUnprocessableEntity, "Format start_date harus YYYY-MM-DD")
			return start, end, false
		}
	}
	if s := ctx.Query("end_date"); s != "" {
		if end, err = helpers.ParseDay(s); err != nil {
			fail(ctx, http.StatusUnprocessableEntity, "Format end_date harus YYYY-MM-DD")
			return start, end, false
		}
		end = end.AddDate(0, 0, 1)
	}
	return start, end, true
}

func trimPtr(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}
