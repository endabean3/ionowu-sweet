package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
	"github.com/shopspring/decimal"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

type StockOpnameHandler struct {
	pool *pgxpool.Pool
	q    *store.Queries
}

func NewStockOpnameHandler(pool *pgxpool.Pool) *StockOpnameHandler {
	return &StockOpnameHandler{pool: pool, q: store.New(pool)}
}

type opnameItemInput struct {
	VariantID string `json:"variant_id"`
	// Hasil timbang, dalam SATUAN STOK. Jumlah menurut sistem TIDAK dikirim
	// klien: ia dibaca dari database di dalam transaksi ini (angka klien bisa
	// basi karena penjualan yang masuk belakangan, atau dipalsukan).
	CountedQuantity string `json:"counted_quantity"`

	counted decimal.Decimal
}

type opnameInput struct {
	OutletID string            `json:"outlet_id"`
	Items    []opnameItemInput `json:"items"`
}

// maksItemOpname membatasi satu opname; katalog Warung Wangi ±170 baris.
const maksItemOpname = 500

func (p *opnameInput) normalize() string {
	p.OutletID = strings.TrimSpace(p.OutletID)
	if !ulidPola.MatchString(p.OutletID) {
		return "outlet_id tidak valid"
	}
	if len(p.Items) == 0 {
		return "Tidak ada barang yang diopname"
	}
	if len(p.Items) > maksItemOpname {
		return "Terlalu banyak barang dalam satu opname"
	}
	unik := make(map[string]bool, len(p.Items))
	for i := range p.Items {
		it := &p.Items[i]
		it.VariantID = strings.TrimSpace(it.VariantID)
		if !ulidPola.MatchString(it.VariantID) {
			return "variant_id tidak valid"
		}
		if unik[it.VariantID] {
			// Dua baris untuk barang yang sama akan saling menimpa; hasilnya
			// bergantung urutan, dan selisihnya tidak bisa dijelaskan.
			return "Barang yang sama muncul dua kali dalam satu opname"
		}
		unik[it.VariantID] = true
		qty, msg := kuantitasStok(it.CountedQuantity)
		if msg != "" {
			return msg
		}
		it.counted = qty
	}
	return ""
}

// PostStockOpname menangani POST /stock/opname — hasil timbang menjadi stok
// yang berlaku, dan selisihnya dicatat di ledger.
//
// Versi sebelumnya menyimpan berkas opname tetapi **tidak pernah mengubah
// `variants.stock_quantity`**: setelah opname, stok di kasir tetap angka lama,
// jadi seluruh kegiatan menimbang tidak berpengaruh apa pun. Satuan ledger
// juga di-hardcode "pcs", sehingga koreksi bibit (gram) tercatat sebagai pcs.
func (h *StockOpnameHandler) PostStockOpname(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, _ := ctx.Value(tenantIDKey).(string)
	userID, _ := ctx.Value(userIDKey).(string)

	var req opnameInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512<<10)).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	if msg := req.normalize(); msg != "" {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", msg)
		return
	}
	if msg := bolehUbahStok(UserRole(ctx)); msg != "" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", msg)
		return
	}

	milik, err := h.q.OutletBelongsToTenant(ctx, store.OutletBelongsToTenantParams{
		TenantID: tenantID, ID: req.OutletID,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memeriksa outlet")
		return
	}
	if !milik {
		RespondError(w, http.StatusNotFound, "OUTLET_NOT_FOUND", "Outlet tidak ditemukan")
		return
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memulai transaksi")
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op setelah Commit berhasil
	qtx := h.q.WithTx(tx)

	// ULID MURNI — stock_opname*.id adalah VARCHAR(26) (migrations/00006);
	// prefiks membuatnya 29+ karakter dan INSERT gagal "value too long".
	opnameID := ulid.Make().String()
	pemeriksa := userID

	// Auto-approve oleh yang menimbang. Alur draft → tinjau manager menyusul
	// bersama PIN manager (RBAC-MODEL §"Void transaksi").
	if _, err := qtx.InsertStockOpname(ctx, store.InsertStockOpnameParams{
		ID: opnameID, TenantID: tenantID, OutletID: req.OutletID,
		Status: "approved", StartedBy: userID, ApprovedBy: &pemeriksa,
	}); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan opname")
		return
	}

	hasil := make([]map[string]string, 0, len(req.Items))
	for _, item := range req.Items {
		// Kunci baris, lalu baca stok yang BENAR-BENAR tersimpan.
		sistem, err := qtx.LockVariantStock(ctx, store.LockVariantStockParams{
			TenantID: tenantID, ID: item.VariantID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			RespondError(w, http.StatusNotFound, "VARIANT_NOT_FOUND",
				"Barang tidak ditemukan atau tidak berstok: "+item.VariantID)
			return
		}
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal membaca stok")
			return
		}

		if _, err := qtx.InsertStockOpnameItem(ctx, store.InsertStockOpnameItemParams{
			ID: ulid.Make().String(), TenantID: tenantID, OpnameID: opnameID,
			VariantID: item.VariantID, SystemQuantity: sistem, CountedQuantity: item.counted,
		}); err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan item opname")
			return
		}

		selisih := item.counted.Sub(sistem)
		if !selisih.IsZero() {
			uom, err := satuanStok(ctx, qtx, tenantID, item.VariantID)
			if err != nil {
				RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat satuan stok")
				return
			}
			if _, err := qtx.SetStock(ctx, store.SetStockParams{
				TenantID: tenantID, ID: item.VariantID, Counted: item.counted,
			}); err != nil {
				RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memperbarui stok")
				return
			}
			if _, err := qtx.InsertStockEvent(ctx, store.InsertStockEventParams{
				ID: ulid.Make().String(), TenantID: tenantID, OutletID: req.OutletID,
				VariantID: item.VariantID, EventType: "opname_adjust", QuantityDelta: selisih,
				BalanceAfter: item.counted, Uom: uom, ReferenceID: &opnameID, ActorUserID: &pemeriksa,
			}); err != nil {
				RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mencatat mutasi opname")
				return
			}
		}

		hasil = append(hasil, map[string]string{
			"variant_id": item.VariantID,
			"system":     sistem.String(),
			"counted":    item.counted.String(),
			"variance":   selisih.String(),
		})
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan opname")
		return
	}

	RespondJSON(w, http.StatusCreated, map[string]any{
		"message":   "Opname tersimpan",
		"opname_id": opnameID,
		"data":      hasil,
	})
}
