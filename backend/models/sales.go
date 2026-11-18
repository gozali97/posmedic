package models

import "time"

var PaymentMethods = []string{"cash", "card", "qris"}

func ValidPaymentMethod(s string) bool { return s == "cash" || s == "card" || s == "qris" }

type Shift struct {
	ID             uint64     `gorm:"primaryKey" json:"id"`
	UserID         uint64     `json:"user_id"`
	TillID         uint64     `json:"till_id"`
	Status         string     `json:"status"`
	OpeningCash    int64      `json:"opening_cash"`
	ExpectedCash   *int64     `json:"expected_cash"`
	CountedCash    *int64     `json:"counted_cash"`
	CashDifference *int64     `json:"cash_difference"`
	Note           *string    `json:"note"`
	OpenedAt       time.Time  `json:"opened_at"`
	ClosedAt       *time.Time `json:"closed_at"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
	User           *UserBrief `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Till           *Till      `gorm:"foreignKey:TillID" json:"till,omitempty"`
}

func (Shift) TableName() string { return "shifts" }

type Transaction struct {
	ID                 uint64            `gorm:"primaryKey" json:"id"`
	InvoiceNumber      *string           `json:"invoice_number"`
	RefNumber          *string           `json:"ref_number"`
	CustomerID         *uint64           `json:"customer_id"`
	TillID             uint64            `json:"till_id"`
	CreatedBy          uint64            `json:"created_by"`
	PaidBy             *uint64           `json:"paid_by"`
	ShiftID            *uint64           `json:"shift_id"`
	Status             string            `json:"status"`
	Subtotal           int64             `json:"subtotal"`
	Discount           int64             `json:"discount"`
	Total              int64             `json:"total"`
	Dpp                int64             `json:"dpp"`
	Ppn                int64             `json:"ppn"`
	PpnRate            float64           `json:"ppn_rate"`
	Paid               int64             `json:"paid"`
	Change             int64             `json:"change"`
	PaymentMethod      *string           `json:"payment_method"`
	PaymentInfo        *string           `json:"payment_info"`
	PrescriptionNumber *string           `json:"prescription_number"`
	PrescriptionNote   *string           `json:"prescription_note"`
	VoidReason         *string           `json:"void_reason"`
	VoidedBy           *uint64           `json:"voided_by"`
	VoidedAt           *time.Time        `json:"voided_at"`
	PaidAt             *time.Time        `json:"paid_at"`
	CreatedAt          time.Time         `json:"created_at"`
	UpdatedAt          time.Time         `json:"updated_at"`
	Customer           *Customer         `gorm:"foreignKey:CustomerID" json:"customer,omitempty"`
	Till               *Till             `gorm:"foreignKey:TillID" json:"till,omitempty"`
	Cashier            *UserBrief        `gorm:"foreignKey:PaidBy" json:"cashier,omitempty"`
	Creator            *UserBrief        `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
	Items              []TransactionItem `gorm:"foreignKey:TransactionID" json:"items,omitempty"`
	Returns            []SalesReturn     `gorm:"foreignKey:TransactionID" json:"returns,omitempty"`
}

func (Transaction) TableName() string { return "transactions" }

type TransactionItem struct {
	ID                   uint64                 `gorm:"primaryKey" json:"id"`
	TransactionID        uint64                 `json:"transaction_id"`
	ProductID            uint64                 `json:"product_id"`
	ProductUnitID        uint64                 `json:"product_unit_id"`
	ProductName          string                 `json:"product_name"`
	UnitName             string                 `json:"unit_name"`
	ConversionQty        int                    `json:"conversion_qty"`
	DrugClass            string                 `json:"drug_class"`
	Price                int64                  `json:"price"`
	Quantity             int                    `json:"quantity"`
	LineTotal            int64                  `json:"line_total"`
	DiscountShare        int64                  `json:"discount_share"`
	ReturnedBaseQuantity int                    `json:"returned_base_quantity"`
	CreatedAt            time.Time              `json:"created_at"`
	UpdatedAt            time.Time              `json:"updated_at"`
	Batches              []TransactionItemBatch `gorm:"foreignKey:TransactionItemID" json:"batches,omitempty"`
}

func (TransactionItem) TableName() string { return "transaction_items" }

// BaseQuantity is the sold quantity in the product's base unit.
func (i TransactionItem) BaseQuantity() int { return i.Quantity * i.ConversionQty }

type TransactionItemBatch struct {
	ID                uint64        `gorm:"primaryKey" json:"id"`
	TransactionItemID uint64        `json:"transaction_item_id"`
	ProductBatchID    uint64        `json:"product_batch_id"`
	Quantity          int           `json:"quantity"`
	CostPrice         int64         `json:"cost_price"`
	ReturnedQuantity  int           `json:"returned_quantity"`
	CreatedAt         time.Time     `json:"created_at"`
	UpdatedAt         time.Time     `json:"updated_at"`
	Batch             *ProductBatch `gorm:"foreignKey:ProductBatchID" json:"batch,omitempty"`
}

func (TransactionItemBatch) TableName() string { return "transaction_item_batches" }

type SalesReturn struct {
	ID            uint64            `gorm:"primaryKey" json:"id"`
	ReturnNumber  string            `json:"return_number"`
	TransactionID uint64            `json:"transaction_id"`
	UserID        uint64            `json:"user_id"`
	ShiftID       uint64            `json:"shift_id"`
	TillID        uint64            `json:"till_id"`
	TotalRefund   int64             `json:"total_refund"`
	RefundMethod  string            `json:"refund_method"`
	Reason        string            `json:"reason"`
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     time.Time         `json:"updated_at"`
	User          *UserBrief        `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Till          *Till             `gorm:"foreignKey:TillID" json:"till,omitempty"`
	Transaction   *Transaction      `gorm:"foreignKey:TransactionID" json:"transaction,omitempty"`
	Items         []SalesReturnItem `gorm:"foreignKey:SalesReturnID" json:"items,omitempty"`
}

func (SalesReturn) TableName() string { return "sales_returns" }

type SalesReturnItem struct {
	ID                uint64           `gorm:"primaryKey" json:"id"`
	SalesReturnID     uint64           `json:"sales_return_id"`
	TransactionItemID uint64           `json:"transaction_item_id"`
	BaseQuantity      int              `json:"base_quantity"`
	RefundAmount      int64            `json:"refund_amount"`
	CostAmount        int64            `json:"cost_amount"`
	Restock           bool             `json:"restock"`
	CreatedAt         time.Time        `json:"created_at"`
	UpdatedAt         time.Time        `json:"updated_at"`
	TransactionItem   *TransactionItem `gorm:"foreignKey:TransactionItemID" json:"transaction_item,omitempty"`
}

func (SalesReturnItem) TableName() string { return "sales_return_items" }
