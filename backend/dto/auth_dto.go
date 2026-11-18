package dto

import "pos-apotek-api/models"

type LoginRequest struct {
	Username string `json:"username" binding:"required,max=50" example:"admin"`
	Password string `json:"password" binding:"required,max=72" example:"rahasia123"`
}

type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required,max=72"`
	NewPassword string `json:"new_password" binding:"required,min=8,max=72"`
}

type UpdateProfileRequest struct {
	Fullname string `json:"fullname" binding:"required,max=100"`
}

type LoginData struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	TokenType    string       `json:"token_type" example:"Bearer"`
	ExpiresIn    int          `json:"expires_in" example:"43200"`
	User         *models.User `json:"user"`
}

type UserCreateRequest struct {
	Username         string `json:"username" binding:"required" example:"kasir1"`
	Fullname         string `json:"fullname" binding:"required,max=100"`
	Password         string `json:"password" binding:"required,min=8,max=72"`
	PermProducts     bool   `json:"perm_products"`
	PermPurchases    bool   `json:"perm_purchases"`
	PermCategories   bool   `json:"perm_categories"`
	PermTransactions bool   `json:"perm_transactions"`
	PermUsers        bool   `json:"perm_users"`
	PermSettings     bool   `json:"perm_settings"`
	IsActive         *bool  `json:"is_active"`
}

// UserUpdateRequest: nil fields stay unchanged; an empty password keeps the current one.
type UserUpdateRequest struct {
	Username         *string `json:"username"`
	Fullname         *string `json:"fullname" binding:"omitempty,max=100"`
	Password         *string `json:"password" binding:"omitempty,max=72"`
	PermProducts     *bool   `json:"perm_products"`
	PermPurchases    *bool   `json:"perm_purchases"`
	PermCategories   *bool   `json:"perm_categories"`
	PermTransactions *bool   `json:"perm_transactions"`
	PermUsers        *bool   `json:"perm_users"`
	PermSettings     *bool   `json:"perm_settings"`
	IsActive         *bool   `json:"is_active"`
}

type UserListData struct {
	Users      []models.User  `json:"users"`
	Pagination PaginationMeta `json:"pagination"`
	Filters    SearchFilters  `json:"filters"`
}

type SearchFilters struct {
	Search string `json:"search"`
}

// SettingUpdateRequest is sent as multipart/form-data together with an optional `logo` file.
type SettingUpdateRequest struct {
	StoreName         string  `form:"store_name" binding:"required,max=150"`
	AddressOne        string  `form:"address_one" binding:"required,max=255"`
	AddressTwo        string  `form:"address_two" binding:"max=255"`
	Contact           string  `form:"contact" binding:"required,max=50"`
	SiaNumber         string  `form:"sia_number" binding:"required,max=50"`
	PharmacistName    string  `form:"pharmacist_name" binding:"required,max=100"`
	SipaNumber        string  `form:"sipa_number" binding:"required,max=50"`
	TaxNumber         string  `form:"tax_number" binding:"max=30"`
	IsPkp             bool    `form:"is_pkp"`
	PpnRate           float64 `form:"ppn_rate" binding:"gte=0,lt=100"`
	CurrencySymbol    string  `form:"currency_symbol" binding:"required,max=5"`
	QuickBilling      bool    `form:"quick_billing"`
	ExpiryWarningDays int     `form:"expiry_warning_days" binding:"required,gt=0,lte=730"`
	ReceiptFooter     string  `form:"receipt_footer" binding:"max=500"`
	RemoveLogo        bool    `form:"remove_logo"`
}

type TillRequest struct {
	Number int    `json:"number" binding:"required,gt=0" example:"1"`
	Name   string `json:"name" binding:"required,max=50" example:"Kasir Depan"`
}

type AuditLogItem struct {
	models.AuditLog
	Username *string `json:"username"`
}

type AuditLogListData struct {
	AuditLogs  []AuditLogItem `json:"audit_logs"`
	Pagination PaginationMeta `json:"pagination"`
}
