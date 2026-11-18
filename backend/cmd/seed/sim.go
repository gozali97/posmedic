package main

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"

	"pos-apotek-api/models"
	"pos-apotek-api/services"
)

type shiftCtx struct {
	user   string
	userID uint64
	till   models.Till
	shift  *models.Shift
}

type event struct {
	at time.Time
	fn func() error
}

type heldRef struct {
	id uint64
	at time.Time
}

type paidRef struct {
	id uint64
	at time.Time
}

// simulation state kept across days
var (
	held        []heldRef
	paid        []paidRef
	soldOutDay  = map[uint64]int{} // product id → day index it was found sold out
	currentDay  int
	opnameCount int
)

var (
	adjustDays  = map[int]bool{4: true, 8: true, 11: true, 14: true, 18: true, 21: true, 25: true, 29: true, 32: true, 36: true, 40: true}
	opnameDays  = []int{6, 10, 14, 18, 22, 26, 30, 34, 38}
	opnameShelf = []string{"A-01", "B-01", "C-02", "", "E-01", "H-01", "K-01", "J-01", "A-02"}
	voidReasons = []string{"Salah input jumlah", "Pelanggan batal membeli", "Salah pilih produk", "Pembayaran dobel"}
	retReasons  = []string{"Salah beli, kemasan masih utuh", "Alergi, dokter ganti resep", "Kemasan rusak", "Kelebihan beli", "Obat tidak cocok"}
	heldRefs    = []string{"Antrian %d", "Titip resep %d", "Pesanan WA %d", "Meja konsultasi %d"}
	doctors     = []string{"dr. Andi Wijaya", "dr. Ratna Sari, Sp.A", "dr. Bima Putra", "dr. Lusi Handayani, Sp.PD", "drg. Tono"}
)

func (s *seeder) uid(name string) uint64 { return s.users[name] }

func (s *seeder) run(days, target int) error {
	if err := s.seedMasters(); err != nil {
		return err
	}
	today := s.start.AddDate(0, 0, days)
	todayFrom := s.at(today, 7, 0)
	todayOn := s.realNow.Sub(todayFrom) > 40*time.Minute
	todayTarget := 12 + 12 // held orders + top-up in the open shift
	if todayOn {
		todayTarget += 6 // morning shift
	}

	// Spread the rest over the past days; weekends are busier.
	weights := make([]float64, days)
	sum := 0.0
	for d := range weights {
		w := 0.85 + s.rng.Float64()*0.3
		if wd := s.start.AddDate(0, 0, d).Weekday(); wd == time.Saturday || wd == time.Sunday {
			w *= 1.25
		}
		weights[d], sum = w, sum+w
	}
	for d := 0; d < days; d++ {
		currentDay = d
		n := int(math.Round(float64(target-todayTarget) * weights[d] / sum))
		if err := s.simulateDay(d, days, n); err != nil {
			return fmt.Errorf("hari %d (%s): %w", d, s.start.AddDate(0, 0, d).Format("2006-01-02"), err)
		}
		fmt.Printf("\r  hari %2d/%d  transaksi %d", d+1, days, s.demoTransactions())
	}
	currentDay = days
	fmt.Println()
	return s.simulateToday(today, todayOn, target)
}

// demoTransactions counts transaction rows on demo tills (an admin's own sales are not part of the target).
func (s *seeder) demoTransactions() int {
	var n int64
	s.db.Table("transactions").Where("till_id IN (SELECT entity_id FROM demo_seed WHERE entity = 'tills')").Count(&n)
	return int(n)
}

func (s *seeder) runEvents(evs []event) error {
	sort.SliceStable(evs, func(i, j int) bool { return evs[i].at.Before(evs[j].at) })
	for _, e := range evs {
		s.setNow(e.at)
		if err := e.fn(); err != nil {
			return err
		}
	}
	return nil
}

// ---------------------------------------------------------------- one past day

