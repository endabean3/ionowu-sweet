package httpapi

import (
	"context"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
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
