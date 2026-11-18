package models

import (
	"database/sql/driver"
	"fmt"
)

// JSONB holds raw JSON for jsonb columns; pgx may return the value as string or []byte.
type JSONB []byte

func (j *JSONB) Scan(v any) error {
	switch x := v.(type) {
	case nil:
		*j = nil
	case []byte:
		*j = append((*j)[:0], x...)
	case string:
		*j = JSONB(x)
	default:
		return fmt.Errorf("JSONB: tipe %T tidak didukung", v)
	}
	return nil
}

func (j JSONB) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return string(j), nil
}

func (j JSONB) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}
