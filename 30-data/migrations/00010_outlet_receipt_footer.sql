-- +goose Up
-- Teks penutup struk per outlet ("Terima kasih, selamat wangi!", akun
-- Instagram, kebijakan tukar barang). Alamat & telepon struk memakai kolom
-- outlets.address / outlets.phone yang sudah ada sejak 00001.
--
-- EXPAND murni: kolom baru boleh NULL, tanpa default yang menulis ulang
-- tabel, jadi aman dijalankan sebelum kode barunya dirilis
-- (MIGRATIONS.md §3). NULL = struk memakai penutup bawaan "Terima kasih".
ALTER TABLE outlets ADD COLUMN receipt_footer VARCHAR(200);

-- +goose Down
ALTER TABLE outlets DROP COLUMN receipt_footer;
