package models

import "time"

type User struct {
	ID                 uint64     `gorm:"primaryKey" json:"id"`
	Username           string     `json:"username"`
	Fullname           string     `json:"fullname"`
	PasswordHash       string     `json:"-"`
	PermProducts       bool       `json:"perm_products"`
	PermPurchases      bool       `json:"perm_purchases"`
	PermCategories     bool       `json:"perm_categories"`
	PermTransactions   bool       `json:"perm_transactions"`
	PermUsers          bool       `json:"perm_users"`
	PermSettings       bool       `json:"perm_settings"`
	IsActive           bool       `json:"is_active"`
	MustChangePassword bool       `json:"must_change_password"`
	TokenIssuedAt      *time.Time `json:"-"`
	LastLoginAt        *time.Time `json:"last_login_at"`
	LastLogoutAt       *time.Time `json:"last_logout_at"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

func (User) TableName() string { return "users" }

func (u *User) HasPerm(perm string) bool {
	switch perm {
	case "perm_products":
		return u.PermProducts
	case "perm_purchases":
		return u.PermPurchases
	case "perm_categories":
		return u.PermCategories
	case "perm_transactions":
		return u.PermTransactions
	case "perm_users":
		return u.PermUsers
	case "perm_settings":
		return u.PermSettings
	}
	return false
}

// SessionValid enforces one session per user: only tokens carrying the latest login time are accepted.
func (u *User) SessionValid(tokenIssuedAt int64) bool {
	return u.IsActive && u.TokenIssuedAt != nil && u.TokenIssuedAt.UnixMicro() == tokenIssuedAt
}