func (s *seeder) simulateDay(d, days, sales int) error {
	day := s.start.AddDate(0, 0, d)
	var evs []event
	add := func(t time.Time, fn func() error) { evs = append(evs, event{t, fn}) }

	if d == 0 {
		add(s.at(day, 6, 30), s.initialStock)
	}
	if d == 15 { // one cashier leaves: account deactivated, history stays
		add(s.at(day, 6, 0), func() error {
			return s.db.Model(&models.User{}).Where("id = ?", s.uid("demo_kasir7")).Update("is_active", false).Error
		})
	}
	if d > 0 && d%3 == 0 {
		add(s.at(day, 8, 10), s.restock)
	}
	if d == days-12 {
		add(s.at(day, 8, 20), s.shortDatedPurchase(true))
	}
	if d == days-1 {
		add(s.at(day, 8, 25), s.shortDatedPurchase(false))
	}
	add(s.at(day, 10, 0), s.payDuePurchases)
	if adjustDays[d] {
		add(s.at(day, 16, 0), s.randomAdjustment)
	}
	if d == days-3 {
		add(s.at(day, 16, 30), s.destroyExpired)
	}
	for i, od := range opnameDays {
		if od == d {
			add(s.at(day, 21, 40), s.opname(i, true))
		}
	}
	if d == days-1 {
		add(s.at(day, 21, 50), s.opname(len(opnameDays), false))
	}

	cashiers := []string{"demo_kasir1", "demo_kasir2", "demo_kasir3", "demo_kasir4", "demo_kasir5", "demo_kasir6"}
	if d < 15 {
		cashiers = append(cashiers, "demo_kasir7")
	}
	n := len(cashiers)
	slots := []struct {
		till       int
		user       string
		from, to   [2]int
		share      float64
		pharmacist bool
	}{
		{0, cashiers[(2*d)%n], [2]int{7, 0}, [2]int{14, 0}, 0.30, false},
		{1, cashiers[(2*d+1)%n], [2]int{7, 0}, [2]int{14, 0}, 0.20, false},
		{2, "demo_apoteker", [2]int{7, 30}, [2]int{14, 0}, 0.15, true},
		{0, cashiers[(2*d+2)%n], [2]int{14, 20}, [2]int{21, 0}, 0.20, false},
		{1, cashiers[(2*d+3)%n], [2]int{14, 20}, [2]int{21, 0}, 0.15, false},
	}
	for _, sl := range slots {
		sh := &shiftCtx{user: sl.user, userID: s.uid(sl.user), till: s.tills[sl.till]}
		from := s.at(day, sl.from[0], sl.from[1]+s.pick(5))
		to := s.at(day, sl.to[0], sl.to[1]).Add(time.Duration(s.pick(15)) * time.Minute)
		add(from, func() error { return s.openShift(sh, 300000+int64(s.pick(3))*100000) })
		add(from.Add(20*time.Minute), func() error { return s.handleHeld(sh) })
		k := int(math.Round(float64(sales) * sl.share))
		span := to.Sub(from) - 20*time.Minute
		for i := 0; i < k; i++ {
			t := from.Add(10*time.Minute + time.Duration(s.rng.Int64N(int64(span))))
			add(t, func() error { return s.sale(sh, true) })
		}
		if sl.pharmacist && d%2 == 1 {
			add(from.Add(time.Duration(60+s.pick(240))*time.Minute), func() error { return s.salesReturn(sh) })
		}
		add(to, func() error { return s.closeShift(sh) })
	}
	return s.runEvents(evs)
}

// ---------------------------------------------------------------- today (up to the real clock)

