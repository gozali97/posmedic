package helpers

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// NextDocNumber reserves the next number for prefix/day/till inside tx (BR6).
// The upsert takes a row lock on document_sequences, so concurrent callers get distinct numbers
// and a rolled-back transaction gives its number back.
// Format: PREFIX/YYYYMMDD/{tillNumber}/{seq:04d}, or PREFIX/YYYYMMDD/{seq:04d} when tillNumber is 0.
func NextDocNumber(tx *gorm.DB, prefix string, tillID uint64, tillNumber int, at time.Time) (string, error) {
	day := at.In(Jakarta)
	var seq int
	err := tx.Raw(`INSERT INTO document_sequences (prefix, seq_date, till_id, last_value) VALUES (?, ?, ?, 1)
		ON CONFLICT (prefix, seq_date, till_id) DO UPDATE SET last_value = document_sequences.last_value + 1
		RETURNING last_value`, prefix, day.Format("2006-01-02"), tillID).Scan(&seq).Error
	if err != nil {
		return "", err
	}
	if tillNumber > 0 {
		return fmt.Sprintf("%s/%s/%d/%04d", prefix, day.Format("20060102"), tillNumber, seq), nil
	}
	return fmt.Sprintf("%s/%s/%04d", prefix, day.Format("20060102"), seq), nil
}
