package routes

import (
	"bytes"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"pos-apotek-api/config"
	"pos-apotek-api/services"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type apiResp struct {
	Code int            `json:"code"`
	Data map[string]any `json:"data"`
}

// Runs against the real database from ../.env; every change is rolled back at the end.
func setup(t *testing.T) (*gorm.DB, func(method, path, token string, body any) apiResp) {
	t.Helper()
	_ = godotenv.Load("../.env")
	if os.Getenv("DB_NAME") == "" {
		t.Skip("DB_NAME kosong, tes integrasi dilewati")
	}
	gin.SetMode(gin.TestMode)
	if err := config.ConnectDatabase(); err != nil {
		t.Skipf("database tidak tersedia: %v", err)
	}
	tx := config.GetDB().Begin()
	t.Cleanup(func() { tx.Rollback() })
	config.SetDB(tx)
	r := SetupRouter()

	return tx, func(method, path, token string, body any) apiResp {
		t.Helper()
		var req *http.Request
		if mp, ok := body.(*multipartBody); ok {
			req = httptest.NewRequest(method, path, &mp.buf)
			req.Header.Set("Content-Type", mp.contentType)
		} else {
			raw, _ := json.Marshal(body)
			req = httptest.NewRequest(method, path, bytes.NewReader(raw))
			req.Header.Set("Content-Type", "application/json")
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		var out apiResp
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		if out.Code != rec.Code {
			t.Fatalf("%s %s: envelope code %d != HTTP %d: %s", method, path, out.Code, rec.Code, rec.Body)
		}
		return out
	}
}

type multipartBody struct {
	buf         bytes.Buffer
	contentType string
}

func newMultipart(fields map[string]string, fileName string, file []byte) *multipartBody {
	mp := &multipartBody{}
	w := multipart.NewWriter(&mp.buf)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	if fileName != "" {
		fw, _ := w.CreateFormFile("logo", fileName)
		_, _ = fw.Write(file)
	}
	_ = w.Close()
	mp.contentType = w.FormDataContentType()
	return mp
}

func createUser(t *testing.T, tx *gorm.DB, username, password string, permUsersSettings bool) {
	t.Helper()
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	err := tx.Exec(`INSERT INTO users (username, fullname, password_hash, perm_users, perm_settings) VALUES (?, ?, ?, ?, ?)`,
		username, username, string(hash), permUsersSettings, permUsersSettings).Error
	if err != nil {
		t.Fatal(err)
	}
}

func login(t *testing.T, do func(string, string, string, any) apiResp, username, password string) (access, refresh string) {
	t.Helper()
	res := do("POST", "/api/auth/login", "", map[string]string{"username": username, "password": password})
	if res.Code != 200 {
		t.Fatalf("login %s: got %d", username, res.Code)
	}
	return res.Data["access_token"].(string), res.Data["refresh_token"].(string)
}

func expect(t *testing.T, name string, got apiResp, want int) {
	t.Helper()
	if got.Code != want {
		t.Errorf("%s: got %d, want %d", name, got.Code, want)
	}
}

func TestAuthFlow(t *testing.T) {
	tx, do := setup(t)
	createUser(t, tx, "zz_kasir", "rahasia123", false)

	expect(t, "wrong password", do("POST", "/api/auth/login", "", map[string]string{"username": "zz_kasir", "password": "salah12345"}), 401)
	expect(t, "unknown user", do("POST", "/api/auth/login", "", map[string]string{"username": "zz_tidakada", "password": "salah12345"}), 401)
	expect(t, "no token", do("GET", "/api/auth/me", "", nil), 401)

	tokenA, _ := login(t, do, "ZZ_Kasir ", "rahasia123")
	expect(t, "me", do("GET", "/api/auth/me", tokenA, nil), 200)
	expect(t, "no perm_users", do("GET", "/api/users", tokenA, nil), 403)
	expect(t, "no perm_settings", do("PUT", "/api/tills/1", tokenA, map[string]any{"number": 1, "name": "x"}), 403)

	tokenB, refreshB := login(t, do, "zz_kasir", "rahasia123")
	expect(t, "old session after re-login", do("GET", "/api/auth/me", tokenA, nil), 401)
	expect(t, "new session", do("GET", "/api/auth/me", tokenB, nil), 200)

	ref := do("POST", "/api/auth/refresh-token", "", map[string]string{"refresh_token": refreshB})
	expect(t, "refresh", ref, 200)
	expect(t, "access token as refresh", do("POST", "/api/auth/refresh-token", "", map[string]string{"refresh_token": tokenB}), 401)

	expect(t, "change password wrong old", do("PUT", "/api/auth/password", tokenB, map[string]string{"old_password": "salah12345", "new_password": "barubaru123"}), 422)
	expect(t, "change password too short", do("PUT", "/api/auth/password", tokenB, map[string]string{"old_password": "rahasia123", "new_password": "pendek"}), 422)
	expect(t, "change password", do("PUT", "/api/auth/password", tokenB, map[string]string{"old_password": "rahasia123", "new_password": "barubaru123"}), 200)
	expect(t, "old password login", do("POST", "/api/auth/login", "", map[string]string{"username": "zz_kasir", "password": "rahasia123"}), 401)

	tokenC, _ := login(t, do, "zz_kasir", "barubaru123")
	prof := do("PUT", "/api/auth/profile", tokenC, map[string]string{"fullname": "Kasir Uji"})
	expect(t, "profile", prof, 200)
	if prof.Data["fullname"] != "Kasir Uji" {
		t.Errorf("profile fullname not updated: %v", prof.Data["fullname"])
	}
	expect(t, "logout", do("POST", "/api/auth/logout", tokenC, nil), 200)
	expect(t, "token after logout", do("GET", "/api/auth/me", tokenC, nil), 401)

	var actions []string
	tx.Raw(`SELECT DISTINCT a.action FROM audit_logs a JOIN users u ON u.id = a.entity_id WHERE a.entity_type = 'user' AND u.username = 'zz_kasir' ORDER BY 1`).Scan(&actions)
	if got := strings.Join(actions, ","); got != "change_password,login,login_failed,logout,update_profile" {
		t.Errorf("audit actions: %s", got)
	}
}

func TestAuthDatabaseFailure(t *testing.T) {
	tx, do := setup(t)
	createUser(t, tx, "zz_db_failure", "rahasia123", false)
	access, refresh := login(t, do, "zz_db_failure", "rahasia123")
	callback := "test:auth_database_failure"
	if err := tx.Callback().Query().Before("gorm:query").Register(callback, func(db *gorm.DB) {
		if db.Statement.Table == "users" {
			db.AddError(errors.New("database unavailable"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { tx.Callback().Query().Remove(callback) })
	expect(t, "session database failure", do("GET", "/api/auth/me", access, nil), 500)
	expect(t, "refresh database failure", do("POST", "/api/auth/refresh-token", "", map[string]string{"refresh_token": refresh}), 500)
}

func TestMustChangePasswordBlocks(t *testing.T) {
	tx, do := setup(t)
	createUser(t, tx, "zz_baru", "rahasia123", true)
	tx.Exec("UPDATE users SET must_change_password = TRUE WHERE username = 'zz_baru'")
	token, _ := login(t, do, "zz_baru", "rahasia123")
	expect(t, "blocked route", do("GET", "/api/users", token, nil), 403)
	expect(t, "whitelisted route", do("GET", "/api/auth/me", token, nil), 200)
}

func TestUsersSettingsTillsAudit(t *testing.T) {
	tx, do := setup(t)
	createUser(t, tx, "zz_boss", "rahasia123", true)
	token, _ := login(t, do, "zz_boss", "rahasia123")
	var bossID int64
	tx.Raw("SELECT id FROM users WHERE username = 'zz_boss'").Scan(&bossID)

	created := do("POST", "/api/users", token, map[string]any{"username": "zz_staf", "fullname": "Staf", "password": "rahasia123", "perm_products": true})
	expect(t, "create user", created, 201)
	if _, leaked := created.Data["password_hash"]; leaked {
		t.Error("response leaks password_hash")
	}
	if created.Data["must_change_password"] != true {
		t.Error("new user must change password")
	}
	expect(t, "duplicate username", do("POST", "/api/users", token, map[string]any{"username": "ZZ_STAF", "fullname": "x", "password": "rahasia123"}), 409)
	id := int(created.Data["id"].(float64))
	path := "/api/users/" + strconv.Itoa(id)

	var hashBefore, hashAfter string
	tx.Raw("SELECT password_hash FROM users WHERE id = ?", id).Scan(&hashBefore)
	expect(t, "update empty password", do("PUT", path, token, map[string]any{"password": "", "fullname": "Staf Dua"}), 200)
	tx.Raw("SELECT password_hash FROM users WHERE id = ?", id).Scan(&hashAfter)
	if hashBefore != hashAfter {
		t.Error("empty password changed the hash")
	}
	expect(t, "detail", do("GET", path, token, nil), 200)
	expect(t, "list", do("GET", "/api/users?search=zz_&per_page=5", token, nil), 200)
	expect(t, "revoke admin perm", do("PUT", "/api/users/1", token, map[string]any{"perm_users": false}), 403)
	expect(t, "delete admin", do("DELETE", "/api/users/1", token, nil), 403)
	expect(t, "delete user", do("DELETE", path, token, nil), 200)
	expect(t, "deleted user gone", do("GET", path, token, nil), 404)

	settings := map[string]string{
		"store_name": "Apotek Uji", "address_one": "Jl. Uji 1", "contact": "0800", "sia_number": "SIA-1",
		"pharmacist_name": "apt. Uji", "sipa_number": "SIPA-1", "currency_symbol": "Rp", "expiry_warning_days": "90",
	}
	expect(t, "logo not an image", do("PUT", "/api/settings", token, newMultipart(settings, "logo.png", []byte("bukan gambar"))), 422)
	saved := do("PUT", "/api/settings", token, newMultipart(settings, "", nil))
	expect(t, "save settings", saved, 200)
	if saved.Data["store_name"] != "Apotek Uji" {
		t.Errorf("settings not saved: %v", saved.Data)
	}
	expect(t, "get settings", do("GET", "/api/settings", token, nil), 200)

	till := do("POST", "/api/tills", token, map[string]any{"number": 9901, "name": "Kasir Uji"})
	expect(t, "create till", till, 201)
	expect(t, "duplicate till", do("POST", "/api/tills", token, map[string]any{"number": 9901, "name": "Lagi"}), 409)
	tillPath := "/api/tills/" + strconv.Itoa(int(till.Data["id"].(float64)))
	expect(t, "update till", do("PUT", tillPath, token, map[string]any{"number": 9902, "name": "Kasir Uji 2"}), 200)
	expect(t, "list tills", do("GET", "/api/tills", token, nil), 200)
	expect(t, "delete till", do("DELETE", tillPath, token, nil), 200)

	logs := do("GET", "/api/audit-logs?user_id="+strconv.Itoa(int(bossID))+"&per_page=100", token, nil)
	expect(t, "audit logs", logs, 200)
	// login, create user, update user, delete user, settings, till create/update/delete
	if total := logs.Data["pagination"].(map[string]any)["total"].(float64); total != 8 {
		t.Errorf("audit rows for actor: got %v, want 8", total)
	}
	expect(t, "audit bad date", do("GET", "/api/audit-logs?start_date=18-11-2026", token, nil), 422)
}

func TestAuditRollsBackWithChange(t *testing.T) {
	tx, _ := setup(t)
	var before, after int64
	tx.Table("audit_logs").Count(&before)
	_ = tx.Transaction(func(inner *gorm.DB) error {
		if err := services.WriteAudit(inner, services.AuditEntry{Action: "test", EntityType: "test"}); err != nil {
			return err
		}
		return errors.New("batal")
	})
	tx.Table("audit_logs").Count(&after)
	if before != after {
		t.Fatalf("audit survived rollback: %d -> %d", before, after)
	}
}