func (s *seeder) simulateToday(today time.Time, morningShift bool, target int) error {
	var evs []event
	add := func(t time.Time, fn func() error) { evs = append(evs, event{t, fn}) }
	end := s.realNow.Add(-2 * time.Minute)

	if morningShift {
		sh := &shiftCtx{user: "demo_kasir1", userID: s.uid("demo_kasir1"), till: s.tills[0]}
		from, to := s.at(today, 7, 0), s.realNow.Add(-10*time.Minute)
		add(from, func() error { return s.openShift(sh, 300000) })
		for i := 0; i < 6; i++ {
			t := from.Add(5*time.Minute + time.Duration(s.rng.Int64N(int64(to.Sub(from)-10*time.Minute))))
			add(t, func() error { return s.sale(sh, true) })
		}
		add(to, func() error { return s.closeShift(sh) })
	}
	// An open shift is left on till 4 so the shift list shows one "Terbuka" (closable only by its owner).
	open := &shiftCtx{user: "demo_kasir6", userID: s.uid("demo_kasir6"), till: s.tills[3]}
	openAt := s.realNow.Add(-50 * time.Minute)
	if t := s.at(today, 7, 5); t.Before(s.realNow.Add(-15 * time.Minute)) {
		openAt = t
	}
	add(openAt, func() error { return s.openShift(open, 250000) })
	add(openAt.Add(3*time.Minute), func() error { return s.handleHeld(open) })
	// Held orders still waiting today: both lists (open tab / customer) get some.
	for i := 0; i < 12; i++ {
		withRef := i%2 == 0
		add(openAt.Add(time.Duration(5+i*2)*time.Minute), func() error {
			in, _, ok := s.cart(open)
			if !ok {
				return nil
			}
			return s.hold(open, in, withRef)
		})
	}
	if err := s.runEvents(evs); err != nil {
		return err
	}

	// Top up to exactly `target` rows (sold-out retries and deleted held orders leave gaps).
	missing := target - s.demoTransactions()
	for i, tries := 0, missing*4; missing > 0 && i < tries; i++ {
		frac := float64(i+1) / float64(missing+1)
		s.setNow(openAt.Add(time.Duration(frac * float64(end.Sub(openAt)))))
		if err := s.sale(open, false); err != nil {
			return err
		}
		missing = target - s.demoTransactions()
	}
	if missing > 0 {
		return fmt.Errorf("hanya %d dari %d transaksi terbentuk (stok habis?)", target-missing, target)
	}
	return nil
}

// ---------------------------------------------------------------- shifts

func (s *seeder) openShift(sh *shiftCtx, cash int64) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var err error
		sh.shift, err = services.OpenShift(tx, sh.userID, sh.till.ID, cash, ip)
		return err
	})
}

func (s *seeder) closeShift(sh *shiftCtx) error {
	recap, err := services.RecapShift(s.db, sh.shift)
	if err != nil {
		return err
	}
	counted, note := recap.ExpectedCash, ""
	if s.chance(0.15) {
		diff := []int64{-5000, -2000, -1000, -500, 500, 1000, 2000}[s.pick(7)]
		counted += diff
		note = "Selisih uang kembalian"
		if diff > 0 {
			note = "Kelebihan uang di laci"
		}
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		_, _, err := services.CloseShift(tx, sh.userID, sh.shift.ID, max(counted, 0), note, ip)
		return err
	})
}

// ---------------------------------------------------------------- sales

func (s *seeder) pickProduct(exclude map[uint64]bool) *seedProduct {
	for tries := 0; tries < 20; tries++ {
		r := s.pick(s.totalW)
		for _, p := range s.products {
			if r < p.def.weight {
				if exclude[p.id] || (p.def.track && soldOutDay[p.id] == currentDay+1) {
					break
				}
				return p
			}
			r -= p.def.weight
		}
	}
	return nil
}

