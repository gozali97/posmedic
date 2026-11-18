package models

import "time"

type ProductBatch struct {
	ID             uint64    `gorm:"primaryKey" json:"id"`
	ProductID      uint64    `json:"product_id"`
	BatchNumber    string    `json:"batch_number"`
	ExpirationDate Date      `json:"expiration_date"`
	Quantity       int       `json:"quantity"`
	CostPrice      int64     `json:"cost_price"`
	Source         string    `json:"source"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

func (ProductBatch) TableName() string { return "product_batches" }

var AdjustmentReasons = []string{"expired", "damaged", "lost", "correction"}

type StockMovement struct {
	ID             uint64    `gorm:"primaryKey" json:"id"`
	ProductID      uint64    `json:"product_id"`
	ProductBatchID *uint64   `json:"product_batch_id"`
	Type           string    `json:"type"`
	Reason         *string   `json:"reason"`
	Quantity       int       `json:"quantity"`
	StockAfter     int       `json:"stock_after"`
	ReferenceType  *string   `json:"reference_type"`
	ReferenceID    *uint64   `json:"reference_id"`
	Note           *string   `json:"note"`
	UserID         uint64    `json:"user_id"`
	CreatedAt      time.Time `json:"created_at"`
}

func (StockMovement) TableName() string { return "stock_movements" }

type StockOpname struct {
	ID            uint64            `gorm:"primaryKey" json:"id"`
	OpnameNumber  string            `json:"opname_number"`
	Status        string            `json:"status"`
	CategoryID    *uint64           `json:"category_id"`
	ShelfLocation *string           `json:"shelf_location"`
	Note          *string           `json:"note"`
	UserID        uint64            `json:"user_id"`
	PostedBy      *uint64           `json:"posted_by"`
	PostedAt      *time.Time        `json:"posted_at"`
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     time.Time         `json:"updated_at"`
	User          *UserBrief        `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Items         []StockOpnameItem `gorm:"foreignKey:StockOpnameID" json:"items,omitempty"`
}

func (StockOpname) TableName() string { return "stock_opnames" }

type StockOpnameItem struct {
	ID              uint64    `gorm:"primaryKey" json:"id"`
	StockOpnameID   uint64    `json:"stock_opname_id"`
	ProductID       uint64    `json:"product_id"`
	ProductBatchID  *uint64   `json:"product_batch_id"`
	BatchNumber     string    `json:"batch_number"`
	ExpirationDate  Date      `json:"expiration_date"`
	CostPrice       int64     `json:"cost_price"`
	SystemQuantity  *int      `json:"system_quantity"`
	CountedQuantity *int      `json:"counted_quantity"`
	Difference      *int      `json:"difference"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

func (StockOpnameItem) TableName() string { return "stock_opname_items" }
