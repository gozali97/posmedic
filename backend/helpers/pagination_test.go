package helpers

import (
	"net/http/httptest"
	"testing"

	"pos-apotek-api/dto"

	"github.com/gin-gonic/gin"
)

func TestParsePagination(t *testing.T) {
	cases := []struct {
		query                 string
		page, perPage, offset int
	}{
		{"", 1, 10, 0},
		{"?page=3&per_page=20", 3, 20, 40},
		{"?page=0&per_page=-5", 1, 10, 0},
		{"?page=abc&per_page=500", 1, 100, 0},
	}
	for _, c := range cases {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest("GET", "/x"+c.query, nil)
		page, perPage, offset := ParsePagination(ctx)
		if page != c.page || perPage != c.perPage || offset != c.offset {
			t.Errorf("%q: got (%d,%d,%d), want (%d,%d,%d)", c.query, page, perPage, offset, c.page, c.perPage, c.offset)
		}
	}
}

func TestNewPaginationMeta(t *testing.T) {
	cases := []struct {
		page, perPage int
		total         int64
		want          dto.PaginationMeta
	}{
		{1, 10, 0, dto.PaginationMeta{CurrentPage: 1, PerPage: 10}},
		{1, 10, 25, dto.PaginationMeta{CurrentPage: 1, PerPage: 10, Total: 25, TotalPages: 3, From: 1, To: 10}},
		{3, 10, 25, dto.PaginationMeta{CurrentPage: 3, PerPage: 10, Total: 25, TotalPages: 3, From: 21, To: 25}},
		{5, 10, 25, dto.PaginationMeta{CurrentPage: 5, PerPage: 10, Total: 25, TotalPages: 3}},
	}
	for _, c := range cases {
		if got := dto.NewPaginationMeta(c.page, c.perPage, c.total); got != c.want {
			t.Errorf("page %d total %d: got %+v, want %+v", c.page, c.total, got, c.want)
		}
	}
}
