package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/auth"
	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
)

// StaffHandler melayani pengelolaan karyawan satu tenant.
//
// Sampai sebelum berkas ini ada, SATU-SATUNYA cara membuat user adalah
// POST /auth/register — yang selalu membuat tenant BARU beserta ownernya.
// Akibatnya setiap tenant di produksi hanya punya satu akun, peran "cashier"
// tidak pernah benar-benar ada, dan seluruh aturan RBAC yang membedakan
// kasir dari owner (termasuk PIN persetujuan) tidak pernah bisa diuji oleh
// pemakai sungguhan.
type StaffHandler struct {
	pool *pgxpool.Pool
	q    *store.Queries
}

func NewStaffHandler(pool *pgxpool.Pool) *StaffHandler {
	return &StaffHandler{pool: pool, q: store.New(pool)}
}

// peranKaryawan yang boleh dibuat owner. "owner" TIDAK termasuk: satu tenant
// satu pemilik, dan menambah owner kedua berarti menambah orang yang bisa
// melihat margin serta mengubah harga — keputusan yang tidak boleh terjadi
// lewat satu ketukan di layar Pengaturan.
var peranKaryawan = map[string]bool{
	"manager": true, "cashier": true, "warehouse": true, "sales_floor": true,
}

type staffInput struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

// GetStaff menangani GET /users — daftar karyawan.
func (h *StaffHandler) GetStaff(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if UserRole(ctx) != "owner" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", "Hanya owner yang boleh mengelola karyawan")
		return
	}
	rows, err := h.q.ListStaff(ctx, TenantID(ctx))
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat karyawan")
		return
	}
	RespondJSON(w, http.StatusOK, map[string]any{"data": rows})
}

// PostStaff menangani POST /users — owner menambah karyawan.
//
// RBAC-MODEL §Administrasi "Kelola karyawan & PIN": owner ✅, manager
// ⚠️ outletnya. Manager sengaja DIKECUALIKAN untuk sekarang: penugasan
// per-outlet belum ada di jalur ini, dan manager yang bisa membuat akun
// tanpa batas outlet sama saja dengan owner kedua.
func (h *StaffHandler) PostStaff(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID := TenantID(ctx)

	if UserRole(ctx) != "owner" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", "Hanya owner yang boleh menambah karyawan")
		return
	}

	var req staffInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload tidak valid")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Role = strings.TrimSpace(req.Role)

	switch {
	case req.Name == "" || utf8.RuneCountInString(req.Name) > 200:
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Nama wajib diisi (maksimal 200 huruf)")
		return
	case !strings.Contains(req.Email, "@"):
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Email tidak valid")
		return
	case len(req.Password) < 8:
		RespondError(w, http.StatusUnprocessableEntity, "PASSWORD_TOO_SHORT", "Password minimal 8 karakter")
		return
	case !peranKaryawan[req.Role]:
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"Peran harus manager, cashier, warehouse, atau sales_floor")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan karyawan")
		return
	}

	// User DAN penugasan outletnya ditulis dalam SATU transaksi.
	//
	// GET /outlets untuk peran non-owner membaca user_outlet_assignments
	// (outlet.go — kasir hanya melihat cabang tempat ia ditugaskan). Kasir
	// yang dibuat tanpa penugasan akan login, menemukan daftar outlet
	// KOSONG, lalu tombol "Buka Shift" tidak pernah bisa ditekan: akun yang
	// mati sejak lahir, tanpa satu pun pesan galat yang menjelaskannya.
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan karyawan")
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op setelah Commit berhasil
	qtx := h.q.WithTx(tx)

	u, err := qtx.CreateStaffUser(ctx, store.CreateStaffUserParams{
		ID: ulid.Make().String(), TenantID: tenantID, Name: req.Name,
		Email: req.Email, PasswordHash: hash, Role: req.Role,
	})
	if err != nil {
		// idx_users_email UNIK GLOBAL (00001_foundation.sql): satu email
		// hanya pernah menunjuk satu user di seluruh platform, karena login
		// tidak meminta tenant_id.
		if isPgError(err, "23505") {
			RespondError(w, http.StatusConflict, "EMAIL_ALREADY_EXISTS", "Email ini sudah dipakai akun lain")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan karyawan")
		return
	}

	// Ditugaskan ke SELURUH outlet tenant. Penugasan per-outlet yang
	// sesungguhnya menunggu layar multi-outlet (MULTI-OUTLET.md); sampai itu
	// ada, "semua outlet" adalah jawaban yang benar untuk toko satu cabang —
	// dan satu-satunya yang tidak membuat akun barunya mati sejak lahir.
	outlets, err := qtx.ListOutlets(ctx, tenantID)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memuat outlet")
		return
	}
	for i, o := range outlets {
		if err := qtx.CreateUserOutletAssignment(ctx, store.CreateUserOutletAssignmentParams{
			ID: ulid.Make().String(), TenantID: tenantID, UserID: u.ID,
			OutletID: o.ID, IsPrimary: i == 0,
		}); err != nil {
			RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menugaskan outlet")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan karyawan")
		return
	}

	RespondJSON(w, http.StatusCreated, map[string]any{"data": u})
}

type staffActiveInput struct {
	IsActive *bool `json:"is_active"`
}

// PatchStaff menangani PATCH /users/{id} — mengaktifkan/menonaktifkan.
func (h *StaffHandler) PatchStaff(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tenantID, actorID := TenantID(ctx), UserID(ctx)
	id := chi.URLParam(r, "id")

	if UserRole(ctx) != "owner" {
		RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE", "Hanya owner yang boleh mengelola karyawan")
		return
	}
	var req staffActiveInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&req); err != nil || req.IsActive == nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "is_active wajib diisi")
		return
	}
	// Owner menonaktifkan dirinya sendiri = tenant tanpa satu pun akun yang
	// bisa mengelola apa pun, dan tidak ada jalan kembali dari dalam aplikasi.
	if id == actorID {
		RespondError(w, http.StatusUnprocessableEntity, "VALIDATION_ERROR",
			"Anda tidak bisa menonaktifkan akun Anda sendiri")
		return
	}

	n, err := h.q.SetStaffActive(ctx, store.SetStaffActiveParams{
		TenantID: tenantID, ID: id, IsActive: *req.IsActive,
	})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menyimpan karyawan")
		return
	}
	if n == 0 {
		RespondError(w, http.StatusNotFound, "USER_NOT_FOUND", "Karyawan tidak ditemukan")
		return
	}
	RespondJSON(w, http.StatusOK, map[string]any{"message": "Karyawan diperbarui"})
}
