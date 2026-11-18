package config

import (
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"strconv"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var db *gorm.DB

func GetDB() *gorm.DB { return db }

// SetDB lets integration tests run every request inside one rolled-back transaction.
func SetDB(conn *gorm.DB) { db = conn }

// ConnectDatabase opens the PostgreSQL pool, applies the idempotent schema and seeds the admin user.
func ConnectDatabase() error {
	q := url.Values{}
	q.Set("sslmode", envOr("DB_SSLMODE", "disable"))
	q.Set("TimeZone", "Asia/Jakarta")
	dsn := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD")),
		Host:     envOr("DB_HOST", "localhost") + ":" + envOr("DB_PORT", "5432"),
		Path:     "/" + os.Getenv("DB_NAME"),
		RawQuery: q.Encode(),
	}

	logLevel := logger.Info
	if os.Getenv("APP_ENV") == "production" {
		logLevel = logger.Warn
	}

	conn, err := gorm.Open(postgres.Open(dsn.String()), &gorm.Config{Logger: logger.Default.LogMode(logLevel)})
	if err != nil {
		return fmt.Errorf("koneksi database gagal: %w", err)
	}
	sqlDB, err := conn.DB()
	if err != nil {
		return err
	}
	sqlDB.SetMaxOpenConns(envInt("DB_MAX_OPEN_CONNS", 20))
	sqlDB.SetMaxIdleConns(envInt("DB_MAX_IDLE_CONNS", 5))
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
	db = conn

	if err := applySchema(conn); err != nil {
		return err
	}
	return seedAdmin(conn)
}

func applySchema(conn *gorm.DB) error {
	for i, stmt := range schemaStatements {
		if err := conn.Exec(stmt).Error; err != nil {
			return fmt.Errorf("schema statement %d gagal: %w", i+1, err)
		}
	}

	// pg_trgm needs CREATE privilege on the database; without it search falls back to plain ILIKE scans.
	if err := conn.Exec("CREATE EXTENSION IF NOT EXISTS pg_trgm").Error; err != nil {
		log.Printf("[WARN] pg_trgm tidak tersedia, index trigram dilewati: %v", err)
		return nil
	}
	for _, stmt := range trigramStatements {
		if err := conn.Exec(stmt).Error; err != nil {
			return fmt.Errorf("index trigram gagal: %w", err)
		}
	}
	return nil
}

// DefaultAdminPassword is the first admin's password when ADMIN_DEFAULT_PASSWORD is empty.
// The admin is created with must_change_password, so it only works until the first login.
const DefaultAdminPassword = "password789"

func seedAdmin(conn *gorm.DB) error {
	var count int64
	if err := conn.Table("users").Where("id = 1").Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	password := os.Getenv("ADMIN_DEFAULT_PASSWORD")
	if password == "" {
		password = DefaultAdminPassword
		log.Printf("[WARN] ADMIN_DEFAULT_PASSWORD kosong: user admin dibuat dengan password default %q (wajib diganti saat login pertama)", DefaultAdminPassword)
	}
	if len(password) < 8 {
		return errors.New("ADMIN_DEFAULT_PASSWORD minimal 8 karakter")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	return conn.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec(`INSERT INTO users (id, username, fullname, password_hash,
			perm_products, perm_purchases, perm_categories, perm_transactions, perm_users, perm_settings,
			is_active, must_change_password)
			VALUES (1, 'admin', 'Administrator', ?, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
			ON CONFLICT (id) DO NOTHING`, string(hash)).Error; err != nil {
			return err
		}
		// id 1 was inserted explicitly, so move the sequence past it.
		return tx.Exec(`SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT MAX(id) FROM users), 1))`).Error
	})
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if n, err := strconv.Atoi(os.Getenv(key)); err == nil && n > 0 {
		return n
	}
	return fallback
}