func (s *seeder) cart(sh *shiftCtx) (services.CartInput, int64, bool) {
	in := services.CartInput{TillID: sh.till.ID}
	lines := []int{1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4}[s.pick(20)]
	used := map[uint64]bool{}
	var subtotal int64
	strict, keras := false, false
	for i := 0; i < lines; i++ {
		p := s.pickProduct(used)
		if p == nil {
			continue
		}
		used[p.id] = true
		u, qty := p.base(), 1
		switch {
		case len(p.units) > 2 && s.chance(0.03):
			u = p.units[2]
		case len(p.units) > 1 && s.chance(0.35):
			u, qty = p.units[1], 1+s.pick(3)
		case p.base().Name == "tablet" || p.base().Name == "kapsul" || p.base().Name == "kaplet" || p.base().Name == "pcs":
			qty = []int{1, 2, 3, 4, 5, 6, 6, 10, 10, 12, 15, 20}[s.pick(12)]
		case p.def.track && s.chance(0.3):
			qty = 2
		}
		in.Items = append(in.Items, services.CartLine{ProductUnitID: u.ID, Quantity: qty})
		subtotal += u.Price * int64(qty)
		switch p.def.class {
		case "narkotika", "psikotropika":
			strict = true
		case "keras":
			keras = true
		}
	}
	if len(in.Items) == 0 {
		return in, 0, false
	}
	if strict || s.chance(0.15) {
		in.CustomerID = ptr(s.customers[s.pick(len(s.customers))])
	}
	if strict || (keras && s.chance(0.4)) {
		in.PrescriptionNumber = fmt.Sprintf("R/%s/%03d", s.now.Format("0102"), 1+s.pick(300))
		in.PrescriptionNote = doctors[s.pick(len(doctors))]
	}
	if subtotal >= 20000 && s.chance(0.08) {
		if d := (subtotal * int64(3+s.pick(8)) / 100) / 500 * 500; d > 0 && d < subtotal {
			in.Discount = d
		}
	}
	return in, subtotal - in.Discount, true
}

func (s *seeder) payment(total int64) services.PaymentInput {
	r := s.rng.Float64()
	switch {
	case r < 0.22:
		return services.PaymentInput{Method: "qris", Paid: total, Info: fmt.Sprintf("QR%08d", s.rng.IntN(1e8))}
	case r < 0.32:
		return services.PaymentInput{Method: "card", Paid: total, Info: []string{"BCA Debit", "Mandiri Debit", "BRI Debit", "BNI Debit"}[s.pick(4)]}
	}
	paid := total
	if s.chance(0.7) {
		step := []int64{1000, 5000, 10000, 50000, 100000}[s.pick(5)]
		paid = (total + step - 1) / step * step
	}
	return services.PaymentInput{Method: "cash", Paid: paid}
}

// noteSoldOut remembers (for today) the product named in a stock error, so the next carts skip it.
func (s *seeder) noteSoldOut(err error) bool {
	var be *services.BizError
	if !errors.As(err, &be) {
		return false
	}
	for _, p := range s.products {
		if strings.Contains(be.Message, "Stok "+p.def.name+" ") {
			soldOutDay[p.id] = currentDay + 1
		}
	}
	s.stats["stock_skip"]++
	return true
}

// sale makes one checkout (or, rarely, a held order); allowHold=false only checks out.
func (s *seeder) sale(sh *shiftCtx, allowHold bool) error {
	for attempt := 0; attempt < 4; attempt++ {
		in, total, ok := s.cart(sh)
		if !ok {
			continue
		}
		if allowHold && s.chance(0.035) {
			return s.hold(sh, in, in.CustomerID == nil || s.chance(0.5))
		}
		var t *models.Transaction
		err := s.db.Transaction(func(tx *gorm.DB) error {
			var e error
			t, e = services.Checkout(tx, sh.userID, in, s.payment(total), ip)
			return e
		})
		if err != nil {
			if s.noteSoldOut(err) {
				continue
			}
			return err
		}
		if allowHold && s.chance(0.013) {
			// Supervisor voids it right away, while the shift is still open (BR7).
			return s.db.Transaction(func(tx *gorm.DB) error {
				_, e := services.Void(tx, s.uid("demo_spv"), t.ID, voidReasons[s.pick(len(voidReasons))], ip)
				return e
			})
		}
		paid = append(paid, paidRef{t.ID, s.now})
		return nil
	}
	return nil
}

// hold saves a cart as a held order: an open tab (reference number) or a customer order.
func (s *seeder) hold(sh *shiftCtx, in services.CartInput, withRef bool) error {
	if withRef {
		in.RefNumber = fmt.Sprintf(heldRefs[s.pick(len(heldRefs))], 1+s.pick(40))
	} else if in.CustomerID == nil {
		in.CustomerID = ptr(s.customers[s.pick(len(s.customers))])
	}
	var t *models.Transaction
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var e error
		t, e = services.Hold(tx, sh.userID, in, ip)
		return e
	})
	if err != nil {
		return err
	}
	held = append(held, heldRef{t.ID, s.now})
	return nil
}

