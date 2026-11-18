package routes

import (
	"net/http"
	"os"
	"strings"
	"time"

	"pos-apotek-api/config"
	"pos-apotek-api/controllers"
	_ "pos-apotek-api/docs" // registers swagger spec
	"pos-apotek-api/dto"
	"pos-apotek-api/middleware"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

// @title POS Apotek API
// @version 1.0
// @description API POS apotek. Semua respons memakai envelope {status, code, message, data}.
// @BasePath /api
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Isi dengan "Bearer <access_token>"
func SetupRouter() *gin.Engine {
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery(), middleware.CORS())
	var proxies []string
	if v := strings.TrimSpace(os.Getenv("TRUSTED_PROXIES")); v != "" {
		proxies = strings.Split(v, ",")
	}
	_ = r.SetTrustedProxies(proxies)

	// Only uploads are public; storage/logs must never be served.
	r.Static("/storage/uploads", "./storage/uploads")

	if os.Getenv("APP_ENV") != "production" {
		// GET /swagger/index.html
		r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	api := r.Group("/api")
	authCtl := controllers.NewAuthController()
	userCtl := controllers.NewUserController()
	settingCtl := controllers.NewSettingController()
	masterCtl := controllers.NewMasterController()
	productCtl := controllers.NewProductController()
	stockCtl := controllers.NewStockController()
	salesCtl := controllers.NewSalesController()

	// ==================================================================
	// SISTEM
	// ==================================================================

	// GET /api/health
	api.GET("/health", func(ctx *gin.Context) {
		sqlDB, err := config.GetDB().DB()
		if err == nil {
			err = sqlDB.PingContext(ctx.Request.Context())
		}
		if err != nil {
			ctx.JSON(http.StatusServiceUnavailable, dto.Response{Status: "failed", Code: http.StatusServiceUnavailable, Message: "Database tidak terhubung"})
			return
		}
		ctx.JSON(http.StatusOK, dto.Response{Status: "success", Code: http.StatusOK, Message: "OK"})
	})

	// ==================================================================
	// AUTH (publik)
	// ==================================================================

	// POST /api/auth/login
	api.POST("/auth/login", middleware.RateLimit(10, time.Minute), authCtl.Login)
	// POST /api/auth/refresh-token
	api.POST("/auth/refresh-token", middleware.RateLimit(30, time.Minute), authCtl.RefreshToken)

	protected := api.Group("", middleware.AuthMiddleware())

	// ==================================================================
	// AUTH (login)
	// ==================================================================

	// GET /api/auth/me
	protected.GET("/auth/me", authCtl.Me)
	// POST /api/auth/logout
	protected.POST("/auth/logout", authCtl.Logout)
	// PUT /api/auth/password
	protected.PUT("/auth/password", authCtl.ChangePassword)
	// PUT /api/auth/profile
	protected.PUT("/auth/profile", authCtl.UpdateProfile)

	// ==================================================================
	// USER (perm_users)
	// ==================================================================

	users := protected.Group("/users", middleware.RequirePerm("perm_users"))
	// GET /api/users
	users.GET("", userCtl.Index)
	// POST /api/users
	users.POST("", userCtl.Store)
	// GET /api/users/:id
	users.GET("/:id", userCtl.Detail)
	// PUT /api/users/:id
	users.PUT("/:id", userCtl.Update)
	// DELETE /api/users/:id
	users.DELETE("/:id", userCtl.Delete)

	// ==================================================================
	// PENGATURAN & TILL
	// ==================================================================

	settingsPerm := middleware.RequirePerm("perm_settings")
	// GET /api/settings
	protected.GET("/settings", settingCtl.Show)
	// PUT /api/settings
	protected.PUT("/settings", settingsPerm, settingCtl.Update)
	// GET /api/tills
	protected.GET("/tills", settingCtl.TillIndex)
	// POST /api/tills
	protected.POST("/tills", settingsPerm, settingCtl.TillStore)
	// PUT /api/tills/:id
	protected.PUT("/tills/:id", settingsPerm, settingCtl.TillUpdate)
	// DELETE /api/tills/:id
	protected.DELETE("/tills/:id", settingsPerm, settingCtl.TillDelete)

	// ==================================================================
	// AUDIT LOG (perm_settings)
	// ==================================================================

	// GET /api/audit-logs
	protected.GET("/audit-logs", settingsPerm, settingCtl.AuditLogIndex)

	productsPerm := middleware.RequirePerm("perm_products")
	purchasesPerm := middleware.RequirePerm("perm_purchases")
	categoriesPerm := middleware.RequirePerm("perm_categories")
	transactionsPerm := middleware.RequirePerm("perm_transactions")

	// ==================================================================
	// KATEGORI (baca: login; ubah: perm_categories)
	// ==================================================================

	// GET /api/categories
	protected.GET("/categories", masterCtl.CategoryIndex)
	// POST /api/categories
	protected.POST("/categories", categoriesPerm, masterCtl.CategoryStore)
	// PUT /api/categories/:id
	protected.PUT("/categories/:id", categoriesPerm, masterCtl.CategoryUpdate)
	// DELETE /api/categories/:id
	protected.DELETE("/categories/:id", categoriesPerm, masterCtl.CategoryDelete)

	// ==================================================================
	// PRODUK (baca: login; ubah & stok: perm_products)
	// ==================================================================

	// GET /api/products
	protected.GET("/products", productCtl.Index)
	// GET /api/products/barcode/:code
	protected.GET("/products/barcode/:code", productCtl.Barcode)
	// GET /api/products/export
	protected.GET("/products/export", productsPerm, productCtl.Export)
	// GET /api/products/:id
	protected.GET("/products/:id", productCtl.Detail)
	// POST /api/products
	protected.POST("/products", productsPerm, productCtl.Store)
	// PUT /api/products/:id
	protected.PUT("/products/:id", productsPerm, productCtl.Update)
	// DELETE /api/products/:id
	protected.DELETE("/products/:id", productsPerm, productCtl.Delete)
	// GET /api/products/:id/stock-movements
	protected.GET("/products/:id/stock-movements", productsPerm, productCtl.StockMovements)

	// ==================================================================
	// BATCH & STOK OPNAME (perm_products)
	// ==================================================================

	batches := protected.Group("/batches", productsPerm)
	// GET /api/batches
	batches.GET("", stockCtl.BatchIndex)
	// GET /api/batches/export
	batches.GET("/export", stockCtl.BatchExport)
	// POST /api/batches/:id/adjustment
	batches.POST("/:id/adjustment", stockCtl.Adjust)

	opnames := protected.Group("/stock-opnames", productsPerm)
	// GET /api/stock-opnames
	opnames.GET("", stockCtl.OpnameIndex)
	// POST /api/stock-opnames
	opnames.POST("", stockCtl.OpnameStore)
	// GET /api/stock-opnames/:id
	opnames.GET("/:id", stockCtl.OpnameDetail)
	// PUT /api/stock-opnames/:id/items
	opnames.PUT("/:id/items", stockCtl.OpnameSaveItems)
	// POST /api/stock-opnames/:id/post
	opnames.POST("/:id/post", stockCtl.OpnamePost)
	// DELETE /api/stock-opnames/:id
	opnames.DELETE("/:id", stockCtl.OpnameDelete)

	// ==================================================================
	// PELANGGAN (login)
	// ==================================================================

	// GET /api/customers
	protected.GET("/customers", masterCtl.CustomerIndex)
	// POST /api/customers
	protected.POST("/customers", masterCtl.CustomerStore)
	// GET /api/customers/:id
	protected.GET("/customers/:id", masterCtl.CustomerDetail)
	// PUT /api/customers/:id
	protected.PUT("/customers/:id", masterCtl.CustomerUpdate)
	// DELETE /api/customers/:id
	protected.DELETE("/customers/:id", masterCtl.CustomerDelete)

	// ==================================================================
	// SUPPLIER, PENERIMAAN & HUTANG (perm_purchases)
	// ==================================================================

	suppliers := protected.Group("/suppliers", purchasesPerm)
	// GET /api/suppliers
	suppliers.GET("", masterCtl.SupplierIndex)
	// POST /api/suppliers
	suppliers.POST("", masterCtl.SupplierStore)
	// GET /api/suppliers/:id
	suppliers.GET("/:id", masterCtl.SupplierDetail)
	// PUT /api/suppliers/:id
	suppliers.PUT("/:id", masterCtl.SupplierUpdate)
	// DELETE /api/suppliers/:id
	suppliers.DELETE("/:id", masterCtl.SupplierDelete)

	purchases := protected.Group("/purchases", purchasesPerm)
	// GET /api/purchases
	purchases.GET("", stockCtl.PurchaseIndex)
	// GET /api/purchases/payables
	purchases.GET("/payables", stockCtl.Payables)
	// POST /api/purchases
	purchases.POST("", stockCtl.PurchaseStore)
	// GET /api/purchases/:id
	purchases.GET("/:id", stockCtl.PurchaseDetail)
	// POST /api/purchases/:id/mark-paid
	purchases.POST("/:id/mark-paid", stockCtl.MarkPaid)

	// ==================================================================
	// SHIFT (login)
	// ==================================================================

	// GET /api/shifts/current
	protected.GET("/shifts/current", salesCtl.ShiftCurrent)
	// POST /api/shifts/open
	protected.POST("/shifts/open", salesCtl.ShiftOpen)
	// GET /api/shifts
	protected.GET("/shifts", salesCtl.ShiftIndex)
	// GET /api/shifts/:id
	protected.GET("/shifts/:id", salesCtl.ShiftDetail)
	// POST /api/shifts/:id/close
	protected.POST("/shifts/:id/close", salesCtl.ShiftClose)

	// ==================================================================
	// TRANSAKSI (POS: login; laporan, void, retur: perm_transactions)
	// ==================================================================

	// POST /api/transactions
	protected.POST("/transactions", salesCtl.TransactionStore)
	// GET /api/transactions/held
	protected.GET("/transactions/held", salesCtl.HeldIndex)
	// GET /api/transactions/summary
	protected.GET("/transactions/summary", transactionsPerm, salesCtl.Summary)
	// GET /api/transactions/export
	protected.GET("/transactions/export", transactionsPerm, salesCtl.TransactionExport)
	// GET /api/transactions
	protected.GET("/transactions", transactionsPerm, salesCtl.TransactionIndex)
	// GET /api/transactions/:id
	protected.GET("/transactions/:id", salesCtl.TransactionDetail)
	// PUT /api/transactions/:id
	protected.PUT("/transactions/:id", salesCtl.HeldUpdate)
	// POST /api/transactions/:id/pay
	protected.POST("/transactions/:id/pay", salesCtl.HeldPay)
	// DELETE /api/transactions/:id
	protected.DELETE("/transactions/:id", salesCtl.HeldDelete)
	// POST /api/transactions/:id/void
	protected.POST("/transactions/:id/void", transactionsPerm, salesCtl.Void)
	// POST /api/transactions/:id/returns
	protected.POST("/transactions/:id/returns", transactionsPerm, salesCtl.Return)

	// GET /api/sales-returns
	protected.GET("/sales-returns", transactionsPerm, salesCtl.ReturnIndex)
	// GET /api/sales-returns/:id
	protected.GET("/sales-returns/:id", salesCtl.ReturnDetail)

	// ==================================================================
	// PERINGATAN (login)
	// ==================================================================

	// GET /api/alerts
	protected.GET("/alerts", salesCtl.Alerts)

	r.NoRoute(func(ctx *gin.Context) {
		ctx.JSON(http.StatusNotFound, dto.Response{Status: "failed", Code: http.StatusNotFound, Message: "Endpoint tidak ditemukan"})
	})

	return r
}
