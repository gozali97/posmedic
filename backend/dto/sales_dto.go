package dto

import (
	"time"

	"pos-apotek-api/models"
)

// ---------------------------------------------------------------- shift (F9)

type ShiftOpenRequest struct {
	TillID      uint64 `json:"till_id" binding:"required"`
	OpeningCash int64  `json:"opening_cash" binding:"gte=0"`
}

type ShiftCloseRequest struct {
	CountedCash *int64 `json:"counted_cash" binding:"required,gte=0"`
	Note        string `json:"note" binding:"max=500"`
}

type ShiftListData struct {
	Shifts     []models.Shift `json:"shifts"`
	Pagination PaginationMeta `json:"pagination"`
}

type ShiftDetail struct {
	models.Shift
	Recap *ShiftRecap `json:"recap"`
}

type MethodRecap struct {
	Method      string `json:"method"`
	SalesCount  int64  `json:"sales_count"`
	SalesTotal  int64  `json:"sales_total"`
	VoidCount   int64  `json:"void_count"`
	VoidTotal   int64  `json:"void_total"`
	RefundCount int64  `json:"refund_count"`
	RefundTotal int64  `json:"refund_total"`
	NetReceived int64  `json:"net_received"`
}

type ShiftRecap struct {
	Methods      []MethodRecap `json:"methods"`
	OpeningCash  int64         `json:"opening_cash"`
	CashSales    int64         `json:"cash_sales"`
	CashRefunds  int64         `json:"cash_refunds"`
	ExpectedCash int64         `json:"expected_cash"`
}

// ---------------------------------------------------------------- transaksi (F10–F12)

type CartLineRequest struct {
	ProductUnitID uint64 `json:"product_unit_id" binding:"required"`
	Quantity      int    `json:"quantity" binding:"required,gt=0"`
}

type PaymentRequest struct {
	Method string `json:"method" binding:"required"`
	Paid   int64  `json:"paid" binding:"gte=0"`
	Info   string `json:"info" binding:"max=100"`
}

// TransactionRequest: prices and totals sent by the client are ignored; the server recomputes them (BR2).
type TransactionRequest struct {
	Status             string            `json:"status" binding:"required,oneof=held paid"`
	TillID             uint64            `json:"till_id" binding:"required"`
	Items              []CartLineRequest `json:"items" binding:"required,min=1,dive"`
	Discount           int64             `json:"discount" binding:"gte=0"`
	CustomerID         *uint64           `json:"customer_id"`
	RefNumber          string            `json:"ref_number" binding:"max=50"`
	PrescriptionNumber string            `json:"prescription_number" binding:"max=50"`
	PrescriptionNote   string            `json:"prescription_note" binding:"max=500"`
	Payment            *PaymentRequest   `json:"payment"`
}

type HeldUpdateRequest struct {
	TillID             uint64            `json:"till_id"`
	Items              []CartLineRequest `json:"items" binding:"required,min=1,dive"`
	Discount           int64             `json:"discount" binding:"gte=0"`
	CustomerID         *uint64           `json:"customer_id"`
	RefNumber          string            `json:"ref_number" binding:"max=50"`
	PrescriptionNumber string            `json:"prescription_number" binding:"max=50"`
	PrescriptionNote   string            `json:"prescription_note" binding:"max=500"`
}

type PayHeldRequest struct {
	TillID             uint64         `json:"till_id"`
	Payment            PaymentRequest `json:"payment" binding:"required"`
	CustomerID         *uint64        `json:"customer_id"`
	PrescriptionNumber *string        `json:"prescription_number" binding:"omitempty,max=50"`
	PrescriptionNote   *string        `json:"prescription_note" binding:"omitempty,max=500"`
}

type VoidRequest struct {
	Reason string `json:"reason" binding:"required,max=500"`
}

type ReturnLineRequest struct {
	TransactionItemID uint64 `json:"transaction_item_id" binding:"required"`
	BaseQuantity      int    `json:"base_quantity" binding:"required,gt=0"`
	Restock           bool   `json:"restock"`
}

type ReturnRequest struct {
	Items        []ReturnLineRequest `json:"items" binding:"required,min=1,dive"`
	Reason       string              `json:"reason" binding:"required,max=500"`
	RefundMethod string              `json:"refund_method" binding:"required"`
}

type HeldItem struct {
	ID           uint64    `json:"id"`
	RefNumber    *string   `json:"ref_number"`
	CustomerID   *uint64   `json:"customer_id"`
	CustomerName *string   `json:"customer_name"`
	TillID       uint64    `json:"till_id"`
	Total        int64     `json:"total"`
	ItemCount    int64     `json:"item_count"`
	CreatedBy    uint64    `json:"created_by"`
	CreatorName  string    `json:"creator_name"`
	CreatedAt    time.Time `json:"created_at"`
}

