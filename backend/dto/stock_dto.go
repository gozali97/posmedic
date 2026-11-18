package dto

import "pos-apotek-api/models"

// ---------------------------------------------------------------- penerimaan & hutang (F6)

type PurchaseItemRequest struct {
	ProductUnitID  uint64      `json:"product_unit_id" binding:"required"`
	Quantity       int         `json:"quantity" binding:"required,gt=0"`
	UnitCost       int64       `json:"unit_cost" binding:"gte=0"`
	BatchNumber    string      `json:"batch_number" binding:"required,max=50"`
	ExpirationDate models.Date `json:"expiration_date" binding:"required"`
}

type PurchaseRequest struct {
	SupplierID    uint64                `json:"supplier_id" binding:"required"`
	InvoiceNumber string                `json:"invoice_number" binding:"required,max=50"`
	InvoiceDate   models.Date           `json:"invoice_date" binding:"required"`
	DueDate       *models.Date          `json:"due_date"`
	Note          string                `json:"note" binding:"max=500"`
	Items         []PurchaseItemRequest `json:"items" binding:"required,min=1,dive"`
}

type MarkPaidRequest struct {
	PaidAt      models.Date `json:"paid_at" binding:"required"`
	PaymentNote string      `json:"payment_note" binding:"max=500"`
}

type PurchaseListItem struct {
	models.Purchase
	SupplierName string `json:"supplier_name"`
	ItemCount    int64  `json:"item_count"`
	IsOverdue    bool   `json:"is_overdue"`
}

type PurchaseListData struct {
	Purchases  []PurchaseListItem `json:"purchases"`
	Pagination PaginationMeta     `json:"pagination"`
	Summary    *PayableSummary    `json:"summary,omitempty"`
}

type PayableSummary struct {
	UnpaidTotal  int64 `json:"unpaid_total"`
	OverdueTotal int64 `json:"overdue_total"`
	OverdueCount int64 `json:"overdue_count"`
}

// ---------------------------------------------------------------- batch & penyesuaian (F7, F8)

type BatchItem struct {
	models.ProductBatch
	ProductName   string  `json:"product_name"`
	GenericName   *string `json:"generic_name"`
	ShelfLocation *string `json:"shelf_location"`
	BaseUnit      *string `json:"base_unit"`
	ExpiryStatus  string  `json:"expiry_status"` // expired | warning | ok
	DaysToExpiry  int     `json:"days_to_expiry"`
}

type BatchListData struct {
	Batches    []BatchItem    `json:"batches"`
	Pagination PaginationMeta `json:"pagination"`
}

type AdjustmentRequest struct {
	Quantity int    `json:"quantity" binding:"required"`
	Reason   string `json:"reason" binding:"required"`
	Note     string `json:"note" binding:"required,max=500"`
}

// ---------------------------------------------------------------- stok opname (F8)

type OpnameCreateRequest struct {
	CategoryID    *uint64 `json:"category_id"`
	ShelfLocation string  `json:"shelf_location" binding:"max=30"`
	Note          string  `json:"note" binding:"max=500"`
}

type OpnameCountInput struct {
	ID              uint64 `json:"id" binding:"required"`
	CountedQuantity *int   `json:"counted_quantity"`
}

type OpnameNewBatchInput struct {
	ProductID       uint64      `json:"product_id" binding:"required"`
	BatchNumber     string      `json:"batch_number" binding:"required,max=50"`
	ExpirationDate  models.Date `json:"expiration_date" binding:"required"`
	CostPrice       int64       `json:"cost_price" binding:"gte=0"`
	CountedQuantity int         `json:"counted_quantity" binding:"gte=0"`
}

type OpnameItemsRequest struct {
	Items         []OpnameCountInput    `json:"items" binding:"dive"`
	NewItems      []OpnameNewBatchInput `json:"new_items" binding:"dive"`
	RemoveItemIDs []uint64              `json:"remove_item_ids"`
}

type OpnameListItem struct {
	models.StockOpname
	CategoryName *string `json:"category_name"`
	Username     string  `json:"username"`
	ItemCount    int64   `json:"item_count"`
	CountedCount int64   `json:"counted_count"`
}

type OpnameListData struct {
	StockOpnames []OpnameListItem `json:"stock_opnames"`
	Pagination   PaginationMeta   `json:"pagination"`
}

type OpnameItemDetail struct {
	models.StockOpnameItem
	ProductName     string  `json:"product_name"`
	ShelfLocation   *string `json:"shelf_location"`
	BaseUnit        *string `json:"base_unit"`
	CurrentQuantity *int    `json:"current_quantity"`
}

type OpnameDetail struct {
	models.StockOpname
	CategoryName *string            `json:"category_name"`
	Items        []OpnameItemDetail `json:"items"`
}
