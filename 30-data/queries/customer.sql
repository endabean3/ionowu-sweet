-- name: InsertCustomerFromSync :execrows
-- Member didaftarkan di PERANGKAT (bisa offline) dengan ULID klien — id
-- adalah kunci idempotensi: kiriman ulang yang sama menghasilkan 0 baris
-- (duplicate), bukan galat. Tabrakan nomor WA / kode member tetap galat
-- unik (idx_customers_phone / idx_customers_member_code) dan DITOLAK.
INSERT INTO customers (
    id, tenant_id, name, phone, member_code, social_handle, follows_store_social,
    first_seen_at, notes
) VALUES (
    $1, $2, sqlc.narg('name'), $3, $4, sqlc.narg('social_handle'), $5, $6, NULL
)
ON CONFLICT (id) DO NOTHING;

-- name: ListCustomersForSync :many
-- Yang dikirim ke perangkat kasir HANYA nama, WA, kode member, akun sosial
-- media, dan status merchandise — bukan email/tanggal lahir/catatan
-- (DATA-MODEL §5 "jangan simpan email & tanggal lahir di perangkat").
SELECT id, name, phone, member_code, social_handle, follows_store_social, merchandise_given_at
FROM customers
WHERE tenant_id = $1 AND is_active AND merged_into_id IS NULL AND member_code IS NOT NULL
ORDER BY created_at
LIMIT 5000;

-- name: CustomerBelongsToTenant :one
-- Foreign key hanya menjamin pelanggan ADA, bukan milik tenant yang sama.
-- Tanpa pemeriksaan ini, penjualan tenant A bisa merujuk pelanggan tenant B.
SELECT EXISTS (
    SELECT 1 FROM customers WHERE tenant_id = $1 AND id = $2 AND merged_into_id IS NULL
);

-- name: MarkCustomerPurchase :one
-- Dipanggil di transaksi penjualan yang sama. merchandise_given_at hanya
-- diisi SEKALI — pada transaksi pertama member — dan tidak pernah ditimpa.
-- Mengembalikan apakah transaksi ini yang pertama.
UPDATE customers
SET last_seen_at = GREATEST(COALESCE(last_seen_at, sqlc.arg('at')::timestamptz), sqlc.arg('at')::timestamptz),
    merchandise_given_at = COALESCE(merchandise_given_at, sqlc.arg('at')::timestamptz)
WHERE tenant_id = $1 AND id = $2
RETURNING merchandise_given_at = sqlc.arg('at')::timestamptz AS pembelian_pertama;
