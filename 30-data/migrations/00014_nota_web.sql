-- +goose Up
-- Halaman nota publik (ADR-0013): QR di nota membuka halaman web toko yang
-- menampilkan ringkasan nota + status garansi, dan menawarkan daftar member.
--
-- outlets.nota_web_url — alamat halaman itu, mis.
--   https://warungwangi.ionowu.com/nota
-- Kosong = nota TIDAK memuat QR (bawaan; tenant lain tidak berubah).
--
-- customers.signup_sale_id — nota yang dipakai mendaftar lewat halaman publik.
-- Indeks unik parsial = SATU pendaftaran per nota: nota adalah satu-satunya
-- "kunci" yang dipegang pengunjung halaman publik, jadi tanpa batas ini satu
-- nota bisa dipakai membuat member tanpa akhir.
--
-- EXPAND murni: kolom nullable tanpa DEFAULT, tanpa tulis ulang tabel.
ALTER TABLE outlets ADD COLUMN nota_web_url VARCHAR(200);

ALTER TABLE customers ADD COLUMN signup_sale_id VARCHAR(26);
CREATE UNIQUE INDEX idx_customers_signup_sale ON customers(tenant_id, signup_sale_id)
    WHERE signup_sale_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_customers_signup_sale;
ALTER TABLE customers DROP COLUMN signup_sale_id;
ALTER TABLE outlets DROP COLUMN nota_web_url;
