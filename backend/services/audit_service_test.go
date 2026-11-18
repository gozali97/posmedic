package services

import (
	"encoding/json"
	"testing"
)

func TestSanitizeAuditData(t *testing.T) {
	raw, err := sanitizeAuditData(map[string]any{"username": "kasir", "password": "x", "password_hash": "y", "refresh_token": "z"})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	_ = json.Unmarshal(raw, &got)
	if len(got) != 1 || got["username"] != "kasir" {
		t.Fatalf("sensitive keys not removed: %s", raw)
	}

	var nilPtr *struct{}
	for _, v := range []any{nil, nilPtr} {
		if raw, _ := sanitizeAuditData(v); raw != nil {
			t.Fatalf("nil input must store NULL, got %s", raw)
		}
	}
}
