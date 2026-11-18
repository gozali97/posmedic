package services

import (
	"encoding/json"

	"pos-apotek-api/models"

	"gorm.io/gorm"
)

var auditSensitiveKeys = map[string]bool{
	"password": true, "password_hash": true, "token": true,
	"access_token": true, "refresh_token": true, "token_issued_at": true,
}

type AuditEntry struct {
	UserID     *uint64
	Action     string
	EntityType string
	EntityID   *uint64
	Before     any
	After      any
	IP         string
}

// WriteAudit must receive the same *gorm.DB transaction as the change it records (BR13).
func WriteAudit(tx *gorm.DB, e AuditEntry) error {
	before, err := sanitizeAuditData(e.Before)
	if err != nil {
		return err
	}
	after, err := sanitizeAuditData(e.After)
	if err != nil {
		return err
	}
	return tx.Create(&models.AuditLog{
		UserID: e.UserID, Action: e.Action, EntityType: e.EntityType, EntityID: e.EntityID,
		Before: models.JSONB(before), After: models.JSONB(after), IP: e.IP,
	}).Error
}

func sanitizeAuditData(v any) (json.RawMessage, error) {
	if v == nil {
		return nil, nil
	}
	raw, err := json.Marshal(v)
	if err != nil || string(raw) == "null" {
		return nil, err
	}
	var fields map[string]any
	if json.Unmarshal(raw, &fields) != nil {
		return raw, nil
	}
	for k := range fields {
		if auditSensitiveKeys[k] {
			delete(fields, k)
		}
	}
	return json.Marshal(fields)
}