type HeldListData struct {
	Transactions []HeldItem     `json:"transactions"`
	Pagination   PaginationMeta `json:"pagination"`
}

type TransactionListItem struct {
	ID            uint64     `json:"id"`
	InvoiceNumber *string    `json:"invoice_number"`
	RefNumber     *string    `json:"ref_number"`
	Status        string     `json:"status"`
	Total         int64      `json:"total"`
	Paid          int64      `json:"paid"`
	Change        int64      `json:"change"`
	PaymentMethod *string    `json:"payment_method"`
	PaidAt        *time.Time `json:"paid_at"`
	CreatedAt     time.Time  `json:"created_at"`
	TillID        uint64     `json:"till_id"`
	TillNumber    int        `json:"till_number"`
	TillName      string     `json:"till_name"`
	ShiftID       *uint64    `json:"shift_id"`
	CashierName   *string    `json:"cashier_name"`
	CustomerName  *string    `json:"customer_name"`
	RefundTotal   int64      `json:"refund_total"`
	ReturnCount   int64      `json:"return_count"`
}

type TransactionListData struct {
	Transactions []TransactionListItem `json:"transactions"`
	Pagination   PaginationMeta        `json:"pagination"`
}

// SalesSummary: cards and sold-products table of the report (F15, BR11).
// All figures belong to paid transactions whose paid_at falls in the period, including later returns of those sales.
type SalesSummary struct {
	GrossSales       int64             `json:"gross_sales"`
	Returns          int64             `json:"returns"`
	NetSales         int64             `json:"net_sales"`
	Cogs             int64             `json:"cogs"`
	GrossProfit      int64             `json:"gross_profit"`
	TransactionCount int64             `json:"transaction_count"`
	ItemsSold        int64             `json:"items_sold"`
	Dpp              int64             `json:"dpp"`
	Ppn              int64             `json:"ppn"`
	Products         []SoldProductItem `json:"products"`
}

type SoldProductItem struct {
	ProductID     uint64  `json:"product_id"`
	ProductName   string  `json:"product_name"`
	BaseUnit      *string `json:"base_unit"`
	SoldQuantity  int64   `json:"sold_quantity"`
	StockQuantity int64   `json:"stock_quantity"`
	NetSales      int64   `json:"net_sales"`
	Cogs          int64   `json:"cogs"`
	Profit        int64   `json:"profit"`
}

type SalesReturnListItem struct {
	models.SalesReturn
	InvoiceNumber *string `json:"invoice_number"`
	Username      string  `json:"username"`
	TillNumber    int     `json:"till_number"`
}

type SalesReturnListData struct {
	SalesReturns []SalesReturnListItem `json:"sales_returns"`
	Pagination   PaginationMeta        `json:"pagination"`
}

// ---------------------------------------------------------------- peringatan (F16)

type AlertCounts struct {
	ExpiredBatches    int64  `json:"expired_batches"`
	NearExpiryBatches int64  `json:"near_expiry_batches"`
	LowStock          int64  `json:"low_stock"`
	OutOfStock        int64  `json:"out_of_stock"`
	PayablesDue       *int64 `json:"payables_due,omitempty"`
}

type AlertBatch struct {
	ID             uint64      `json:"id"`
	ProductID      uint64      `json:"product_id"`
	ProductName    string      `json:"product_name"`
	BatchNumber    string      `json:"batch_number"`
	ExpirationDate models.Date `json:"expiration_date"`
	Quantity       int         `json:"quantity"`
}

type AlertProduct struct {
	ID            uint64 `json:"id"`
	Name          string `json:"name"`
	SellableStock int    `json:"sellable_stock"`
	MinStock      int    `json:"min_stock"`
}

type AlertPayable struct {
	ID            uint64      `json:"id"`
	SupplierName  string      `json:"supplier_name"`
	InvoiceNumber string      `json:"invoice_number"`
	DueDate       models.Date `json:"due_date"`
	Total         int64       `json:"total"`
}

type AlertsData struct {
	Counts            AlertCounts    `json:"counts"`
	ExpiredBatches    []AlertBatch   `json:"expired_batches"`
	NearExpiryBatches []AlertBatch   `json:"near_expiry_batches"`
	LowStock          []AlertProduct `json:"low_stock"`
	OutOfStock        []AlertProduct `json:"out_of_stock"`
	PayablesDue       []AlertPayable `json:"payables_due,omitempty"`
}
