-- Kueri autentikasi untuk jalur /auth/*.
-- Dipakai hanya oleh internal/httpapi/auth.go — bukan seeder.

-- name: GetUserByEmail :one
-- Lookup user berdasarkan email untuk login. Hanya user aktif.
SELECT id, tenant_id, name, email, password_hash, role, pin_hash, is_active
FROM users
WHERE email = $1 AND tenant_id = $2 AND is_active = TRUE
LIMIT 1;

-- name: GetUserByEmailGlobal :one
-- sqlc-vet-disable: wajib-tenant-scope
-- Lookup user untuk login TANPA tenant_id. Dikecualikan dari aturan
-- wajib-tenant-scope dengan alasan yang sama seperti RegisterTenantOwner:
-- login adalah operasi SEBELUM tenant diketahui — memaksa pemanggil menyebut
-- tenant_id berarti pemilik warung harus menghafal ULID 26 karakter, dan
-- kehilangan string itu mengunci dia keluar dari datanya sendiri.
--
-- Aman karena `idx_users_email` UNIQUE global (00001_foundation.sql:45): satu
-- email hanya pernah menunjuk satu user, jadi tenant_id hasilnya deterministik
-- dan tidak bisa ditebak-tebak oleh pemanggil. Setelah baris ini didapat,
-- seluruh kueri berikutnya tetap memfilter tenant_id dari hasil di sini —
-- bukan dari input klien, yang justru lebih ketat daripada sebelumnya.
SELECT id, tenant_id, name, email, password_hash, role, pin_hash, is_active
FROM users
WHERE email = $1 AND is_active = TRUE
LIMIT 1;

-- name: GetUserWithTenant :one
-- Setelah login sukses, ambil info tenant untuk disertakan dalam JWT claims.
SELECT
    u.id         AS user_id,
    u.tenant_id,
    u.name       AS user_name,
    u.email,
    u.role,
    t.name       AS tenant_name,
    t.plan_tier,
    t.plan_status
FROM users u
JOIN tenants t ON t.id = u.tenant_id
WHERE u.id = $1 AND u.is_active = TRUE;

-- name: CreateRefreshToken :exec
-- Simpan refresh token (sudah di-hash SHA-256) dengan TTL 7 hari.
--
-- BUG DITEMUKAN & DIPERBAIKI (3 Sept 2026): daftar kolom sebelumnya menyebut
-- `device_label` DUA KALI (bukan device_label + device_fingerprint yang ada
-- di skema, migrations/00001). Postgres menolak INSERT dengan kolom
-- terduplikasi ("column device_label specified more than once") — setiap
-- login/register/refresh gagal total. Ditemukan lewat `make sqlc-vet` +
-- pembacaan manual, dikonfirmasi lewat login end-to-end nyata setelah
-- diperbaiki, bukan diasumsikan benar dari nama variabel Go.
INSERT INTO refresh_tokens (id, tenant_id, user_id, token_hash, expires_at, device_label, device_fingerprint)
VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days', $5, $6);

-- name: GetRefreshTokenByHash :one
-- Verifikasi refresh token. Kembalikan error bila sudah direvokasi atau expired.
SELECT id, tenant_id, user_id, expires_at, revoked_at
FROM refresh_tokens
WHERE token_hash = $1
  AND revoked_at IS NULL
  AND expires_at > NOW()
LIMIT 1;

-- name: RevokeRefreshToken :exec
-- Revoke satu token spesifik (logout atau rotate). tenant_id sebagai
-- parameter WAJIB (SECURITY.md §2B "Aturan Emas SQL") meski token_hash
-- sendiri unik secara global — pertahanan berlapis, bukan cuma soal
-- tereksploitasi atau tidak.
UPDATE refresh_tokens
SET revoked_at = NOW()
WHERE tenant_id = $1 AND token_hash = $2 AND revoked_at IS NULL;

-- name: RevokeAllUserTokens :exec
-- Revoke semua token aktif milik user (logout-all / compromised account).
UPDATE refresh_tokens
SET revoked_at = NOW()
WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL;

-- name: RegisterTenantOwner :one
-- sqlc-vet-disable: wajib-tenant-scope
-- Buat tenant baru + user owner sekaligus dalam satu transaksi (dipanggil
-- dari handler POST /auth/register). Query ini hanya untuk registrasi awal —
-- tenant_id belum ada, jadi dikecualikan dari aturan wajib-tenant-scope.
INSERT INTO users (id, tenant_id, name, email, password_hash, role)
VALUES ($1, $2, $3, $4, $5, 'owner')
RETURNING id;
