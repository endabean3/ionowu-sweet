package httpapi

import (
	"crypto/ed25519"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
)

func NewRouter(pool *pgxpool.Pool, jwtPublicKey ed25519.PublicKey, jwtPrivateKey ed25519.PrivateKey, allowedOrigins []string, authPerMinute int) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)

	// TANPA ini, seluruh permintaan dari apps/web (browser) ditolak sebelum
	// menyentuh handler mana pun — web dan pos-engine selalu berbeda origin
	// (lihat config.go untuk alasan lengkap). AllowedHeaders menyertakan
	// Authorization karena access token dikirim lewat header itu (bukan
	// cookie, SECURITY.md §4B), sehingga AllowCredentials tidak diperlukan.
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// RUN-08 — liveness dan readiness WAJIB terpisah. Lihat health.go untuk
	// alasan pemisahannya.
	health := NewHealthHandler(pool)
	r.Get("/health/live", health.Live)
	r.Get("/health/ready", health.Ready)

	// Dipertahankan demi kompatibilitas: docker-compose dan skrip lama masih
	// menunjuk ke sini. Jalur baru adalah /health/live.
	r.Get("/healthz", health.Live)

	authHandler := NewAuthHandler(pool, jwtPrivateKey)

	// API-GUIDELINES §6 — 10/menit per IP untuk login & daftar (brute-force
	// kata sandi, spam tenant). /auth/refresh sengaja TIDAK dibatasi di sini:
	// seluruh kasir satu toko berbagi satu IP NAT, dan refresh yang ditolak
	// berarti kasir terlempar keluar saat jam ramai. Refresh butuh token yang
	// valid, jadi ia bukan jalur menebak kata sandi.
	authLimit := NewRateLimiter(authPerMinute)
	r.With(authLimit.Middleware).Post("/auth/register", authHandler.PostRegister)
	r.With(authLimit.Middleware).Post("/auth/login", authHandler.PostLogin)
	r.Post("/auth/refresh", authHandler.PostRefresh)
	r.Post("/auth/logout", authHandler.PostLogout)

	// Halaman nota publik (ADR-0013) — TANPA login, dibaca server web toko
	// dari QR di nota. Rate limit dan batasannya ada di handler.
	publicNota := NewPublicNotaHandler(pool)
	r.Get("/public/v1/nota/{tenantId}/{saleId}", publicNota.GetNota)
	r.Post("/public/v1/nota/{tenantId}/{saleId}/member", publicNota.PostMember)

	checkout := NewCheckoutHandler(pool)
	shift := NewShiftHandler(pool)

	r.Group(func(r chi.Router) {
		r.Use(TenantMiddleware(jwtPublicKey))

		syncHandler := NewSyncHandler(pool)
		r.Post("/sync/pull", syncHandler.PostSyncPull)
		r.Post("/sync/push", syncHandler.PostSyncPush)

		catalogHandler := NewCatalogHandler(pool)
		r.Get("/products", catalogHandler.GetProducts)
		r.Post("/products", catalogHandler.PostProduct)
		r.Patch("/products/{id}", catalogHandler.PatchProduct)
		r.Patch("/variants/{id}", catalogHandler.PatchVariant)

		catalogImportHandler := NewCatalogImportHandler(pool)
		r.Post("/products/import", catalogImportHandler.PostProductsImport)

		outletHandler := NewOutletHandler(pool)
		r.Get("/outlets", outletHandler.GetOutlets)
		r.Post("/outlets", outletHandler.PostOutlet)
		r.Patch("/outlets/{id}", outletHandler.PatchOutlet)

		stockHandler := NewStockHandler(pool)
		r.Get("/stock/levels", stockHandler.GetStockLevels)
		r.Get("/stock/events", stockHandler.GetStockEvents)
		r.Post("/stock/events", stockHandler.PostStockEvent)

		stockOpnameHandler := NewStockOpnameHandler(pool)
		r.Post("/stock/opname", stockOpnameHandler.PostStockOpname)

		analyticsHandler := NewAnalyticsHandler(pool)
		r.Get("/analytics/dashboard", analyticsHandler.GetDashboard)

		salesHistory := NewSalesHistoryHandler(pool)
		r.Get("/sales", salesHistory.GetSales)
		r.Get("/sales/{id}", salesHistory.GetSale)
		r.Post("/sales/{id}/void", salesHistory.PostVoid)

		r.Post("/sales", checkout.PostSale)
		r.Post("/sales/{id}/refund", func(w http.ResponseWriter, req *http.Request) {
			checkout.PostRefund(w, req, chi.URLParam(req, "id"))
		})

		r.Post("/shifts/open", shift.PostShiftOpen)
		r.Post("/shifts/{shiftId}/close", func(w http.ResponseWriter, req *http.Request) {
			shift.PostShiftClose(w, req, chi.URLParam(req, "shiftId"))
		})
		r.Post("/shifts/{shiftId}/cash-movement", func(w http.ResponseWriter, req *http.Request) {
			shift.PostCashMovement(w, req, chi.URLParam(req, "shiftId"))
		})
	})

	return r
}
