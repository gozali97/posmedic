package helpers

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

const maxPerPage = 100

// ParsePagination reads ?page (default 1) and ?per_page (default 10, max 100) and returns page, perPage, offset.
func ParsePagination(ctx *gin.Context) (int, int, int) {
	page, err := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}
	perPage, err := strconv.Atoi(ctx.DefaultQuery("per_page", "10"))
	if err != nil || perPage < 1 {
		perPage = 10
	}
	perPage = min(perPage, maxPerPage)
	return page, perPage, (page - 1) * perPage
}
