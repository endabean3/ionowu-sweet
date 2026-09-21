package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/auth"
	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

// verifikasiPinManager memeriksa persetujuan manager/owner untuk aksi yang
// tidak boleh dilakukan kasir sendirian (refund, void — RBAC-MODEL
// §"Void transaksi"). Mengembalikan id penyetuju, atau pesan + status + kode
// galat bila ditolak.
//
// Dipakai bersama oleh refund (checkout.go) dan void (sales_history.go):
// aturan yang sama ditulis dua kali adalah cara paling mudah membuat salah
// satunya lebih longgar tanpa ada yang menyadarinya.
func verifikasiPinManager(
	ctx context.Context, q *store.Queries, tenantID, approverID, pin string,
) (id, msg string, status int, code string) {
	if approverID == "" || pin == "" {
		return "", "Aksi ini butuh persetujuan PIN manager", http.StatusForbidden, "MANAGER_PIN_REQUIRED"
	}
	approver, err := q.GetApproverForPin(ctx, store.GetApproverForPinParams{TenantID: tenantID, ID: approverID})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "Approver tidak ditemukan", http.StatusUnauthorized, "INVALID_PIN"
	}
	if err != nil {
		return "", "Gagal memeriksa approver", http.StatusInternalServerError, "INTERNAL_ERROR"
	}
	if !approver.IsActive || (approver.Role != "owner" && approver.Role != "manager") {
		return "", "Approver harus manager/owner aktif", http.StatusForbidden, "MANAGER_PIN_REQUIRED"
	}
	if approver.PinHash == nil {
		return "", "Manager ini belum mengatur PIN", http.StatusUnauthorized, "INVALID_PIN"
	}
	ok, err := auth.VerifyPassword(pin, *approver.PinHash)
	if err != nil || !ok {
		return "", "PIN salah", http.StatusUnauthorized, "INVALID_PIN"
	}
	return approver.ID, "", 0, ""
}

// pengembalianStok: jumlah yang kembali ke rak saat void/refund, dalam SATUAN
// STOK. sales_items menyimpan satuan JUAL (30 ml), sementara stok bibit
// dihitung gram (ADR-0012) — faktor yang dipakai sama dengan saat menjual.
type pengembalianStok struct {
	Quantity decimal.Decimal
	Uom      string
}

func stokDikembalikan(
	ctx context.Context, q *store.Queries, tenantID, variantID string, qtyJual decimal.Decimal,
) (pengembalianStok, error) {
	v, err := q.GetVariantConversion(ctx, store.GetVariantConversionParams{TenantID: tenantID, ID: variantID})
	if err != nil {
		return pengembalianStok{}, err
	}
	qty, uom := stockDeduction(qtyJual, v.Uom, v.StockUom, v.StockFactor)
	return pengembalianStok{Quantity: qty, Uom: uom}, nil
}

// ApproverHandler melayani GET /approvers.
type ApproverHandler struct {
	q *store.Queries
}

func NewApproverHandler(pool *pgxpool.Pool) *ApproverHandler {
	return &ApproverHandler{q: store.New(pool)}
}

// GetApprovers menangani GET /approvers — daftar owner/manager yang bisa
// dimintai PIN dari layar kasir (refund, void, diskon besar).
//
// Terbuka untuk semua peran yang login, dan memang harus: yang MEMBUTUHKAN
// daftar ini justru kasir. Isinya hanya nama, peran, dan apakah PIN sudah
// diatur — tidak ada hash, email, atau apa pun yang bisa dipakai masuk.
func (h *ApproverHandler) GetApprovers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.q.ListApprovers(r.Context(), TenantID(r.Context()))
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat daftar manager")
		return
	}
	RespondJSON(w, http.StatusOK, map[string]any{"data": rows})
}

type pinInput struct {
	Password string `json:"password"`
	// 4–8 angka; kosong = hapus PIN.
	Pin string `json:"pin"`
}

// polaPin: hanya angka, 4–8 digit. Dibatasi angka karena diketik di mesin
// kasir dengan papan tik numerik, sering sambil pembeli menunggu.
var polaPin = regexp.MustCompile(`^[0-9]{4,8}$`)

// PatchMyPin menangani PATCH /me/pin — owner/manager mengatur PIN
// persetujuannya SENDIRI (RBAC-MODEL §"Kelola karyawan & PIN").
//
// PATCH, bukan PUT: seluruh API ini hanya memakai GET/POST/PATCH/DELETE, dan
// daftar itu pula yang diizinkan middleware CORS. Satu PUT yang menyelinap
// masuk akan gagal di PREFLIGHT — peramban menolaknya sebelum ada satu pun
// permintaan sampai ke server, jadi log server bersih dan yang terlihat
// hanyalah tombol yang "tidak melakukan apa-apa".
//
// Sebelum ini tidak ada jalur apa pun untuk mengisi `users.pin_hash` selain
// seeder data contoh — artinya di produksi TIDAK ADA satu pun manager yang
// punya PIN, dan seluruh alur persetujuan kasir (refund, void) mati total
// meski servernya sudah mendukungnya sejak lama.
func (h *ApproverHandler) PatchMyPin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, userID := TenantID(ctx), UserID(ctx)

	var req pinInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	req.Pin = strings.TrimSpace(req.Pin)
	if req.Pin != "" && !polaPin.MatchString(req.Pin) {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "PIN harus 4–8 angka")
		return
	}

	u, err := h.q.GetUserForPinChange(ctx, store.GetUserForPinChangeParams{TenantID: tenantID, ID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		RespondError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Akun tidak ditemukan")
		return
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memeriksa akun")
		return
	}
	if u.Role != "owner" && u.Role != "manager" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", "Hanya owner atau manager yang punya PIN persetujuan")
		return
	}
	ok, err := auth.VerifyPassword(req.Password, u.PasswordHash)
	if err != nil || !ok {
		RespondError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "Password salah")
		return
	}

	var hash *string
	if req.Pin != "" {
		hashed, err := auth.HashPassword(req.Pin)
		if err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan PIN")
			return
		}
		hash = &hashed
	}
	if _, err := h.q.SetUserPin(ctx, store.SetUserPinParams{
		TenantID: tenantID, ID: userID, PinHash: hash,
	}); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan PIN")
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{"punya_pin": hash != nil},
	})
}

type verifikasiInput struct {
	ApproverUserID string `json:"approver_user_id"`
	Pin            string `json:"pin"`
}

// PostVerifyPin menangani POST /approvals/verify — memeriksa PIN manager
// TANPA melakukan apa pun terhadap data.
//
// Dipakai gerbang diskon besar di layar kasir (RBAC-MODEL §Matriks "Diskon
// manual >20%" = ⚠️ PIN manager untuk kasir). Berbeda dari refund dan void,
// diskon diputuskan SEBELUM transaksi ada — jadi tidak ada payload tempat
// menitipkan PIN, dan pemeriksaannya harus berdiri sendiri.
//
// Batasnya jujur: ini gerbang di KLIEN. Transaksi offline selalu diterima
// server (invarian §6 #4 — barang sudah keluar), jadi endpoint ini mencegah
// penyalahgunaan biasa, bukan kasir yang sengaja mematikan koneksi.
func (h *ApproverHandler) PostVerifyPin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req verifikasiInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	id, msg, status, code := verifikasiPinManager(ctx, h.q, TenantID(ctx), req.ApproverUserID, req.Pin)
	if msg != "" {
		RespondError(w, status, code, msg)
		return
	}
	RespondJSON(w, http.StatusOK, map[string]any{"data": map[string]any{"approver_user_id": id}})
}
