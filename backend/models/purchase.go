package models

import "time"

type Purchase struct {
	ID            uint64         `gorm:"primaryKey" json:"id"`
	SupplierID    uint64         `json:"supplier_id"`
	InvoiceNumber string         `json:"invoice_number"`
	InvoiceDate   Date           `json:"invoice_date"`
	DueDate       Date           `json:"due_date"`
	Total         int64          `json:"total"`
	PaymentStatus string         `json:"payment_status"`
	PaidAt        *Date          `json:"paid_at"`
	PaymentNote   *string        `json:"payment_note"`
	Note          *string        `json:"note"`
	UserID        uint64         `json:"user_id"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	Supplier      *Supplier      `gorm:"foreignKey:SupplierID" json:"supplier,omitempty"`
	User          *UserBrief     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Items         []PurchaseItem `gorm:"foreignKey:PurchaseID" json:"items,omitempty"`
}

func (Purchase) TableName() string { return "purchases" }

type PurchaseItem struct {
	ID             uint64    `gorm:"primaryKey" json:"id"`
	PurchaseID     uint64    `json:"purchase_id"`
	ProductID      uint64    `json:"product_id"`
	ProductUnitID  uint64    `json:"product_unit_id"`
	UnitName       string    `json:"unit_name"`
	ConversionQty  int       `json:"conversion_qty"`
	Quantity       int       `json:"quantity"`
	UnitCost       int64     `json:"unit_cost"`
	LineTotal      int64     `json:"line_total"`
	BatchNumber    string    `json:"batch_number"`
	ExpirationDate Date      `json:"expiration_date"`
	ProductBatchID uint64    `json:"product_batch_id"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	Product        *Product  `gorm:"foreignKey:ProductID" json:"product,omitempty"`
}

func (PurchaseItem) TableName() string { return "purchase_items" }
