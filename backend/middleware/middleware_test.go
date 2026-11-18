package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"pos-apotek-api/models"

	"github.com/gin-gonic/gin"
)

func init() { gin.SetMode(gin.TestMode) }

func TestRateLimit(t *testing.T) {
	r := gin.New()
	r.POST("/login", RateLimit(10, time.Minute), func(ctx *gin.Context) { ctx.Status(http.StatusOK) })

	call := func(ip string) int {
		req := httptest.NewRequest(http.MethodPost, "/login", nil)
		req.RemoteAddr = ip + ":1234"
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec.Code
	}
	for i := 1; i <= 10; i++ {
		if code := call("10.0.0.1"); code != http.StatusOK {
			t.Fatalf("request %d: got %d", i, code)
		}
	}
	if code := call("10.0.0.1"); code != http.StatusTooManyRequests {
		t.Fatalf("11th request: got %d, want 429", code)
	}
	if code := call("10.0.0.2"); code != http.StatusOK {
		t.Fatalf("other IP blocked: got %d", code)
	}
}

func TestAuthMiddlewareRejectsMissingAndInvalidToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret-test-secret-test-secret")
	r := gin.New()
	r.GET("/x", AuthMiddleware(), func(ctx *gin.Context) { ctx.Status(http.StatusOK) })

	for _, header := range []string{"", "Bearer ", "Basic abc", "Bearer not-a-jwt"} {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("header %q: got %d, want 401", header, rec.Code)
		}
	}
}

func TestRequirePerm(t *testing.T) {
	cases := []struct {
		name string
		user *models.User
		want int
	}{
		{"no user", nil, http.StatusForbidden},
		{"missing perm", &models.User{PermProducts: true}, http.StatusForbidden},
		{"has perm", &models.User{PermUsers: true}, http.StatusOK},
	}
	for _, c := range cases {
		r := gin.New()
		r.GET("/users", func(ctx *gin.Context) {
			if c.user != nil {
				ctx.Set(ctxUserKey, c.user)
			}
		}, RequirePerm("perm_users"), func(ctx *gin.Context) { ctx.Status(http.StatusOK) })
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/users", nil))
		if rec.Code != c.want {
			t.Errorf("%s: got %d, want %d", c.name, rec.Code, c.want)
		}
	}
}
