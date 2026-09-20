package httpapi

import (
	"context"
	"strings"

	"github.com/shopspring/decimal"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

// Bagian murni (tanpa database) dari mutasi stok: RBAC, validasi angka, dan
// arah tanda tiap jenis mutasi. Diuji tanpa Postgres.

// bolehUbahStok: RBAC-MODEL §Matriks — "Terima barang dari distributor",
// "Catat barang rusak/hilang", dan "Stock opname" semuanya ✅ untuk owner,
// manager, dan gudang; kasir & sales hanya boleh MELIHAT level stok.
// Sebelumnya endpoint stok tidak memeriksa peran sama sekali.
func bolehUbahStok(role string) string {
	switch role {
	case "owner", "manager", "warehouse":
		return ""
	default:
		return "Hanya owner, manager, atau gudang yang boleh mengubah stok"
	}
}

// jenisMutasi adalah event_type yang boleh dikirim layar Stok, beserta arah
// tandanya. `stock_events.event_type` punya CHECK di migrasi 00006; nilai di
// luar daftar ini ditolak sebelum menyentuh database.
//
// `opname_adjust` TIDAK ada di sini: ia hanya boleh lahir dari /stock/opname,
// supaya setiap koreksi opname punya berkas opname yang menjelaskannya.
var jenisMutasi = map[string]int{
	"restock": +1, // barang datang dari pemasok
	"waste":   -1, // rusak, tumpah, hilang
}

// mutasiStokReq: satu mutasi stok dari layar Stok. `quantity` selalu POSITIF
// dan dalam SATUAN STOK (gram untuk bibit, ADR-0012); arahnya ditentukan
// `event_type`. Delta bertanda sengaja tidak dipakai di API: "-250" yang
// salah ketik jadi "250" diam-diam menambah stok, bukan menguranginya.
type mutasiStokReq struct {
	OutletID  string  `json:"outlet_id"`
	VariantID string  `json:"variant_id"`
	EventType string  `json:"event_type"`
	Quantity  string  `json:"quantity"`
	Note      *string `json:"note"`

	delta decimal.Decimal
}

func (p *mutasiStokReq) normalize() string {
	p.OutletID = strings.TrimSpace(p.OutletID)
	p.VariantID = strings.TrimSpace(p.VariantID)
	p.EventType = strings.TrimSpace(p.EventType)
	if p.Note != nil {
		n := strings.TrimSpace(*p.Note)
		if len([]rune(n)) > 500 {
			return "Catatan maksimal 500 huruf"
		}
		p.Note = &n
	}
	if !ulidPola.MatchString(p.OutletID) {
		return "outlet_id tidak valid"
	}
	if !ulidPola.MatchString(p.VariantID) {
		return "variant_id tidak valid"
	}
	arah, ada := jenisMutasi[p.EventType]
	if !ada {
		return "event_type harus restock atau waste"
	}
	qty, msg := kuantitasStok(p.Quantity)
	if msg != "" {
		return msg
	}
	if qty.IsZero() {
		return "Jumlah harus lebih dari 0"
	}
	p.delta = qty.Mul(decimal.NewFromInt(int64(arah)))
	return ""
}

// kuantitasStok membaca angka stok: ≥ 0, maksimal 3 desimal (presisi kolom
// DECIMAL(14,3)), dan tidak melebihi kapasitas kolom.
func kuantitasStok(raw string) (decimal.Decimal, string) {
	d, err := decimal.NewFromString(strings.TrimSpace(raw))
	if err != nil {
		return decimal.Zero, "Jumlah harus berupa angka"
	}
	if d.IsNegative() {
		return decimal.Zero, "Jumlah tidak boleh negatif"
	}
	if d.Exponent() < -3 {
		return decimal.Zero, "Jumlah maksimal 3 angka di belakang koma"
	}
	if d.GreaterThanOrEqual(decimal.New(1, 11)) {
		return decimal.Zero, "Jumlah terlalu besar"
	}
	return d, ""
}

// satuanStok mengambil satuan tempat stock_quantity dihitung. Dipakai untuk
// mengisi stock_events.uom — versi lama endpoint stok menulis satuan dari
// payload klien (dan opname meng-hardcode "pcs"), sehingga laporan stok
// keluar bibit bercampur ml dan gram.
func satuanStok(ctx context.Context, q *store.Queries, tenantID, variantID string) (string, error) {
	return q.GetStockUom(ctx, store.GetStockUomParams{TenantID: tenantID, ID: variantID})
}
