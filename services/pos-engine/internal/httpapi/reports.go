package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

type ReportHandler struct {
	pool    *pgxpool.Pool
	queries *store.Queries
}

func NewReportHandler(pool *pgxpool.Pool) *ReportHandler {
	return &ReportHandler{pool: pool, queries: store.New(pool)}
}

// bolehLihatOmzet: RBAC-MODEL §"Laporan & BI" — "Omzet outletnya" adalah ✅
// untuk owner dan manager, ❌ untuk kasir, gudang, dan sales.
//
// Kasir sengaja TIDAK termasuk meski ia yang menutup toko: angka yang ia
// butuhkan saat tutup shift (kas diharapkan vs kas dihitung) sudah diberikan
// POST /shifts/{id}/close. Omzet, diskon, dan barang terlaris adalah
// informasi usaha, bukan alat kerja kasir.
func bolehLihatOmzet(role string) string {
	switch role {
	case "owner", "manager":
		return ""
	default:
		return "Hanya owner atau manager yang boleh melihat laporan penjualan"
	}
}

// jumlahTerlarisLaporan — sepuluh cukup untuk selembar nota 58 mm tanpa
// membuat kasir menunggu printer.
const jumlahTerlarisLaporan = 10

// GetDailyReport menangani GET /reports/daily — laporan penjualan harian
// (tutup buku / Z-Report) untuk satu outlet.
//
// Angka utamanya MENGECUALIKAN transaksi is_late_arrival, yang dilaporkan di
// embernya sendiri. Itulah yang membuat laporan yang sudah dicetak tidak
// pernah berubah (invarian §6 #5): transaksi offline yang baru tiba hari ini
// tidak boleh menggeser total kemarin yang sudah ditandatangani kasir.
func (h *ReportHandler) GetDailyReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := TenantID(ctx)
	qp := r.URL.Query()

	if msg := bolehLihatOmzet(UserRole(ctx)); msg != "" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", msg)
		return
	}

	outletID := strings.TrimSpace(qp.Get("outlet_id"))
	if !ulidPola.MatchString(outletID) {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "outlet_id wajib diisi")
		return
	}
	mulai, akhir, msg := rentangRiwayat(qp.Get("dari"), qp.Get("sampai"), time.Now())
	if msg != "" {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", msg)
		return
	}

	milik, err := h.queries.OutletBelongsToTenant(ctx, store.OutletBelongsToTenantParams{
		TenantID: tenantID, ID: outletID,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memeriksa outlet")
		return
	}
	if !milik {
		RespondError(w, http.StatusNotFound, "OUTLET_NOT_FOUND", "Outlet tidak ditemukan")
		return
	}

	dari, sampai := toTimestamptz(mulai), toTimestamptz(akhir)

	ringkasan, err := h.queries.GetSalesReportSummary(ctx, store.GetSalesReportSummaryParams{
		TenantID: tenantID, OutletID: outletID, Dari: dari, Sampai: sampai,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat ringkasan penjualan")
		return
	}
	baris, err := h.queries.CountReportItems(ctx, store.CountReportItemsParams{
		TenantID: tenantID, OutletID: outletID, Dari: dari, Sampai: sampai,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menghitung baris barang")
		return
	}
	refund, err := h.queries.SumRefundsForReport(ctx, store.SumRefundsForReportParams{
		TenantID: tenantID, OutletID: outletID, Dari: dari, Sampai: sampai,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat refund")
		return
	}
	kas, err := h.queries.SumCashMovementsForReport(ctx, store.SumCashMovementsForReportParams{
		TenantID: tenantID, OutletID: outletID, Dari: dari, Sampai: sampai,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat kas masuk/keluar")
		return
	}
	bayar, err := h.queries.SumPaymentsByMethodForReport(ctx, store.SumPaymentsByMethodForReportParams{
		TenantID: tenantID, OutletID: outletID, Dari: dari, Sampai: sampai,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat metode bayar")
		return
	}
	telat, err := h.queries.GetLateArrivalBucket(ctx, store.GetLateArrivalBucketParams{
		TenantID: tenantID, OutletID: outletID, Dari: dari, Sampai: sampai,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat transaksi terlambat")
		return
	}
	shifts, err := h.queries.ListShiftsForReport(ctx, store.ListShiftsForReportParams{
		TenantID: tenantID, OutletID: outletID, Dari: dari, Sampai: sampai,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat shift")
		return
	}
	terlaris, err := h.queries.ListTopProductsForReport(ctx, store.ListTopProductsForReportParams{
		TenantID: tenantID, OutletID: outletID, Dari: dari, Sampai: sampai,
		Batas: jumlahTerlarisLaporan,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat barang terlaris")
		return
	}

	// Tunai dipisah dari metode lain karena hanya tunai yang bisa dicocokkan
	// dengan isi laci; QRIS/transfer dicocokkan dengan mutasi rekening.
	tunai := tunaiDariMetode(bayar)

	RespondJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"periode": map[string]any{
			"dari":   mulai.Format(time.RFC3339),
			"sampai": akhir.Format(time.RFC3339),
		},
		"ringkasan": map[string]any{
			"transaksi":        ringkasan.PaidCount,
			"baris_barang":     baris,
			"penjualan_kotor":  ringkasan.GrossSales,
			"diskon":           ringkasan.DiscountTotal,
			"pajak":            ringkasan.TaxTotal,
			"penjualan_bersih": ringkasan.NetSales,
			"void_jumlah":      ringkasan.VoidCount,
			"void_nilai":       ringkasan.VoidTotal,
			"refund_jumlah":    refund.RefundCount,
			"refund_nilai":     refund.RefundTotal,
		},
		"kas": map[string]any{
			"tunai":      tunai,
			"kas_masuk":  kas.CashIn,
			"kas_keluar": kas.CashOut,
		},
		"pembayaran": bayar,
		"terlambat": map[string]any{
			"jumlah": telat.LateCount,
			"nilai":  telat.LateTotal,
		},
		"shift":    shifts,
		"terlaris": terlaris,
	}})
}

// tunaiDariMetode mengambil total metode 'cash' dari rincian pembayaran.
// Nol bila hari itu tidak ada penjualan tunai sama sekali.
func tunaiDariMetode(rows []store.SumPaymentsByMethodForReportRow) decimal.Decimal {
	for _, r := range rows {
		if r.PaymentMethod == "cash" {
			return r.Total
		}
	}
	return decimal.Zero
}