// handleHeld: at the start of a shift some older held orders are paid, a few are deleted.
func (s *seeder) handleHeld(sh *shiftCtx) error {
	kept := held[:0]
	for _, h := range held {
		if s.now.Sub(h.at) < time.Hour {
			kept = append(kept, h)
			continue
		}
		r := s.rng.Float64()
		switch {
		case r < 0.30:
			var total int64
			s.db.Table("transactions").Select("total").Where("id = ?", h.id).Scan(&total)
			err := s.db.Transaction(func(tx *gorm.DB) error {
				_, e := services.PayHeld(tx, sh.userID, h.id, s.payment(total), sh.till.ID, services.PayHeldOverrides{}, ip)
				return e
			})
			if err == nil {
				paid = append(paid, paidRef{h.id, s.now})
				continue
			}
			if !s.noteSoldOut(err) {
				return err
			}
		case r < 0.36:
			if err := s.db.Transaction(func(tx *gorm.DB) error { return services.DeleteHeld(tx, sh.userID, h.id, ip) }); err != nil {
				return err
			}
			continue
		}
		kept = append(kept, h)
	}
	held = kept
	return nil
}

// salesReturn: the pharmacist (perm_transactions) refunds part of a sale from the last week out of her shift.
func (s *seeder) salesReturn(sh *shiftCtx) error {
	for tries := 0; tries < 10 && len(paid) > 0; tries++ {
		p := paid[s.pick(len(paid))]
		if s.now.Sub(p.at) > 7*24*time.Hour || s.now.Sub(p.at) < time.Hour {
			continue
		}
		var t models.Transaction
		if err := s.db.Preload("Items").First(&t, p.id).Error; err != nil {
			return err
		}
		if t.Status != "paid" {
			continue
		}
		for _, it := range t.Items {
			left := it.Quantity*it.ConversionQty - it.ReturnedBaseQuantity
			if left <= 0 || it.DrugClass == "non_obat" && it.ConversionQty == 1 && it.Price <= 3000 {
				continue
			}
			qty := 1 + s.pick(max(1, left/2))
			in := services.ReturnInput{
				Items:        []services.ReturnLine{{TransactionItemID: it.ID, BaseQuantity: qty, Restock: s.chance(0.8)}},
				Reason:       retReasons[s.pick(len(retReasons))],
				RefundMethod: *t.PaymentMethod,
			}
			return s.db.Transaction(func(tx *gorm.DB) error {
				_, e := services.CreateReturn(tx, sh.userID, t.ID, in, ip)
				return e
			})
		}
	}
	return nil
}

// ---------------------------------------------------------------- purchases & payables

func (s *seeder) nextInvoice() string {
	s.invSeq++
	return fmt.Sprintf("FJ/%s/%04d", s.now.Format("0601"), s.invSeq)
}

func (s *seeder) batchNo(p *seedProduct) string {
	return fmt.Sprintf("%c%c%s%02d", 'A'+rune(p.id%26), 'K'+rune(s.pick(10)), s.now.Format("0102"), s.pick(100))
}

func (s *seeder) purchaseItem(p *seedProduct, qty int, ed time.Time) services.PurchaseItemInput {
	u := p.biggest(qty)
	n := (qty + u.ConversionQty - 1) / u.ConversionQty
	cost := p.def.cost * int64(u.ConversionQty) * int64(95+s.pick(11)) / 100
	return services.PurchaseItemInput{ProductUnitID: u.ID, Quantity: n, UnitCost: cost, BatchNumber: s.batchNo(p), ExpirationDate: models.NewDate(ed)}
}

func (s *seeder) longED() time.Time { return s.realNow.AddDate(0, 0, 240+s.pick(480)) }

func (s *seeder) receive(supplier int, items []services.PurchaseItemInput, note string) error {
	if len(items) == 0 {
		return nil
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		_, err := services.ReceivePurchase(tx, s.uid("demo_gudang"), services.PurchaseInput{
			SupplierID: s.suppliers[supplier].ID, InvoiceNumber: s.nextInvoice(), InvoiceDate: models.NewDate(s.now), Note: note, Items: items,
		}, ip)
		return err
	})
}

