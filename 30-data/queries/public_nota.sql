-- Halaman nota publik (ADR-0013). Dibaca TANPA login oleh server web toko,
-- berbekal (tenant_id, id nota) dari QR di nota. Aturan emas tetap berlaku:
-- setiap kueri memfilter tenant_id — id nota saja TIDAK cukup.
--
-- Yang boleh keluar dari sini: data toko, isi nota, dan APA YANG SUDAH
-- TERCETAK DI KERTAS NOTA ITU SENDIRI. Yang TIDAK: kasir, HPP, riwayat
-- belanja, nomor WhatsApp, atau apa pun milik nota lain.
--
-- Batas "sudah tercetak di kertas" itu yang mengizinkan kode & nama member
-- ikut keluar (lihat GetPublicNota): nota member mencetak
-- "Member M-XXXXXX (Nama)" beserta barcode CODE128-nya (escpos.ts), jadi
-- siapa pun yang bisa menyusun URL ini SUDAH memegang kertas yang memuat
-- keduanya. Nomor WA TIDAK pernah tercetak, dan karena itu tidak pernah
-- dikembalikan — meski ia kolom yang bersebelahan di tabel yang sama.

-- name: GetPublicNota :one
SELECT
    s.id, s.receipt_number, s.grand_total, s.payment_status,
    COALESCE(s.offline_created_at_adj, s.offline_created_at, s.created_at)::timestamptz AS sold_at,
    (s.customer_id IS NOT NULL)::BOOLEAN AS has_member,
    -- Kartu member untuk halaman nota (opsi tanpa login). NULL bila nota ini
    -- bukan atas nama member. `merchandise_given` tidak tercetak di kertas,
    -- tetapi ia hanya menjawab "apakah merchandise perdana sudah diambil"
    -- untuk member yang notanya sedang dipegang — tidak membuka riwayat
    -- belanja apa pun.
    cust.member_code,
    cust.name AS member_name,
    (cust.merchandise_given_at IS NOT NULL)::BOOLEAN AS member_merchandise_given,
    EXISTS (
        SELECT 1 FROM refunds r WHERE r.tenant_id = s.tenant_id AND r.transaction_id = s.id
    )::BOOLEAN AS refunded,
    EXISTS (
        SELECT 1 FROM customers c WHERE c.tenant_id = s.tenant_id AND c.signup_sale_id = s.id
    )::BOOLEAN AS signup_used,
    o.name AS outlet_name, o.address AS outlet_address, o.phone AS outlet_phone,
    o.warranty_days, o.social_handle, o.timezone
FROM sales_transactions s
JOIN outlets o ON o.id = s.outlet_id AND o.tenant_id = s.tenant_id
-- Member yang terkait nota ini, lewat DUA jalan yang keduanya berarti
-- "orang yang memegang kertas ini":
--   1. kasir menempelkan member saat checkout  → s.customer_id
--   2. ia mendaftar DARI nota ini di halaman publik → signup_sale_id
-- Jalan kedua wajib ada: pendaftaran lewat nota TIDAK mengisi customer_id
-- nota itu, jadi tanpa ini kartu member justru tidak pernah muncul bagi
-- orang yang baru saja mendaftar — satu-satunya saat ia paling ingin
-- menyimpan kodenya.
--
-- Keduanya tidak bisa terisi sekaligus: nota yang sudah atas nama member
-- tidak pernah boleh dipakai mendaftar (bolehDaftar di public_nota.go),
-- dan LIMIT 1 membuat hasilnya tetap deterministik bila kelak berubah.
LEFT JOIN LATERAL (
    SELECT c.member_code, c.name, c.merchandise_given_at
    FROM customers c
    WHERE c.tenant_id = s.tenant_id
      AND c.is_active
      AND c.merged_into_id IS NULL
      AND (c.id = s.customer_id OR c.signup_sale_id = s.id)
    ORDER BY (c.id = s.customer_id) DESC
    LIMIT 1
) cust ON TRUE
WHERE s.tenant_id = $1 AND s.id = $2 AND NOT s.is_sandbox;

-- name: ListPublicNotaItems :many
SELECT p.name AS product_name, v.name AS variant_name, si.quantity, si.uom, si.subtotal
FROM sales_items si
JOIN variants v ON v.id = si.variant_id AND v.tenant_id = si.tenant_id
JOIN products p ON p.id = v.product_id AND p.tenant_id = v.tenant_id
WHERE si.tenant_id = $1 AND si.transaction_id = $2
ORDER BY si.id
LIMIT 200;

-- name: InsertCustomerFromNota :execrows
-- Satu pendaftaran per nota ditegakkan idx_customers_signup_sale; nomor WA
-- yang sudah terdaftar ditolak idx_customers_phone. Keduanya galat 23505
-- yang dibedakan dari nama constraint-nya.
INSERT INTO customers (
    id, tenant_id, name, phone, member_code, social_handle, follows_store_social,
    first_seen_at, signup_sale_id
) VALUES (
    $1, $2, sqlc.narg('name'), $3, $4, sqlc.narg('social_handle'), TRUE, now(), $5
);
