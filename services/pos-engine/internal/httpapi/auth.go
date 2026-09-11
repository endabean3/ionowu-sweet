package httpapi

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/auth"
	"github.com/endabean3/ionowu-sweet/services/pos-engine/internal/store"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/oklog/ulid/v2"
)

// AuthHandler menangani /auth/* — register, login, refresh, logout.
// Semua endpoint ini PUBLIK (tanpa TenantMiddleware).
type AuthHandler struct {
	pool       *pgxpool.Pool
	privateKey ed25519.PrivateKey
	publicKey  ed25519.PublicKey
}

// NewAuthHandler membuat AuthHandler. Membutuhkan private key untuk signing JWT.
func NewAuthHandler(pool *pgxpool.Pool, privateKey ed25519.PrivateKey) *AuthHandler {
	return &AuthHandler{
		pool:       pool,
		privateKey: privateKey,
		publicKey:  privateKey.Public().(ed25519.PublicKey),
	}
}

// accessTokenTTL adalah durasi access token (pendek, per SECURITY.md §4B).
const accessTokenTTL = 15 * time.Minute

// authSessionResponse adalah respons standar untuk semua auth endpoint.
type authSessionResponse struct {
	AccessToken  string   `json:"access_token"`
	RefreshToken string   `json:"refresh_token"`
	ExpiresIn    int      `json:"expires_in"` // detik
	User         userInfo `json:"user"`
}

