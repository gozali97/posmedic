package main

import (
	"log"
	"os"

	"pos-apotek-api/config"
	"pos-apotek-api/routes"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("[INFO] .env tidak ditemukan, memakai environment proses")
	}
	if os.Getenv("APP_ENV") == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	access, refresh := os.Getenv("JWT_SECRET"), os.Getenv("JWT_REFRESH_SECRET")
	if len(access) < 32 || len(refresh) < 32 || access == refresh {
		log.Fatal("[FATAL] JWT_SECRET dan JWT_REFRESH_SECRET wajib diisi, min. 32 karakter, dan berbeda")
	}

	if err := config.ConnectDatabase(); err != nil {
		log.Fatalf("[FATAL] %v", err)
	}

	port := os.Getenv("APP_PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("[INFO] server jalan di :%s", port)
	if err := routes.SetupRouter().Run(":" + port); err != nil {
		log.Fatalf("[FATAL] %v", err)
	}
}
