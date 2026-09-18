-- name: ListOutlets :many
SELECT id, tenant_id, name, address, phone, is_active, created_at, timezone, business_day_start,
       receipt_footer
FROM outlets
WHERE tenant_id = $1
ORDER BY created_at ASC;

-- name: ListOutletsForUser :many
-- MULTI-OUTLET.md §3: "Ini adalah celah keamanan, bukan fitur Fase 2" — tanpa
-- ini, GET /outlets mengembalikan SELURUH outlet tenant ke siapa pun yang
-- login, termasuk kasir yang seharusnya hanya melihat cabang tempat ia
-- ditugaskan. Seeder (internal/seed) sudah menugaskan owner/manager ke
-- SELURUH outlet dan kasir hanya ke outlet utama, jadi join ini otomatis
-- benar untuk semua peran tanpa cabang kasus khusus di kode Go.
SELECT o.id, o.tenant_id, o.name, o.address, o.phone, o.is_active, o.created_at,
       o.timezone, o.business_day_start, o.receipt_footer
FROM outlets o
JOIN user_outlet_assignments uoa ON uoa.outlet_id = o.id
WHERE uoa.tenant_id = $1 AND uoa.user_id = $2
ORDER BY uoa.is_primary DESC, o.created_at ASC;

-- name: InsertOutlet :one
INSERT INTO outlets (id, tenant_id, name, address, phone, timezone, business_day_start)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, name, address, phone, is_active, created_at, timezone, business_day_start, receipt_footer;

-- name: UpdateOutlet :execrows
-- :execrows, bukan :exec — id yang salah atau milik tenant lain harus
-- menjadi 404, bukan "Outlet diupdate" yang tidak mengubah apa pun.
UPDATE outlets
SET
    name = COALESCE(sqlc.narg('name'), name),
    address = COALESCE(sqlc.narg('address'), address),
    phone = COALESCE(sqlc.narg('phone'), phone),
    timezone = COALESCE(sqlc.narg('timezone'), timezone),
    business_day_start = COALESCE(sqlc.narg('business_day_start'), business_day_start),
    is_active = COALESCE(sqlc.narg('is_active'), is_active),
    receipt_footer = COALESCE(sqlc.narg('receipt_footer'), receipt_footer)
WHERE tenant_id = $1 AND id = $2;
