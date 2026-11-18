package models

import "time"

var DrugClasses = []string{"bebas", "bebas_terbatas", "keras", "narkotika", "psikotropika", "non_obat"}

func ValidDrugClass(s string) bool {
	for _, c := range DrugClasses {
		if c == s {
			return true
		}
	}
	return false
}

// NeedsPrescription: these classes require a customer (patient) and a prescription number to be paid (BR4).
func NeedsPrescription(drugClass string) bool {
	return drugClass == "narkotika" || drugClass == "psikotropika"
}

type Category struct {
	ID        uint64    `gorm:"primaryKey" json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Category) TableName() string { return "categories" }

type Product struct {
	ID            uint64        `gorm:"primaryKey" json:"id"`
	CategoryID    *uint64       `json:"category_id"`
	Name          string        `json:"name"`
	GenericName   *string       `json:"generic_name"`
	DrugClass     string        `json:"drug_class"`
	ShelfLocation *string       `json:"shelf_location"`
	MinStock      int           `json:"min_stock"`
	TrackStock    bool          `json:"track_stock"`
	Image         *string       `json:"image"`
	DeletedAt     *time.Time    `json:"-"`
	CreatedAt     time.Time     `json:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at"`
	Units         []ProductUnit `gorm:"foreignKey:ProductID" json:"units,omitempty"`
}

func (Product) TableName() string { return "products" }

type ProductUnit struct {
	ID            uint64     `gorm:"primaryKey" json:"id"`
	ProductID     uint64     `json:"product_id"`
	Name          string     `json:"name"`
	ConversionQty int        `json:"conversion_qty"`
	Price         int64      `json:"price"`
	Barcode       *string    `json:"barcode"`
	IsBase        bool       `json:"is_base"`
	DeletedAt     *time.Time `json:"-"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

func (ProductUnit) TableName() string { return "product_units" }

type Customer struct {
	ID        uint64    `gorm:"primaryKey" json:"id"`
	Name      string    `json:"name"`
	Phone     *string   `json:"phone"`
	Email     *string   `json:"email"`
	Address   *string   `json:"address"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (Customer) TableName() string { return "customers" }

type Supplier struct {
	ID              uint64     `gorm:"primaryKey" json:"id"`
	Name            string     `json:"name"`
	Address         *string    `json:"address"`
	Phone           *string    `json:"phone"`
	ContactName     *string    `json:"contact_name"`
	TaxNumber       *string    `json:"tax_number"`
	PaymentTermDays int        `json:"payment_term_days"`
	DeletedAt       *time.Time `json:"-"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

func (Supplier) TableName() string { return "suppliers" }
