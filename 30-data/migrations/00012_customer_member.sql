-- +goose Up
-- Member pelanggan (Warung Wangi): kode member ber-barcode, akun sosial media,
-- konfirmasi "sudah follow akun toko", dan penanda merchandise pembelian
-- pertama. Tabel customers sudah ada sejak 00004 — ini EXPAND murni: semua
-- kolom baru boleh NULL atau ber-DEFAULT konstanta (tanpa tulis ulang tabel).

-- Kode yang dicetak sebagai barcode di nota dan dipindai kasir. Dibuat di
-- PERANGKAT (member bisa didaftarkan saat offline), jadi keunikannya dijaga
-- di sini: tabrakan ditolak saat sync, bukan diam-diam menggabungkan dua orang.
ALTER TABLE customers ADD COLUMN member_code VARCHAR(20);
CREATE UNIQUE INDEX idx_customers_member_code
    ON customers (tenant_id, member_code) WHERE member_code IS NOT NULL;

ALTER TABLE customers ADD COLUMN social_handle VARCHAR(100);
ALTER TABLE customers ADD COLUMN follows_store_social BOOLEAN NOT NULL DEFAULT FALSE;
-- Diisi pada transaksi PERTAMA member: dasar pengingat "beri merchandise
-- pembelian pertama" di kasir.
ALTER TABLE customers ADD COLUMN merchandise_given_at TIMESTAMPTZ;

-- Akun media sosial toko yang wajib di-follow calon member (mis. TikTok).
ALTER TABLE outlets ADD COLUMN social_handle VARCHAR(100);

-- +goose Down
ALTER TABLE outlets DROP COLUMN social_handle;
ALTER TABLE customers DROP COLUMN merchandise_given_at;
ALTER TABLE customers DROP COLUMN follows_store_social;
ALTER TABLE customers DROP COLUMN social_handle;
DROP INDEX IF EXISTS idx_customers_member_code;
ALTER TABLE customers DROP COLUMN member_code;
