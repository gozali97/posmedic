package main

import (
	"fmt"

	"gorm.io/gorm"

	"pos-apotek-api/models"
)

// starterTills are created only when the store has no till yet.
var starterTills = []string{"Kasir 1", "Kasir 2", "Kasir Resep"}

// seedStarter adds the demo catalogue as real master data: categories, products with units and selling prices,
// and tills when none exist. Existing names are skipped, so it is safe to run again. Nothing is recorded in
// demo_seed, so -reset never deletes it. Prices are a starting point; review them (and add barcodes) in the app.
func seedStarter(db *gorm.DB) error {
	var cats, prods, units, tills, skipped int
	err := db.Transaction(func(tx *gorm.DB) error {
		catID := map[string]uint64{}
		for _, name := range categoryNames {
			c := models.Category{Name: name}
			res := tx.Where("name = ?", name).FirstOrCreate(&c)
			if res.Error != nil {
				return res.Error
			}
			cats += int(res.RowsAffected)
			catID[name] = c.ID
		}
		for _, d := range productDefs {
			var n int64
			if err := tx.Model(&models.Product{}).Where("name = ? AND deleted_at IS NULL", d.name).Count(&n).Error; err != nil {
				return err
			}
			if n > 0 {
				skipped++
				continue
			}
			cid := catID[categoryNames[d.category]]
			p := models.Product{CategoryID: &cid, Name: d.name, GenericName: optStr(d.generic), DrugClass: d.class, ShelfLocation: optStr(d.shelf), MinStock: d.minStock, TrackStock: d.track}
			if err := tx.Omit("Units").Create(&p).Error; err != nil {
				return fmt.Errorf("produk %s: %w", d.name, err)
			}
			for j, ud := range d.units {
				u := models.ProductUnit{ProductID: p.ID, Name: ud.name, ConversionQty: ud.conv, Price: ud.price, IsBase: j == 0}
				if err := tx.Create(&u).Error; err != nil {
					return fmt.Errorf("satuan %s %s: %w", d.name, ud.name, err)
				}
				units++
			}
			prods++
		}
		var n int64
		if err := tx.Model(&models.Till{}).Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			for i, name := range starterTills {
				if err := tx.Create(&models.Till{Number: i + 1, Name: name}).Error; err != nil {
					return err
				}
				tills++
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	fmt.Printf("Data master awal: %d kategori, %d produk (%d satuan), %d till ditambahkan; %d produk sudah ada dilewati.\n", cats, prods, units, tills, skipped)
	fmt.Println("Stok awal diisi lewat Stok Opname (atau Penerimaan Barang); cek harga dan tambahkan barcode di menu Produk.")
	return nil
}
