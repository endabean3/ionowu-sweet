package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

// Riwayat transaksi: mencari nota lama (klaim garansi, refund, void) dan
// membatalkan transaksi yang salah input.
//
// Refund ada di checkout.go — pengembalian uang untuk barang yang benar-benar
// keluar. VOID di sini berbeda: transaksinya dianggap tidak pernah terjadi
// (salah input, salah pilih barang), jadi ia hanya boleh selama shift-nya
// masih terbuka. Setelah shift ditutup, Z-Report sudah dicetak dan tidak
// pernah berubah (CLAUDE.md §6 #5) — koreksinya lewat refund.

type SalesHistoryHandler struct {
	pool *pgxpool.Pool
	q    *store.Queries
}

func NewSalesHistoryHandler(pool *pgxpool.Pool) *SalesHistoryHandler {
	return &SalesHistoryHandler{pool: pool, q: store.New(pool)}
}

const (
	batasRiwayatBawaan = 50
	batasRiwayatMaks   = 200
	hariRiwayatBawaan  = 30
)

// rentangRiwayat membaca ?dari= & ?sampai= (YYYY-MM-DD, zona waktu outlet
// diabaikan demi kesederhanaan: rentangnya inklusif satu hari penuh UTC+7).
// Fungsi murni supaya bisa diuji tanpa HTTP.
func rentangRiwayat(dari, sampai string, sekarang time.Time) (time.Time, time.Time, string) {
	wib := time.FixedZone("WIB", 7*3600)
	baca := func(s string) (time.Time, bool) {
		t, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(s), wib)
		return t, err == nil
	}
	akhir := sekarang.In(wib).AddDate(0, 0, 1)
	akhir = time.Date(akhir.Year(), akhir.Month(), akhir.Day(), 0, 0, 0, 0, wib)
	mulai := akhir.AddDate(0, 0, -hariRiwayatBawaan)
	if dari != "" {
		t, ok := baca(dari)
		if !ok {
			return time.Time{}, time.Time{}, "dari harus berformat YYYY-MM-DD"
		}
		mulai = t
	}
	if sampai != "" {
		t, ok := baca(sampai)
		if !ok {
			return time.Time{}, time.Time{}, "sampai harus berformat YYYY-MM-DD"
		}
		// Inklusif: "sampai=2026-09-20" berarti sampai akhir hari itu.
		akhir = t.AddDate(0, 0, 1)
	}
	if !mulai.Before(akhir) {
		return time.Time{}, time.Time{}, "Rentang tanggal terbalik"
	}
	return mulai, akhir, ""
}

func batasRiwayat(raw string) int32 {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n <= 0 {
		return batasRiwayatBawaan
	}
	if n > batasRiwayatMaks {
		return batasRiwayatMaks
	}
	return int32(n)
}

// GetSales menangani GET /sales?outlet_id=&dari=&sampai=&cari=&limit=
func (h *SalesHistoryHandler) GetSales(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := TenantID(ctx)
	qp := r.URL.Query()

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
	var cari *string
	if c := strings.TrimSpace(qp.Get("cari")); c != "" {
		if len(c) > 100 {
			c = c[:100]
		}
		cari = &c
	}

	rows, err := h.q.ListSales(ctx, store.ListSalesParams{
		TenantID: tenantID, OutletID: outletID,
		Dari: toTimestamptz(mulai), Sampai: toTimestamptz(akhir),
		Cari: cari, Batas: batasRiwayat(qp.Get("limit")),
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat riwayat")
		return
	}
	RespondJSON(w, http.StatusOK, map[string]any{"data": rows})
}

// GetSale menangani GET /sales/{id} — nota lengkap beserta refund-nya.
func (h *SalesHistoryHandler) GetSale(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := TenantID(ctx)
	saleID := chi.URLParam(r, "id")
	if !ulidPola.MatchString(saleID) {
		RespondError(w, http.StatusNotFound, "TRANSACTION_NOT_FOUND", "Transaksi tidak ditemukan")
		return
	}

	sale, err := h.q.GetSaleDetail(ctx, store.GetSaleDetailParams{TenantID: tenantID, ID: saleID})
	if errors.Is(err, pgx.ErrNoRows) {
		RespondError(w, http.StatusNotFound, "TRANSACTION_NOT_FOUND", "Transaksi tidak ditemukan")
		return
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat transaksi")
		return
	}

	items, err := h.q.ListSaleItems(ctx, store.ListSaleItemsParams{TenantID: tenantID, TransactionID: saleID})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat barang")
		return
	}
	payments, err := h.q.ListSalePayments(ctx, store.ListSalePaymentsParams{TenantID: tenantID, TransactionID: saleID})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat pembayaran")
		return
	}
	refunds, err := h.q.ListSaleRefunds(ctx, store.ListSaleRefundsParams{TenantID: tenantID, TransactionID: saleID})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat refund")
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"sale": sale, "items": items, "payments": payments, "refunds": refunds,
	}})
}

