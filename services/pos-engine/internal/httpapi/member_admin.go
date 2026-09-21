package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

// MemberAdminHandler melayani layar daftar member (/member).
//
// Terpisah dari member.go, yang menangani PENDAFTARAN dari perangkat kasir
// lewat /sync/push. Yang di sini dibaca dan diubah dari satu layar oleh
// pemilik, jadi ia boleh mencari, menghitung, dan memakai jaringan.
type MemberAdminHandler struct {
	q *store.Queries
}

func NewMemberAdminHandler(pool *pgxpool.Pool) *MemberAdminHandler {
	return &MemberAdminHandler{q: store.New(pool)}
}

// bolehKelolaMember: RBAC-MODEL §CRM — "Daftarkan pelanggan baru" ✅ untuk
// owner, manager, kasir, dan sales; "Lihat riwayat belanja pelanggan"
// ⚠️ terbatas untuk kasir. Daftar ini menampilkan total belanja per member,
// jadi ia mengikuti aturan yang kedua: owner, manager, dan sales.
func bolehKelolaMember(role string) string {
	switch role {
	case "owner", "manager", "sales_floor":
		return ""
	default:
		return "Peran ini tidak bisa membuka daftar member"
	}
}

const batasMemberBawaan = 200

// GetMembers menangani GET /members.
func (h *MemberAdminHandler) GetMembers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if msg := bolehKelolaMember(UserRole(ctx)); msg != "" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", msg)
		return
	}

	var cari *string
	if q := strings.TrimSpace(r.URL.Query().Get("cari")); q != "" {
		if utf8.RuneCountInString(q) > 100 {
			RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Kata pencarian terlalu panjang")
			return
		}
		cari = &q
	}

	rows, err := h.q.ListMembers(ctx, store.ListMembersParams{
		TenantID: TenantID(ctx), Cari: cari, Batas: batasMemberBawaan,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat member")
		return
	}
	RespondJSON(w, http.StatusOK, map[string]any{"data": rows})
}

type memberPatchInput struct {
	Name         *string `json:"name"`
	Phone        *string `json:"phone"`
	SocialHandle *string `json:"social_handle"`
	// true = tandai merchandise sudah diberikan, false = batalkan penandanya.
	Merchandise *bool `json:"merchandise_given"`
}

// PatchMember menangani PATCH /members/{id} — koreksi data member.
//
// Kode member TIDAK bisa diubah dan sengaja tidak ada di payload ini:
// barcodenya sudah tercetak di nota yang dipegang pelanggan, dan mengganti
// kodenya berarti kartu yang beredar menunjuk ke orang yang tidak ada.
func (h *MemberAdminHandler) PatchMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if msg := bolehKelolaMember(UserRole(ctx)); msg != "" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", msg)
		return
	}

	var req memberPatchInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}

	if req.Name != nil {
		n := strings.TrimSpace(*req.Name)
		if utf8.RuneCountInString(n) > 200 {
			RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Nama maksimal 200 huruf")
			return
		}
		req.Name = &n
	}
	if req.Phone != nil {
		// Dibakukan dengan aturan yang SAMA seperti saat mendaftar
		// (member.go): kalau tidak, satu orang bisa punya dua baris yang
		// tidak pernah dikenali sebagai orang yang sama.
		p := normalizeWA(*req.Phone)
		if p == "" {
			RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Nomor WhatsApp tidak valid")
			return
		}
		req.Phone = &p
	}
	if req.SocialHandle != nil {
		s := strings.TrimPrefix(strings.TrimSpace(*req.SocialHandle), "@")
		if utf8.RuneCountInString(s) > 100 {
			RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Akun sosial maksimal 100 huruf")
			return
		}
		req.SocialHandle = &s
	}

	n, err := h.q.UpdateMember(ctx, store.UpdateMemberParams{
		TenantID: TenantID(ctx), ID: chi.URLParam(r, "id"),
		Name: req.Name, Phone: req.Phone, SocialHandle: req.SocialHandle,
		Merchandise: req.Merchandise,
	})
	if err != nil {
		if isPgError(err, "23505") {
			RespondError(w, http.StatusConflict, "PHONE_ALREADY_EXISTS",
				"Nomor WhatsApp ini sudah dipakai member lain")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan member")
		return
	}
	if n == 0 {
		RespondError(w, http.StatusNotFound, "CUSTOMER_NOT_FOUND", "Member tidak ditemukan")
		return
	}
	RespondJSON(w, http.StatusOK, map[string]any{"message": "Member diperbarui"})
}

// bolehCariMember: RBAC-MODEL §CRM "Daftarkan pelanggan baru" — owner,
// manager, kasir, dan sales. Kasir SENGAJA termasuk di sini meski ia
// dikecualikan dari daftar member (bolehKelolaMember): mengenali member yang
// berdiri di depannya adalah pekerjaannya, membaca total belanjanya bukan.
func bolehCariMember(role string) string {
	switch role {
	case "owner", "manager", "cashier", "sales_floor":
		return ""
	default:
		return "Peran ini tidak bisa mencari member"
	}
}

// GetMemberLookup menangani GET /customers/lookup?q=<kode|nomor WA>.
//
// Jembatan antara member yang mendaftar SENDIRI lewat QR nota di web toko dan
// kasir yang melayaninya beberapa menit kemudian: member itu ada di server,
// tetapi cermin IndexedDB perangkat kasir baru memuatnya pada /sync/pull
// berikutnya. Tanpa endpoint ini, pelanggan yang baru saja mendaftar ditolak
// di meja kasir — "tidak ada member dengan kode itu".
func (h *MemberAdminHandler) GetMemberLookup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if msg := bolehCariMember(UserRole(ctx)); msg != "" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", msg)
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" || utf8.RuneCountInString(q) > 100 {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "q wajib diisi")
		return
	}

	// Dicocokkan PERSIS, bukan sebagian: endpoint ini menjawab "siapa
	// pemilik kode/nomor ini", bukan "siapa saja yang mirip". Pencocokan
	// sebagian akan menjadikannya cara menelusuri daftar pelanggan satu
	// per satu dari akun kasir.
	kode := strings.ToUpper(q)
	wa := normalizeWA(q)
	// Bukan nomor (normalizeWA mengembalikan ""): cocokkan kode saja.
	// String kosong sengaja dibiarkan apa adanya — tidak ada member yang
	// nomornya "", jadi cabang OR-nya tidak pernah cocok. Penanda seperti
	// "\x00" justru berbahaya: byte NUL dalam parameter text ditolak
	// Postgres, dan pencarian nama biasa akan gagal 500.

	row, err := h.q.LookupMember(ctx, store.LookupMemberParams{
		TenantID: TenantID(ctx), Kode: kode, Wa: wa,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		RespondError(w, http.StatusNotFound, "CUSTOMER_NOT_FOUND", "Member tidak ditemukan")
		return
	}
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal mencari member")
		return
	}
	RespondJSON(w, http.StatusOK, map[string]any{"data": row})
}