func (s *seeder) initialStock() error {
	bySupplier := map[int][]services.PurchaseItemInput{}
	for _, p := range s.products {
		if p.def.track && p.def.initial > 0 {
			bySupplier[p.def.supplier] = append(bySupplier[p.def.supplier], s.purchaseItem(p, p.def.initial, s.longED()))
		}
	}
	for sup := range s.suppliers {
		if err := s.receive(sup, bySupplier[sup], "Stok awal toko"); err != nil {
			return err
		}
	}
	return nil
}

func (s *seeder) sellable() map[uint64]int {
	var rows []struct {
		ProductID uint64
		Qty       int
	}
	s.db.Table("product_batches").Select("product_id, SUM(quantity) AS qty").Where("expiration_date > ?", s.now.Format("2006-01-02")).Group("product_id").Scan(&rows)
	out := map[uint64]int{}
	for _, r := range rows {
		out[r.ProductID] = r.Qty
	}
	return out
}

// restock reorders products that dropped below a third of their opening stock.
func (s *seeder) restock() error {
	stock := s.sellable()
	bySupplier := map[int][]services.PurchaseItemInput{}
	for _, p := range s.products {
		if !p.def.track || !p.def.restock {
			continue
		}
		if stock[p.id] < max(p.def.minStock*2, p.def.initial/3) {
			bySupplier[p.def.supplier] = append(bySupplier[p.def.supplier], s.purchaseItem(p, p.def.initial, s.longED()))
			delete(soldOutDay, p.id)
		}
	}
	for sup := range s.suppliers {
		if err := s.receive(sup, bySupplier[sup], ""); err != nil {
			return err
		}
	}
	return nil
}

// shortDatedPurchase buys batches that end up expired (expired=true) or near expiry by today, for the alerts.
func (s *seeder) shortDatedPurchase(expired bool) func() error {
	return func() error {
		bySupplier := map[int][]services.PurchaseItemInput{}
		for _, p := range s.products {
			switch {
			case expired && p.def.expiredBatch > 0:
				it := s.purchaseItem(p, p.def.expiredBatch*3, s.realNow.AddDate(0, 0, -(2+s.pick(4))))
				bySupplier[p.def.supplier] = append(bySupplier[p.def.supplier], it)
			case !expired && p.def.nearExpiry:
				it := s.purchaseItem(p, p.def.initial/3, s.realNow.AddDate(0, 0, 20+s.pick(45)))
				bySupplier[p.def.supplier] = append(bySupplier[p.def.supplier], it)
			}
		}
		note := "Batch ED pendek (harga khusus)"
		for sup := range s.suppliers {
			if err := s.receive(sup, bySupplier[sup], note); err != nil {
				return err
			}
		}
		return nil
	}
}

// payDuePurchases settles most invoices around their due date; some stay overdue.
func (s *seeder) payDuePurchases() error {
	var due []models.Purchase
	s.db.Where("payment_status = 'unpaid' AND due_date <= ?", s.now.AddDate(0, 0, 3).Format("2006-01-02")).Find(&due)
	for _, p := range due {
		if p.ID%6 == 0 || s.chance(0.25) {
			continue // about one invoice in six is never paid (overdue payables); others may wait a day
		}
		note := []string{"Transfer BCA", "Transfer Mandiri", "Tunai ke sales", "Giro"}[s.pick(4)]
		paidAt := models.NewDate(s.now)
		err := s.db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&p).Updates(map[string]any{"payment_status": "paid", "paid_at": paidAt, "payment_note": note}).Error; err != nil {
				return err
			}
			gudang := s.uid("demo_gudang")
			return services.WriteAudit(tx, services.AuditEntry{UserID: &gudang, Action: "mark_paid", EntityType: "purchase", EntityID: &p.ID,
				Before: map[string]any{"payment_status": "unpaid"}, After: map[string]any{"payment_status": "paid", "paid_at": paidAt, "payment_note": note}, IP: ip})
		})
		if err != nil {
			return err
		}
		s.stats["mark_paid"]++
	}
	return nil
}

// ---------------------------------------------------------------- adjustments & opname

