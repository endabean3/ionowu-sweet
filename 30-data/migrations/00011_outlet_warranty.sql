-- +goose Up
-- Lama garansi (hari) yang dicetak di nota: "Garansi s/d <tanggal beli + N>".
-- 0 = tanpa garansi (bawaan, perilaku lama tidak berubah). Warung Wangi: 7.
--
-- EXPAND murni: ADD COLUMN dengan DEFAULT konstanta tidak menulis ulang
-- tabel sejak Postgres 11 — aman dijalankan sebelum kode barunya.
ALTER TABLE outlets
    ADD COLUMN warranty_days SMALLINT NOT NULL DEFAULT 0
        CHECK (warranty_days BETWEEN 0 AND 365);

-- +goose Down
ALTER TABLE outlets DROP COLUMN warranty_days;
