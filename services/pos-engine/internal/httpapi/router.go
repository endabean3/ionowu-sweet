package httpapi

import (
	"crypto/ed25519"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

func NewRouter(pool *pgxpool.Pool, jwtPublicKey ed25519.PublicKey, jwtPrivateKey ed25519.PrivateKey) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	authHandler := NewAuthHandler(pool, jwtPrivateKey)
	r.Post("/auth/register", authHandler.PostRegister)
	r.Post("/auth/login", authHandler.PostLogin)
	r.Post("/auth/refresh", authHandler.PostRefresh)
	r.Post("/auth/logout", authHandler.PostLogout)

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
		r.Post("/stock/events", stockHandler.PostStockEvent)
		
		stockOpnameHandler := NewStockOpnameHandler(pool)
		r.Post("/stock/opname", stockOpnameHandler.PostStockOpname)

		analyticsHandler := NewAnalyticsHandler(pool)
		r.Get("/analytics/dashboard", analyticsHandler.GetDashboard)

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
