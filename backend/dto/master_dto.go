package dto

import (
	"time"

	"pos-apotek-api/models"
)

// ---------------------------------------------------------------- kategori (F3)

type CategoryRequest struct {
	Name string `json:"name" binding:"required,max=100" example:"Obat Bebas"`
}

type CategoryItem struct {
	models.Category
	ProductCount int64 `json:"product_count"`
}

type CategoryListData struct {
	Categories []CategoryItem  `json:"categories"`
	Pagination *PaginationMeta `json:"pagination,omitempty"`
	Filters    SearchFilters   `json:"filters"`
}

// ---------------------------------------------------------------- pelanggan (F4) & supplier (F5)

type CustomerRequest struct {
	Name    string  `json:"name" binding:"required,max=100"`
	Phone   *string `json:"phone" binding:"omitempty,max=30"`
	Email   *string `json:"email" binding:"omitempty,max=100"`
	Address *string `json:"address" binding:"omitempty,max=500"`
}

type CustomerListData struct {
	Customers  []models.Customer `json:"customers"`
	Pagination PaginationMeta    `json:"pagination"`
	Filters    SearchFilters     `json:"filters"`
}

type SupplierRequest struct {
	Name            string  `json:"name" binding:"required,max=150"`
	Address         *string `json:"address" binding:"omitempty,max=500"`
	Phone           *string `json:"phone" binding:"omitempty,max=30"`
	ContactName     *string `json:"contact_name" binding:"omitempty,max=100"`
	TaxNumber       *string `json:"tax_number" binding:"omitempty,max=30"`
	PaymentTermDays *int    `json:"payment_term_days" binding:"omitempty,gte=0,lte=365"`
}

type SupplierListData struct {
	Suppliers  []models.Supplier `json:"suppliers"`
	Pagination *PaginationMeta   `json:"pagination,omitempty"`
	Filters    SearchFilters     `json:"filters"`
}

// ---------------------------------------------------------------- produk (F2)

// ProductUnitInput is one row of the units table sent (as JSON in the `units` form field) with the product.
type ProductUnitInput struct {
	ID            uint64  `json:"id"` // 0 = new unit
	Name          string  `json:"name"`
	ConversionQty int     `json:"conversion_qty"`
	Price         int64   `json:"price"`
	Barcode       *string `json:"barcode"`
	IsBase        bool    `json:"is_base"`
}

// ProductForm is multipart/form-data: fields + `units` (JSON array) + optional `image`.
type ProductForm struct {
	CategoryID    *uint64 `form:"category_id"`
	Name          string  `form:"name" binding:"required,max=150"`
	GenericName   string  `form:"generic_name" binding:"max=150"`
	DrugClass     string  `form:"drug_class" binding:"required"`
	ShelfLocation string  `form:"shelf_location" binding:"max=30"`
	MinStock      int     `form:"min_stock" binding:"gte=0"`
	TrackStock    *bool   `form:"track_stock"`
	Units         string  `form:"units" binding:"required"`
	RemoveImage   bool    `form:"remove_image"`
}

// ProductItem is a product with stock computed from batches (D7).
type ProductItem struct {
	ID            uint64               `json:"id"`
	CategoryID    *uint64              `json:"category_id"`
	CategoryName  *string              `json:"category_name"`
	Name          string               `json:"name"`
	GenericName   *string              `json:"generic_name"`
	DrugClass     string               `json:"drug_class"`
	ShelfLocation *string              `json:"shelf_location"`
	MinStock      int                  `json:"min_stock"`
	TrackStock    bool                 `json:"track_stock"`
	Image         *string              `json:"image"`
	Stock         int                  `json:"stock"`
	SellableStock int                  `json:"sellable_stock"`
	NearestExpiry *models.Date         `json:"nearest_expiry"`
	StockStatus   string               `json:"stock_status"`  // out | low | ok
	ExpiryStatus  string               `json:"expiry_status"` // expired | warning | ok | none
	CreatedAt     time.Time            `json:"created_at"`
	UpdatedAt     time.Time            `json:"updated_at"`
	Units         []models.ProductUnit `json:"units" gorm:"-"`
}

type ProductListData struct {
	Products   []ProductItem  `json:"products"`
	Pagination PaginationMeta `json:"pagination"`
	Filters    map[string]any `json:"filters"`
}

type ProductDetail struct {
	ProductItem
	Batches []models.ProductBatch `json:"batches"`
}

type BarcodeData struct {
	Product ProductItem        `json:"product"`
	Unit    models.ProductUnit `json:"unit"`
}

type StockMovementItem struct {
	models.StockMovement
	BatchNumber *string `json:"batch_number"`
	Username    *string `json:"username"`
}

type StockMovementListData struct {
	StockMovements []StockMovementItem `json:"stock_movements"`
	Pagination     PaginationMeta      `json:"pagination"`
}
