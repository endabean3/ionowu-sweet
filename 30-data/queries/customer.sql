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

-- name: ListMembers :many
-- Daftar member untuk layar /member. Berbeda dari ListCustomersForSync:
-- yang ini dibaca pemilik di satu layar (bukan dicermin ke tiap perangkat),
-- jadi ia boleh mencari, menghitung belanja, dan dibatasi halaman.
--
-- Email & tanggal lahir TETAP tidak ikut — bukan karena perangkat, tetapi
-- karena tidak ada satu pun fitur yang memakainya (DATA-MODEL §5). Kolom
-- yang tidak pernah dibaca lebih baik tidak pernah dikirim.
SELECT
    c.id, c.name, c.phone, c.member_code, c.social_handle,
    c.follows_store_social, c.merchandise_given_at,
    c.first_seen_at, c.last_seen_at,
    COALESCE(b.jumlah, 0)::int      AS jumlah_transaksi,
    COALESCE(b.belanja, 0)::decimal AS total_belanja
FROM customers c
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS jumlah, SUM(s.grand_total) AS belanja
    FROM sales_transactions s
    WHERE s.tenant_id = c.tenant_id
      AND s.customer_id = c.id
      AND s.payment_status = 'paid'
      AND NOT s.is_sandbox
) b ON TRUE
WHERE c.tenant_id = $1
  AND c.is_active
  AND c.merged_into_id IS NULL
  AND c.member_code IS NOT NULL
  AND (sqlc.narg('cari')::text IS NULL
       OR c.member_code ILIKE '%' || sqlc.narg('cari')::text || '%'
       OR c.phone       ILIKE '%' || sqlc.narg('cari')::text || '%'
       OR c.name        ILIKE '%' || sqlc.narg('cari')::text || '%')
ORDER BY c.last_seen_at DESC NULLS LAST, c.first_seen_at DESC
LIMIT sqlc.arg('batas')::int;

-- name: UpdateMember :execrows
-- Koreksi data member dari layar /member. Nomor WA IKUT bisa diperbaiki —
-- salah ketik satu digit berarti pengingat WA kelak sampai ke orang lain.
-- Kode member TIDAK pernah diubah: barcodenya sudah tercetak di nota yang
-- dipegang pelanggan.
UPDATE customers
SET name                 = COALESCE(sqlc.narg('name'), name),
    phone                = COALESCE(sqlc.narg('phone'), phone),
    social_handle        = COALESCE(sqlc.narg('social_handle'), social_handle),
    merchandise_given_at = CASE
        WHEN sqlc.narg('merchandise')::boolean IS NULL THEN merchandise_given_at
        WHEN sqlc.narg('merchandise')::boolean THEN COALESCE(merchandise_given_at, now())
        ELSE NULL
    END
WHERE tenant_id = $1 AND id = $2 AND merged_into_id IS NULL;

-- name: LookupMember :one
-- Satu member dari kode ATAU nomor WA, untuk layar kasir.
--
-- Endpoint ini ada karena cermin lokal perangkat hanya diperbarui saat
-- /sync/pull. Member yang baru mendaftar sendiri lewat QR nota di web toko
-- ada di SERVER, bukan di antrean perangkat — jadi kasir yang mengetik
-- kodenya lima menit kemudian tidak menemukan siapa pun, dan pelanggan yang
-- baru saja mendaftar ditolak di meja kasir.
--
-- Kolomnya PERSIS sama dengan ListCustomersForSync: tidak ada riwayat
-- belanja, email, atau tanggal lahir. Kasir boleh mengenali member, bukan
-- membaca berapa uang yang pernah ia belanjakan (RBAC-MODEL §CRM).
SELECT id, name, phone, member_code, social_handle, follows_store_social, merchandise_given_at
FROM customers
WHERE tenant_id = $1
  AND is_active
  AND merged_into_id IS NULL
  AND member_code IS NOT NULL
  AND (member_code = sqlc.arg('kode')::text OR phone = sqlc.arg('wa')::text)
LIMIT 1;
