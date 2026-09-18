-- +goose Up
-- Resep racikan parfum refill: persen BIBIT dalam satu botol; sisanya pelarut.
-- Warung Wangi: 65 (65% bibit : 35% pelarut). Dipakai untuk mencetak tabel
-- takaran per ukuran botol di nota dan pintasan "Botol 30 ml → 19,5 ml" di
-- kasir. 0 = tanpa racikan (bawaan; perilaku tenant lain tidak berubah).
-- EXPAND murni: DEFAULT konstanta, tanpa tulis ulang tabel.
ALTER TABLE outlets
    ADD COLUMN bibit_percent SMALLINT NOT NULL DEFAULT 0
        CHECK (bibit_percent BETWEEN 0 AND 100);

-- +goose Down
ALTER TABLE outlets DROP COLUMN bibit_percent;
