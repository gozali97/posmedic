package middleware

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

// CORS allows only the origin in CORS_ORIGIN (the frontend). Other origins get no CORS headers.
func CORS() gin.HandlerFunc {
	allowed := os.Getenv("CORS_ORIGIN")
	return func(ctx *gin.Context) {
		origin := ctx.GetHeader("Origin")
		if origin != "" && origin == allowed {
			h := ctx.Writer.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Vary", "Origin")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			h.Set("Access-Control-Max-Age", "600")
		}
		if ctx.Request.Method == http.MethodOptions {
			ctx.AbortWithStatus(http.StatusNoContent)
			return
		}
		ctx.Next()
	}
}