func (s *seeder) randomAdjustment() error {
	var batches []models.ProductBatch
	s.db.Where("quantity >= 5 AND expiration_date > ?", s.now.Format("2006-01-02")).Order("id").Find(&batches)
	if len(batches) == 0 {
		return nil
	}
	b := batches[s.pick(len(batches))]
	kinds := []struct {
		qty          int
		reason, note string
	}{
		{-1, "damaged", "Kemasan pecah/rusak saat display"},
		{-(1 + s.pick(4)), "lost", "Hilang, selisih hitung harian"},
		{2, "correction", "Koreksi: salah input penerimaan (kurang)"},
		{-2, "correction", "Koreksi: salah input penerimaan (lebih)"},
	}
	k := kinds[s.stats["adjust"]%len(kinds)]
	return s.adjust(b.ID, k.qty, k.reason, k.note)
}

func (s *seeder) adjust(batchID uint64, qty int, reason, note string) error {
	err := s.db.Transaction(func(tx *gorm.DB) error {
		_, e := services.AdjustBatch(tx, s.uid("demo_gudang"), batchID, qty, reason, note, ip)
		return e
	})
	if err == nil {
		s.stats["adjust"]++
	}
	return err
}

// destroyExpired removes one expired batch (pemusnahan); the others stay to show in the alerts.
func (s *seeder) destroyExpired() error {
	var b models.ProductBatch
	err := s.db.Where("quantity > 0 AND expiration_date <= ?", s.now.Format("2006-01-02")).Order("expiration_date, id").First(&b).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	return s.adjust(b.ID, -b.Quantity, "expired", "Pemusnahan obat kedaluwarsa, BA No. 01/PMS/"+s.now.Format("2006"))
}

// opname counts one shelf (or the vitamin category); most rows match, some differ. post=false leaves a draft.
func (s *seeder) opname(i int, post bool) func() error {
	return func() error {
		var catID *uint64
		shelf, note := "H-02", "Opname rak H-02 (belum selesai)"
		if i < len(opnameShelf) {
			shelf, note = opnameShelf[i], "Opname rutin rak "+opnameShelf[i]
		}
		if shelf == "" {
			var id uint64
			s.db.Table("categories").Select("id").Where("name = ?", categoryNames[3]).Scan(&id)
			catID, note = &id, "Opname kategori "+categoryNames[3]
		}
		apoteker := s.uid("demo_apoteker")
		return s.db.Transaction(func(tx *gorm.DB) error {
			op, err := services.CreateOpname(tx, apoteker, catID, shelf, note, ip)
			if err != nil {
				return err
			}
			var items []struct {
				ID       uint64
				Quantity int
			}
			if err := tx.Table("stock_opname_items i").Select("i.id, b.quantity").Joins("JOIN product_batches b ON b.id = i.product_batch_id").
				Where("i.stock_opname_id = ?", op.ID).Order("i.id").Scan(&items).Error; err != nil {
				return err
			}
			var counts []services.OpnameCount
			for j, it := range items {
				if !post && j%2 == 1 {
					continue // draft: half counted
				}
				q := it.Quantity
				switch r := s.rng.Float64(); {
				case r < 0.08:
					q = max(0, q-1-s.pick(2))
				case r < 0.12:
					q++
				}
				counts = append(counts, services.OpnameCount{ID: it.ID, CountedQuantity: ptr(q)})
			}
			var added []services.OpnameNewBatch
			if shelf == "C-02" { // a box found behind the shelf that was never received
				for _, p := range s.products {
					if p.def.shelf == "C-02" {
						added = append(added, services.OpnameNewBatch{ProductID: p.id, BatchNumber: "TMN" + s.now.Format("0102"), ExpirationDate: models.NewDate(s.realNow.AddDate(1, 2, 0)), CostPrice: p.def.cost, CountedQuantity: 8})
						break
					}
				}
			}
			if err := services.SaveOpnameItems(tx, op.ID, counts, added, nil); err != nil {
				return err
			}
			if post {
				_, err = services.PostOpname(tx, apoteker, op.ID, ip)
			}
			return err
		})
	}
}
