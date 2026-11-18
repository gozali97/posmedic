package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimit allows `limit` requests per client IP per fixed window.
// ponytail: in-memory, so limits are per process; move to Redis/PostgreSQL if the API runs on more than one instance.
func RateLimit(limit int, window time.Duration) gin.HandlerFunc {
	type bucket struct {
		start time.Time
		count int
	}
	var (
		mu      sync.Mutex
		buckets = map[string]*bucket{}
	)
	return func(ctx *gin.Context) {
		now := time.Now()
		key := ctx.ClientIP()

		mu.Lock()
		if len(buckets) > 10000 {
			for k, b := range buckets {
				if now.Sub(b.start) >= window {
					delete(buckets, k)
				}
			}
		}
		b := buckets[key]
		if b == nil || now.Sub(b.start) >= window {
			b = &bucket{start: now}
			buckets[key] = b
		}
		b.count++
		over := b.count > limit
		retryAfter := window - now.Sub(b.start)
		mu.Unlock()

		if over {
			ctx.Header("Retry-After", strconv.Itoa(int(retryAfter.Seconds())+1))
			abort(ctx, http.StatusTooManyRequests, "Terlalu banyak percobaan, coba lagi nanti")
			return
		}
		ctx.Next()
	}
}