type userInfo struct {
	ID       string `json:"id"`
	TenantID string `json:"tenant_id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

// signAccessToken membuat JWT access token EdDSA untuk user.
func (h *AuthHandler) signAccessToken(userID, tenantID, role string) (string, error) {
	now := time.Now()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(accessTokenTTL)),
		},
		TenantID:       tenantID,
		Role:           role,
		PrincipalClass: PrincipalTenantStaff,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	return token.SignedString(h.privateKey)
}

// generateRefreshToken membuat token acak 32 byte dan mengembalikan:
//   - raw string (dikirim ke klien, tidak disimpan)
//   - hash hex SHA-256 (disimpan di DB)
func generateRefreshToken() (raw, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return
	}
	raw = hex.EncodeToString(b)
	sum := sha256.Sum256([]byte(raw))
	hash = hex.EncodeToString(sum[:])
	return
}

// issueSession membuat access + refresh token dan menyimpan refresh token ke DB.
func (h *AuthHandler) issueSession(r *http.Request, q *store.Queries, userID, tenantID, role, name, email string) (authSessionResponse, error) {
	accessToken, err := h.signAccessToken(userID, tenantID, role)
	if err != nil {
		return authSessionResponse{}, err
	}

	rawRefresh, hashRefresh, err := generateRefreshToken()
	if err != nil {
		return authSessionResponse{}, err
	}

	// device_label VARCHAR(120) (migrations/00001) — User-Agent browser
	// SUNGGUHAN rutin melebihi ini (Chromium dengan detail platform lengkap
	// mudah >150 karakter), beda dari User-Agent client seperti curl yang
	// pendek. Tanpa potong ini, SETIAP login lewat browser nyata gagal
	// "value too long for type character varying(120)" — ditemukan lewat
	// uji login di browser sungguhan, bukan curl (yang User-Agent-nya
	// kebetulan selalu muat).
	ua := r.UserAgent()
	if len(ua) > 120 {
		ua = ua[:120]
	}
	if err = q.CreateRefreshToken(r.Context(), store.CreateRefreshTokenParams{
		ID:          ulid.Make().String(),
		TenantID:    tenantID,
		UserID:      userID,
		TokenHash:   hashRefresh,
		DeviceLabel: &ua,
		// DeviceFingerprint belum dihitung di klien mana pun (PWA belum
		// mengirim fingerprint perangkat) — nil, bukan dipaksa isi nilai
		// yang tidak berarti apa-apa.
		DeviceFingerprint: nil,
	}); err != nil {
		return authSessionResponse{}, err
	}

	return authSessionResponse{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		ExpiresIn:    int(accessTokenTTL.Seconds()),
		User: userInfo{
			ID:       userID,
			TenantID: tenantID,
			Name:     name,
			Email:    email,
			Role:     role,
		},
	}, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/register
// ─────────────────────────────────────────────────────────────────────────────

type registerRequest struct {
	OrganizationName string `json:"organization_name"`
	OutletName       string `json:"outlet_name"`
	OwnerName        string `json:"owner_name"`
	OwnerEmail       string `json:"owner_email"`
	OwnerPassword    string `json:"owner_password"`
}

// PostRegister membuat tenant baru + outlet + user owner dalam satu transaksi.
func (h *AuthHandler) PostRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_PAYLOAD", "Body JSON tidak valid")
		return
	}
	if req.OrganizationName == "" || req.OwnerEmail == "" || req.OwnerPassword == "" || req.OwnerName == "" {
		RespondError(w, http.StatusBadRequest, "MISSING_REQUIRED_FIELD",
			"organization_name, owner_name, owner_email, dan owner_password wajib diisi")
		return
	}
	if len(req.OwnerPassword) < 8 {
		RespondError(w, http.StatusBadRequest, "PASSWORD_TOO_SHORT", "Password minimal 8 karakter")
		return
	}

	passwordHash, err := auth.HashPassword(req.OwnerPassword)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal proses password")
		return
	}

	ctx := r.Context()
	tx, err := h.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal memulai transaksi")
		return
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	q := store.New(tx)

	tenantID := ulid.Make().String()
	outletName := req.OutletName
	if outletName == "" {
		outletName = req.OrganizationName
	}

	if _, err = q.CreateTenant(ctx, store.CreateTenantParams{
		ID:         tenantID,
		Name:       req.OrganizationName,
		PlanTier:   "free",
		PlanStatus: "active",
	}); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal membuat tenant")
		return
	}

	timezone := "Asia/Jakarta"
	if _, err = q.CreateOutlet(ctx, store.CreateOutletParams{
		ID:       ulid.Make().String(),
		TenantID: tenantID,
		Name:     outletName,
		Timezone: timezone,
	}); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal membuat outlet")
		return
	}

	userID := ulid.Make().String()
	if _, err = q.RegisterTenantOwner(ctx, store.RegisterTenantOwnerParams{
		ID:           userID,
		TenantID:     tenantID,
		Name:         req.OwnerName,
		Email:        req.OwnerEmail,
		PasswordHash: passwordHash,
	}); err != nil {
		// Cek duplikat email (unique constraint)
		if isPgError(err, "23505") {
			RespondError(w, http.StatusConflict, "EMAIL_ALREADY_EXISTS",
				"Email sudah terdaftar dalam sistem")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal membuat user")
		return
	}

	session, err := h.issueSession(r, q, userID, tenantID, "owner", req.OwnerName, req.OwnerEmail)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		return
	}

	if err = tx.Commit(ctx); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal commit transaksi")
		return
	}

	RespondJSON(w, http.StatusCreated, session)
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────────────────────

type loginRequest struct {
	TenantID string `json:"tenant_id"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// PostLogin memverifikasi email+password dan menerbitkan sesi baru.
func (h *AuthHandler) PostLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_PAYLOAD", "Body JSON tidak valid")
		return
	}
	if req.TenantID == "" || req.Email == "" || req.Password == "" {
		RespondError(w, http.StatusBadRequest, "MISSING_REQUIRED_FIELD",
			"tenant_id, email, dan password wajib diisi")
		return
	}

	ctx := r.Context()
	q := store.New(h.pool)

	u, err := q.GetUserByEmail(ctx, store.GetUserByEmailParams{
		Email:    req.Email,
		TenantID: req.TenantID,
	})
	if err != nil {
		// User tidak ditemukan atau tidak aktif — pesan generik (security best practice)
		RespondError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS",
			"Email atau password salah")
		return
	}

	ok, err := auth.VerifyPassword(req.Password, u.PasswordHash)
	if err != nil || !ok {
		RespondError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS",
			"Email atau password salah")
		return
	}

	session, err := h.issueSession(r, q, u.ID, u.TenantID, u.Role, u.Name, u.Email)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal membuat sesi")
		return
	}

	RespondJSON(w, http.StatusOK, session)
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/refresh
// ─────────────────────────────────────────────────────────────────────────────

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// PostRefresh me-rotate refresh token dan menerbitkan access token baru.
func (h *AuthHandler) PostRefresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		RespondError(w, http.StatusBadRequest, "INVALID_PAYLOAD", "refresh_token wajib diisi")
		return
	}

	sum := sha256.Sum256([]byte(req.RefreshToken))
	tokenHash := hex.EncodeToString(sum[:])

	ctx := r.Context()
	q := store.New(h.pool)

	stored, err := q.GetRefreshTokenByHash(ctx, tokenHash)
	if err != nil {
		RespondError(w, http.StatusUnauthorized, "INVALID_REFRESH_TOKEN",
			"Refresh token tidak valid atau sudah kedaluwarsa")
		return
	}

	// Revoke token lama (rotate)
	if err = q.RevokeRefreshToken(ctx, store.RevokeRefreshTokenParams{
		TenantID: stored.TenantID, TokenHash: tokenHash,
	}); err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal revoke token lama")
		return
	}

	// Ambil info user untuk claims baru
	info, err := q.GetUserWithTenant(ctx, stored.UserID)
	if err != nil {
		RespondError(w, http.StatusUnauthorized, "INVALID_REFRESH_TOKEN", "User tidak ditemukan")
		return
	}

	session, err := h.issueSession(r, q, stored.UserID, stored.TenantID,
		info.Role, info.UserName, info.Email)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Gagal menerbitkan sesi baru")
		return
	}

	RespondJSON(w, http.StatusOK, session)
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/logout
// ─────────────────────────────────────────────────────────────────────────────

type logoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// PostLogout merevoke refresh token dan mengakhiri sesi.
func (h *AuthHandler) PostLogout(w http.ResponseWriter, r *http.Request) {
	var req logoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		RespondError(w, http.StatusBadRequest, "INVALID_PAYLOAD", "refresh_token wajib diisi")
		return
	}

	sum := sha256.Sum256([]byte(req.RefreshToken))
	tokenHash := hex.EncodeToString(sum[:])

	ctx := r.Context()
	q := store.New(h.pool)

	// tenant_id wajib untuk RevokeRefreshToken (SECURITY.md §2B) — belum
	// diketahui dari request logout itu sendiri, jadi dicari dulu lewat
	// hash. Kegagalan lookup DIABAIKAN dengan sengaja: token mungkin sudah
	// expired/revoked, dan logout tetap harus idempoten dari sudut pandang
	// klien.
	stored, err := q.GetRefreshTokenByHash(ctx, tokenHash)
	if err == nil {
		_ = q.RevokeRefreshToken(ctx, store.RevokeRefreshTokenParams{
			TenantID: stored.TenantID, TokenHash: tokenHash,
		})
	}

	w.WriteHeader(http.StatusNoContent)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: cek kode error PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────

// isPgError mengembalikan true bila err adalah PostgreSQL error dengan code tertentu.
func isPgError(err error, code string) bool {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState() == code
	}
	return false
}
