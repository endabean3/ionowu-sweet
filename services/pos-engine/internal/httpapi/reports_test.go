package httpapi

import (
	"testing"

	"github.com/shopspring/decimal"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

func TestBolehLihatOmzet(t *testing.T) {
	// RBAC-MODEL §"Laporan & BI": "Omzet outletnya" = owner ✅, manager ✅,
	// kasir ❌, gudang ❌, sales ❌. Gudang boleh laporan STOK, bukan omzet —
	// margin usaha adalah informasi paling sensitif bagi pemilik UMKM.
	for _, role := range []string{"owner", "manager"} {
		if msg := bolehLihatOmzet(role); msg != "" {
			t.Errorf("%s harus boleh: %s", role, msg)
		}
	}
	for _, role := range []string{"cashier", "warehouse", "sales_floor", "", "admin"} {
		if bolehLihatOmzet(role) == "" {
			t.Errorf("%s TIDAK boleh melihat omzet", role)
		}
	}
}

func TestTunaiDariMetode(t *testing.T) {
	rows := []store.SumPaymentsByMethodForReportRow{
		{PaymentMethod: "qris", Total: decimal.RequireFromString("50000")},
		{PaymentMethod: "cash", Total: decimal.RequireFromString("125500.50")},
	}
	if got := tunaiDariMetode(rows); !got.Equal(decimal.RequireFromString("125500.50")) {
		t.Fatalf("tunai = %s", got)
	}

	// Hari tanpa penjualan tunai sama sekali harus nol, bukan metode pertama
	// yang kebetulan ada — laci yang kosong wajar, dan melaporkan QRIS
	// sebagai isi laci akan memunculkan "selisih" yang tidak pernah ada.
	hanyaQris := []store.SumPaymentsByMethodForReportRow{
		{PaymentMethod: "qris", Total: decimal.RequireFromString("50000")},
	}
	if got := tunaiDariMetode(hanyaQris); !got.IsZero() {
		t.Fatalf("tanpa tunai harus 0, dapat %s", got)
	}
	if got := tunaiDariMetode(nil); !got.IsZero() {
		t.Fatalf("tanpa pembayaran harus 0, dapat %s", got)
	}
}
