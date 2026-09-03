package httpapi

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// HealthHandler menyediakan dua endpoint terpisah sesuai RUN-08
// (fondasi-server-ionowu §2.3).
//
// Pemisahannya bukan kosmetik — keduanya menjawab pertanyaan yang berbeda dan
// memicu tindakan orkestrator yang berbeda:
//
//	/health/live   Apakah proses ini masih waras? Gagal ⇒ kontainer di-RESTART.
//	/health/ready  Apakah ia siap menerima trafik? Gagal ⇒ kontainer DIKELUARKAN
//	               dari rotasi load balancer, tetapi TIDAK di-restart.
//
// Menyatukan keduanya membuat gangguan database sesaat berubah menjadi restart
// loop: liveness ikut gagal, kontainer dibunuh, kontainer baru juga tidak bisa
// menjangkau database, dan seterusnya — memperparah insiden alih-alih
// menunggunya lewat.
//
// RUN-07 menuntut probe "benar-benar menguji kesiapan layanan, bukan sekadar
// mengembalikan 200 OK statis". Karena itu /health/ready men-ping database
// sungguhan; /health/live sengaja TIDAK, sebab hidupnya proses tidak
// bergantung pada database.
type HealthHandler struct {
	pool *pgxpool.Pool
}

func NewHealthHandler(pool *pgxpool.Pool) *HealthHandler {
	return &HealthHandler{pool: pool}
}

// Live menjawab apakah proses hidup. Sengaja tanpa dependensi eksternal.
func (h *HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	RespondJSON(w, http.StatusOK, map[string]string{"status": "live"})
}

// Ready menjawab apakah dependensi siap. Timeout pendek disengaja: probe yang
// menggantung sama buruknya dengan probe yang gagal, karena orkestrator
// menunggu tanpa kepastian.
func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := h.pool.Ping(ctx); err != nil {
		// DATABASE_UNAVAILABLE kelas RETRY (ERROR-CATALOG §E) — klien tetap
		// offline dan antreannya menunggu, kasir tidak berhenti berjualan.
		RespondError(w, http.StatusServiceUnavailable, "DATABASE_UNAVAILABLE",
			"Basis data belum siap")
		return
	}
	RespondJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}
