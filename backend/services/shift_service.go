package services

import (
	"errors"
	"strings"

	"pos-apotek-api/dto"
	"pos-apotek-api/helpers"
	"pos-apotek-api/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// OpenShift starts a shift; one open shift per user and per till (F9, partial unique indexes).
func OpenShift(tx *gorm.DB, actorID, tillID uint64, openingCash int64, ip string) (*models.Shift, error) {
	if openingCash < 0 {
		return nil, invalid("Modal awal tidak boleh negatif")
	}
	var till models.Till
	if err := tx.First(&till, tillID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, invalid("Till tidak ditemukan")
		}
		return nil, err
	}
	var open []models.Shift
	if err := tx.Where("status = 'open' AND (user_id = ? OR till_id = ?)", actorID, tillID).Find(&open).Error; err != nil {
		return nil, err
	}
	for _, s := range open {
		if s.UserID == actorID {
			return nil, conflict("Anda masih punya shift terbuka")
		}
		return nil, conflict("Till %d sedang dipakai shift lain", till.Number)
	}
	s := models.Shift{UserID: actorID, TillID: till.ID, Status: "open", OpeningCash: openingCash, OpenedAt: helpers.Now()}
	if err := tx.Omit(clause.Associations).Create(&s).Error; err != nil {
		if helpers.IsUniqueViolation(err) {
			return nil, conflict("Shift untuk user atau till ini sudah terbuka")
		}
		return nil, err
	}
	if err := WriteAudit(tx, AuditEntry{UserID: &actorID, Action: "open", EntityType: "shift", EntityID: &s.ID, After: s, IP: ip}); err != nil {
		return nil, err
	}
	s.Till = &till
	return &s, nil
}

// RecapShift sums sales, voids and refunds per payment method. Expected cash = opening + cash sales − cash refunds (BR12).
func RecapShift(db *gorm.DB, s *models.Shift) (*dto.ShiftRecap, error) {
	type row struct {
		Method string
		Status string
		N      int64
		Total  int64
	}
	var sales []row
	if err := db.Raw(`SELECT payment_method AS method, status, COUNT(*) AS n, COALESCE(SUM(total), 0) AS total
		FROM transactions WHERE shift_id = ? AND status IN ('paid','void') GROUP BY payment_method, status`, s.ID).Scan(&sales).Error; err != nil {
		return nil, err
	}
	var refunds []row
	if err := db.Raw(`SELECT refund_method AS method, COUNT(*) AS n, COALESCE(SUM(total_refund), 0) AS total
		FROM sales_returns WHERE shift_id = ? GROUP BY refund_method`, s.ID).Scan(&refunds).Error; err != nil {
		return nil, err
	}
	recap := &dto.ShiftRecap{OpeningCash: s.OpeningCash}
	byMethod := map[string]*dto.MethodRecap{}
	for _, m := range models.PaymentMethods {
		recap.Methods = append(recap.Methods, dto.MethodRecap{Method: m})
	}
	for i := range recap.Methods {
		byMethod[recap.Methods[i].Method] = &recap.Methods[i]
	}
	for _, r := range sales {
		m := byMethod[r.Method]
		if m == nil {
			continue
		}
		if r.Status == "paid" {
			m.SalesCount, m.SalesTotal = r.N, r.Total
		} else {
			m.VoidCount, m.VoidTotal = r.N, r.Total
		}
	}
	for _, r := range refunds {
		if m := byMethod[r.Method]; m != nil {
			m.RefundCount, m.RefundTotal = r.N, r.Total
		}
	}
	for i := range recap.Methods {
		m := &recap.Methods[i]
		m.NetReceived = m.SalesTotal - m.RefundTotal
	}
	recap.CashSales = byMethod["cash"].SalesTotal
	recap.CashRefunds = byMethod["cash"].RefundTotal
	recap.ExpectedCash = recap.OpeningCash + recap.CashSales - recap.CashRefunds
	return recap, nil
}

// CloseShift stores expected/counted cash and the difference; only the owner can close, and a closed shift stays closed (F9).
func CloseShift(tx *gorm.DB, actorID, shiftID uint64, countedCash int64, note, ip string) (*models.Shift, *dto.ShiftRecap, error) {
	if countedCash < 0 {
		return nil, nil, invalid("Kas fisik tidak boleh negatif")
	}
	var s models.Shift
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&s, shiftID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, notFound("Shift tidak ditemukan")
		}
		return nil, nil, err
	}
	if s.UserID != actorID {
		return nil, nil, fail(403, "Hanya pemilik shift yang bisa menutup shift")
	}
	if s.Status != "open" {
		return nil, nil, conflict("Shift sudah ditutup")
	}
	recap, err := RecapShift(tx, &s)
	if err != nil {
		return nil, nil, err
	}
	now := helpers.Now()
	diff := countedCash - recap.ExpectedCash
	s.Status, s.ExpectedCash, s.CountedCash, s.CashDifference, s.ClosedAt = "closed", &recap.ExpectedCash, &countedCash, &diff, &now
	s.Note = optStr(strings.TrimSpace(note))
	if err := tx.Model(&s).Updates(map[string]any{
		"status": "closed", "expected_cash": recap.ExpectedCash, "counted_cash": countedCash, "cash_difference": diff, "closed_at": now, "note": s.Note,
	}).Error; err != nil {
		return nil, nil, err
	}
	after := map[string]any{"expected_cash": recap.ExpectedCash, "counted_cash": countedCash, "cash_difference": diff}
	if err := WriteAudit(tx, AuditEntry{UserID: &actorID, Action: "close", EntityType: "shift", EntityID: &s.ID, After: after, IP: ip}); err != nil {
		return nil, nil, err
	}
	return &s, recap, nil
}
