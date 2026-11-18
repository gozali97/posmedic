// Command seed fills the database for testing or for a new store.
//
// Demo (default): staff, tills, categories, suppliers, customers, products, ~45 days of purchases, shifts,
// sales (default 1000 transactions incl. held/void), returns, adjustments and stock opname. Everything goes
// through the same services as the app (FEFO, weighted cost, document numbers, audit), with the service clock
// (helpers.Now) replayed day by day, so the numbers add up. Demo rows are listed in table demo_seed and can be removed.
//
// Starter (-starter): only master data for a new store: categories, products with units and prices, and tills
// if there are none. No stock, transactions or fake barcodes. The rows are permanent and the run is idempotent.
//
//	go run ./cmd/seed                    # demo data (refuses if it already exists)
//	go run ./cmd/seed -reset             # delete all demo data (and anything that uses it); keeps admin & settings
//	go run ./cmd/seed -starter           # master data for a new store
//
// In the Docker image the binary is /app/seed. With APP_ENV=production, demo data and -reset need -allow-production.
package main

import (
	"flag"
	"fmt"
	"log"
	"math/rand/v2"
	"os"
	"sort"
	"time"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"pos-apotek-api/config"
	"pos-apotek-api/helpers"
	"pos-apotek-api/models"
)

const ip = "127.0.0.1"

type seedProduct struct {
	def   productDef
	id    uint64
	units []models.ProductUnit // ascending conversion, base first
}

func (p *seedProduct) base() models.ProductUnit { return p.units[0] }

// biggest returns the largest unit whose conversion fits in qty base units (the unit a supplier ships in).
func (p *seedProduct) biggest(qty int) models.ProductUnit {
	u := p.units[0]
	for _, x := range p.units {
		if x.ConversionQty <= qty {
			u = x
		}
	}
	return u
}

type seeder struct {
	db        *gorm.DB
	rng       *rand.Rand
	now       time.Time // simulated clock
	realNow   time.Time
	start     time.Time // first simulated day (midnight, Jakarta)
	users     map[string]uint64
	tills     []models.Till
	suppliers []models.Supplier
	customers []uint64
	products  []*seedProduct
	totalW    int
	invSeq    int
	stats     map[string]int
}

func main() {
	reset := flag.Bool("reset", false, "hapus semua data demo lalu keluar")
	target := flag.Int("transactions", 1000, "jumlah baris transaksi (lunas + void + tertunda)")
	days := flag.Int("days", 45, "jumlah hari ke belakang yang disimulasikan")
	seed := flag.Uint64("seed", 20261118, "seed acak (hasil sama untuk seed sama)")
	starter := flag.Bool("starter", false, "hanya data master awal toko (kategori, produk + satuan + harga, till); permanen, aman diulang")
	allowProd := flag.Bool("allow-production", false, "izinkan data demo / -reset saat APP_ENV=production (mis. server demo)")
	flag.Parse()

	_ = godotenv.Load()
	if os.Getenv("APP_ENV") == "production" && !*starter && !*allowProd {
		log.Fatal("APP_ENV=production: data demo dan -reset butuh flag -allow-production; untuk data master awal pakai -starter")
	}
	if err := config.ConnectDatabase(); err != nil {
		log.Fatalf("koneksi database: %v", err)
	}
	// Quiet logger; GORM timestamps follow the simulated clock.
	db := config.GetDB().Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent), NowFunc: func() time.Time { return helpers.Now().Local() }})
	if *starter {
		if err := seedStarter(db); err != nil {
			log.Fatalf("starter: %v", err)
		}
		return
	}
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS demo_seed (entity VARCHAR(30) NOT NULL, entity_id BIGINT NOT NULL, PRIMARY KEY (entity, entity_id))`).Error; err != nil {
		log.Fatal(err)
	}

	if *reset {
		if err := resetDemo(db); err != nil {
			log.Fatalf("reset: %v", err)
		}
		fmt.Println("Data demo dihapus.")
		return
	}
	var marked int64
	db.Table("demo_seed").Count(&marked)
	if marked > 0 {
		log.Fatal("data demo sudah ada; jalankan `go run ./cmd/seed -reset` dulu")
	}

	realNow := time.Now().In(helpers.Jakarta)
	today := time.Date(realNow.Year(), realNow.Month(), realNow.Day(), 0, 0, 0, 0, helpers.Jakarta)
	s := &seeder{
		db: db, rng: rand.New(rand.NewPCG(*seed, *seed^0x9e3779b97f4a7c15)), realNow: realNow,
		start: today.AddDate(0, 0, -*days), users: map[string]uint64{}, stats: map[string]int{},
	}
	helpers.Now = func() time.Time { return s.now }
	defer func() { helpers.Now = time.Now }()

	began := time.Now()
	if err := s.run(*days, *target); err != nil {
		log.Fatalf("seed gagal (jalankan -reset untuk membersihkan sisa): %v", err)
	}
	s.report(time.Since(began))
}

// ---------------------------------------------------------------- helpers

func (s *seeder) at(day time.Time, hh, mm int) time.Time {
	return time.Date(day.Year(), day.Month(), day.Day(), hh, mm, s.rng.IntN(60), 0, helpers.Jakarta)
}

// setNow moves the simulated clock forward (never backwards, never past the real now).
func (s *seeder) setNow(t time.Time) {
	if t.After(s.realNow) {
		t = s.realNow
	}
	if t.After(s.now) {
		s.now = t
	}
}

func (s *seeder) mark(entity string, id uint64) error {
	return s.db.Exec(`INSERT INTO demo_seed (entity, entity_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, entity, id).Error
}

