package helpers

import (
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	AccessTokenTTL  = 12 * time.Hour
	RefreshTokenTTL = 7 * 24 * time.Hour
	jwtIssuer       = "pos-apotek-api"
)

type JWTClaims struct {
	UserID        uint64 `json:"uid"`
	Username      string `json:"usr"`
	TokenIssuedAt int64  `json:"tia"` // users.token_issued_at in Unix microseconds
	jwt.RegisteredClaims
}

func AccessSecret() []byte  { return []byte(os.Getenv("JWT_SECRET")) }
func RefreshSecret() []byte { return []byte(os.Getenv("JWT_REFRESH_SECRET")) }

func GenerateToken(userID uint64, username string, issuedAt time.Time, secret []byte, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := JWTClaims{
		UserID:        userID,
		Username:      username,
		TokenIssuedAt: issuedAt.UnixMicro(),
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    jwtIssuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

func ParseToken(token string, secret []byte) (*JWTClaims, error) {
	claims := &JWTClaims{}
	_, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) { return secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(jwtIssuer),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}
	return claims, nil
}
