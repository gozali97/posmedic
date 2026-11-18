package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

const dateLayout = "2006-01-02"

// Date maps a PostgreSQL DATE column and serialises as "YYYY-MM-DD" (expiry, invoice and due dates are calendar days).
type Date struct{ time.Time }

func NewDate(t time.Time) Date {
	return Date{time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)}
}

func ParseDate(s string) (Date, error) {
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return Date{}, err
	}
	return Date{t}, nil
}

func (d Date) String() string { return d.Format(dateLayout) }

func (d *Date) Scan(v any) error {
	switch x := v.(type) {
	case time.Time:
		*d = NewDate(x)
	case string:
		p, err := ParseDate(x[:min(len(x), 10)])
		if err != nil {
			return err
		}
		*d = p
	case []byte:
		return d.Scan(string(x))
	case nil:
		*d = Date{}
	default:
		return fmt.Errorf("Date: tipe %T tidak didukung", v)
	}
	return nil
}

func (d Date) Value() (driver.Value, error) { return d.String(), nil }

func (d Date) MarshalJSON() ([]byte, error) { return json.Marshal(d.String()) }

func (d *Date) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	p, err := ParseDate(s)
	if err != nil {
		return fmt.Errorf("format tanggal harus YYYY-MM-DD")
	}
	*d = p
	return nil
}

// UserBrief is the public part of a user, used in relations (cashier, author).
type UserBrief struct {
	ID       uint64 `gorm:"primaryKey" json:"id"`
	Username string `json:"username"`
	Fullname string `json:"fullname"`
}

func (UserBrief) TableName() string { return "users" }
