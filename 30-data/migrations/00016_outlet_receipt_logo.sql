-- +goose Up
-- Logo toko di kepala nota (permintaan pemilik Warung Wangi).
--
-- Yang disimpan BUKAN berkas gambar asli, melainkan bitmap 1-bit yang sudah
-- siap dikirim ke printer termal: "<lebar>,<tinggi>,<base64 baris-bit>",
-- persis tata letak `GS v 0` (8 titik per byte, bit paling kiri = MSB).
--
-- Alasannya: printer termal hanya hitam-putih, dan mengubah PNG berwarna
-- menjadi 1-bit di tengah antrean cetak membuat pembeli menunggu. Konversi
-- (skala + dithering) dilakukan SEKALI di peramban saat pemilik mengunggah.
-- Nota browser memakai bitmap yang sama, jadi hasil layar = hasil cetak.
--
-- Ukurannya dibatasi di aplikasi (≤ 576 titik lebar, ≤ 240 titik tinggi ≈
-- 17 KB base64) supaya satu nota tidak lama dikirim lewat Bluetooth.
--
-- EXPAND murni: kolom nullable tanpa DEFAULT.
ALTER TABLE outlets ADD COLUMN receipt_logo TEXT;

-- +goose Down
ALTER TABLE outlets DROP COLUMN receipt_logo;
