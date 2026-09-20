-- +goose Up
-- Void transaksi: barang kembali ke rak karena transaksinya DIBATALKAN, bukan
-- dikembalikan pembeli. Tanpa jenis sendiri, pembatalan tercampur dengan
-- 'refund' di laporan stok, dan dua kejadian yang berbeda maknanya bagi
-- pemilik (salah input vs pembeli mengembalikan barang) tidak bisa dipisahkan.
--
-- Melebarkan CHECK: semua baris yang ada tetap sah, jadi tidak ada data yang
-- perlu diperbaiki. NOT VALID + VALIDATE menghindari kunci tulis panjang di
-- tabel ledger yang terus bertambah.
ALTER TABLE stock_events DROP CONSTRAINT stock_events_event_type_check;
ALTER TABLE stock_events
    ADD CONSTRAINT stock_events_event_type_check
    CHECK (event_type IN ('sale','refund','void','restock','opname_adjust',
                          'waste','transfer_in','transfer_out','repack_in','repack_out'))
    NOT VALID;
ALTER TABLE stock_events VALIDATE CONSTRAINT stock_events_event_type_check;

-- +goose Down
ALTER TABLE stock_events DROP CONSTRAINT stock_events_event_type_check;
ALTER TABLE stock_events
    ADD CONSTRAINT stock_events_event_type_check
    CHECK (event_type IN ('sale','refund','restock','opname_adjust',
                          'waste','transfer_in','transfer_out','repack_in','repack_out'));