type voidInput struct {
	Reason string `json:"reason"`
	// Wajib bila aktor berperan kasir (RBAC-MODEL §"Void transaksi").
	ApproverUserID string `json:"approver_user_id"`
	Pin            string `json:"pin"`
}

// PostVoid menangani POST /sales/{id}/void.
func (h *SalesHistoryHandler) PostVoid(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, actorID, actorRole := TenantID(ctx), UserID(ctx), UserRole(ctx)
	saleID := chi.URLParam(r, "id")
	if !ulidPola.MatchString(saleID) {
		RespondError(w, http.StatusNotFound, "TRANSACTION_NOT_FOUND", "Transaksi tidak ditemukan")
		return
	}

	var req voidInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if len([]rune(req.Reason)) < 3 || len([]rune(req.Reason)) > 500 {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"Alasan void wajib diisi (3–500 huruf)")
		return
	}

	sale, err := h.q.GetSaleDetail(ctx, store.GetSaleDetailParams{TenantID: tenantID, ID: saleID})
	if errors.Is(err, pgx.ErrNoRows) {
		RespondError(w, http.StatusNotFound, "TRANSACTION_NOT_FOUND", "Transaksi tidak ditemukan")
		return
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat transaksi")
		return
	}
	if sale.PaymentStatus != "paid" {
		RespondError(w, http.StatusUnprocessableEntity, "TRANSACTION_ALREADY_VOIDED",
			"Transaksi ini sudah dibatalkan")
		return
	}
	if !sale.RefundedTotal.IsZero() {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"Transaksi sudah pernah direfund — tidak bisa dibatalkan, lanjutkan dengan refund")
		return
	}
	if !sale.ShiftOpen {
		// Z-Report shift itu sudah dicetak dan tidak pernah berubah.
		RespondError(w, http.StatusUnprocessableEntity, "SHIFT_CLOSED",
			"Shift transaksi ini sudah ditutup. Pakai refund, bukan void.")
		return
	}

	// RBAC-MODEL §"Void transaksi": kasir wajib PIN manager; owner/manager
	// menyetujui sendiri. Aturan dan pesannya sama dengan refund (checkout.go).
	approvedBy := actorID
	switch actorRole {
	case "owner", "manager":
	case "cashier":
		id, msg, status, code := verifikasiPinManager(ctx, h.q, tenantID, req.ApproverUserID, req.Pin)
		if msg != "" {
			RespondError(w, status, code, msg)
			return
		}
		approvedBy = id
	default:
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", "Peran ini tidak boleh membatalkan transaksi")
		return
	}

	items, err := h.q.ListSaleItems(ctx, store.ListSaleItemsParams{TenantID: tenantID, TransactionID: saleID})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat barang")
		return
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memulai transaksi")
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op setelah Commit berhasil
	qtx := h.q.WithTx(tx)

	n, err := qtx.VoidSale(ctx, store.VoidSaleParams{TenantID: tenantID, ID: saleID})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal membatalkan transaksi")
		return
	}
	if n == 0 {
		// Balapan dengan void/tutup shift lain sejak pemeriksaan di atas.
		RespondError(w, http.StatusUnprocessableEntity, "TRANSACTION_ALREADY_VOIDED",
			"Transaksi sudah berubah statusnya. Muat ulang riwayat.")
		return
	}

	// Barang kembali ke rak, dalam SATUAN STOK (ADR-0012): sales_items
	// mencatat satuan JUAL, jadi jumlahnya dikonversi dengan faktor yang sama
	// dengan yang dipakai saat menjual.
	catatan := "Void: " + req.Reason
	for _, it := range items {
		potongan, err := stokDikembalikan(ctx, qtx, tenantID, it.VariantID, it.Quantity)
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menghitung stok")
			return
		}
		saldo, err := qtx.AdjustStock(ctx, store.AdjustStockParams{
			TenantID: tenantID, ID: it.VariantID, Delta: potongan.Quantity,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			// Jasa/sewa: tidak ada stok yang perlu dikembalikan.
			continue
		}
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mengembalikan stok")
			return
		}
		if _, err := qtx.InsertStockEvent(ctx, store.InsertStockEventParams{
			ID: ulid.Make().String(), TenantID: tenantID, OutletID: sale.OutletID,
			VariantID: it.VariantID, EventType: "void", QuantityDelta: potongan.Quantity,
			BalanceAfter: saldo, Uom: potongan.Uom, ReferenceID: &saleID,
			ActorUserID: &approvedBy, Note: &catatan,
		}); err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mencatat ledger stok")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan pembatalan")
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{"message": "Transaksi dibatalkan"})
}
