package models

import "time"

type StoreSetting struct {
	ID                int16     `gorm:"primaryKey" json:"-"`
	StoreName         string    `json:"store_name"`
	AddressOne        string    `json:"address_one"`
	AddressTwo        *string   `json:"address_two"`
	Contact           string    `json:"contact"`
	SiaNumber         string    `json:"sia_number"`
	PharmacistName    string    `json:"pharmacist_name"`
	SipaNumber        string    `json:"sipa_number"`
	TaxNumber         *string   `json:"tax_number"`
	IsPkp             bool      `json:"is_pkp"`
	PpnRate           float64   `json:"ppn_rate"`
	CurrencySymbol    string    `json:"currency_symbol"`
	QuickBilling      bool      `json:"quick_billing"`
	ExpiryWarningDays int       `json:"expiry_warning_days"`
	ReceiptFooter     *string   `json:"receipt_footer"`
	Logo              *string   `json:"logo"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (StoreSetting) TableName() string { return "store_settings" }

type Till struct {
	ID        uint64    `gorm:"primaryKey" json:"id"`
	Number    int       `json:"number"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Till) TableName() string { return "tills" }

type AuditLog struct {
	ID         uint64    `gorm:"primaryKey" json:"id"`
	UserID     *uint64   `json:"user_id"`
	Action     string    `json:"action"`
	EntityType string    `json:"entity_type"`
	EntityID   *uint64   `json:"entity_id"`
	Before     JSONB     `json:"before" swaggertype:"object"`
	After      JSONB     `json:"after" swaggertype:"object"`
	IP         string    `gorm:"column:ip" json:"ip"`
	CreatedAt  time.Time `json:"created_at"`
}

func (AuditLog) TableName() string { return "audit_logs" }