func (s *seeder) chance(p float64) bool { return s.rng.Float64() < p }

func (s *seeder) pick(n int) int { return s.rng.IntN(n) }

func ptr[T any](v T) *T { return &v }

func optStr(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

// ---------------------------------------------------------------- master data

func (s *seeder) seedMasters() error {
	s.setNow(s.at(s.start.AddDate(0, 0, -1), 9, 0))

	hash, err := bcrypt.GenerateFromPassword([]byte(demoPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	for _, d := range staffDefs {
		u := models.User{Username: d.username, Fullname: d.fullname, PasswordHash: string(hash), PermProducts: d.products, PermPurchases: d.purchases,
			PermCategories: d.categories, PermTransactions: d.transactions, IsActive: true}
		if err := s.db.Create(&u).Error; err != nil {
			return fmt.Errorf("user %s: %w", d.username, err)
		}
		s.users[d.username] = u.ID
		if err := s.mark("users", u.ID); err != nil {
			return err
		}
	}

	var maxNumber int
	s.db.Table("tills").Select("COALESCE(MAX(number), 0)").Scan(&maxNumber)
	for i, name := range tillNames {
		t := models.Till{Number: maxNumber + i + 1, Name: name}
		if err := s.db.Create(&t).Error; err != nil {
			return fmt.Errorf("till %s: %w", name, err)
		}
		s.tills = append(s.tills, t)
		if err := s.mark("tills", t.ID); err != nil {
			return err
		}
	}

	catIDs := make([]uint64, len(categoryNames))
	for i, name := range categoryNames {
		c := models.Category{Name: name}
		if err := s.db.Create(&c).Error; err != nil {
			return fmt.Errorf("kategori %q sudah ada? %w", name, err)
		}
		catIDs[i] = c.ID
		if err := s.mark("categories", c.ID); err != nil {
			return err
		}
	}

	for _, d := range supplierDefs {
		sp := models.Supplier{Name: d.name, Address: optStr(d.address), Phone: optStr(d.phone), ContactName: optStr(d.contact), TaxNumber: optStr(d.npwp), PaymentTermDays: d.term}
		if err := s.db.Create(&sp).Error; err != nil {
			return err
		}
		s.suppliers = append(s.suppliers, sp)
		if err := s.mark("suppliers", sp.ID); err != nil {
			return err
		}
	}

	for _, d := range customerDefs {
		c := models.Customer{Name: d.name, Phone: optStr(d.phone), Email: optStr(d.email), Address: optStr(d.address)}
		if err := s.db.Create(&c).Error; err != nil {
			return err
		}
		s.customers = append(s.customers, c.ID)
		if err := s.mark("customers", c.ID); err != nil {
			return err
		}
	}

	for i, d := range productDefs {
		p := models.Product{CategoryID: &catIDs[d.category], Name: d.name, GenericName: optStr(d.generic), DrugClass: d.class,
			ShelfLocation: optStr(d.shelf), MinStock: d.minStock, TrackStock: d.track}
		if err := s.db.Omit("Units").Create(&p).Error; err != nil {
			return fmt.Errorf("produk %s: %w", d.name, err)
		}
		sp := &seedProduct{def: d, id: p.ID}
		for j, ud := range d.units {
			var barcode *string
			if d.track {
				barcode = ptr(fmt.Sprintf("8995%03d%02d%03d", i+1, j+1, ud.conv%1000))
			}
			u := models.ProductUnit{ProductID: p.ID, Name: ud.name, ConversionQty: ud.conv, Price: ud.price, Barcode: barcode, IsBase: j == 0}
			if err := s.db.Create(&u).Error; err != nil {
				return fmt.Errorf("satuan %s %s: %w", d.name, ud.name, err)
			}
			sp.units = append(sp.units, u)
		}
		sort.Slice(sp.units, func(a, b int) bool { return sp.units[a].ConversionQty < sp.units[b].ConversionQty })
		s.products = append(s.products, sp)
		s.totalW += d.weight
		if err := s.mark("products", p.ID); err != nil {
			return err
		}
	}
	return nil
}

func (s *seeder) report(took time.Duration) {
	fmt.Printf("\nSeed demo selesai dalam %s.\n\n", took.Round(time.Second))
	for _, t := range []string{"users", "tills", "categories", "suppliers", "customers", "products", "product_batches", "purchases", "shifts", "transactions", "sales_returns", "stock_opnames", "stock_movements", "audit_logs"} {
		var n int64
		s.db.Table(t).Count(&n)
		fmt.Printf("  %-16s %6d\n", t, n)
	}
	var byStatus []struct {
		Status string
		N      int64
	}
	s.db.Table("transactions").Select("status, COUNT(*) AS n").Group("status").Order("status").Scan(&byStatus)
	fmt.Print("\n  transaksi per status:")
	for _, r := range byStatus {
		fmt.Printf(" %s=%d", r.Status, r.N)
	}
	fmt.Printf("\n  penyesuaian stok: %d, pembayaran hutang: %d, gagal stok (dilewati): %d\n", s.stats["adjust"], s.stats["mark_paid"], s.stats["stock_skip"])
	fmt.Printf("\nLogin demo (password %q): ", demoPassword)
	for _, d := range staffDefs {
		if d.active {
			fmt.Printf("%s ", d.username)
		}
	}
	fmt.Println("\nHapus semua data demo: go run ./cmd/seed -reset")
}
