import { describe, expect, it } from "vitest";
import { penjelasan } from "./antrean-gagal";

describe("penjelasan galat antrean", () => {
  it("mengenali shift lama yang belum ditutup — galat yang memblokir toko 3 hari", () => {
    // Pesan ASLI dari server pada 19-22 Sep 2026.
    const asli = "kasir sudah memiliki shift terbuka lain di outlet ini — tutup shift itu dulu";
    expect(penjelasan(asli)).toContain("Tutup shift itu dulu");
  });

  it("mengenali penjualan yang tersangkut karena shift-nya belum ada", () => {
    const asli =
      'gagal mencatat transaksi: ERROR: insert or update on table "sales_transactions" violates foreign key constraint "sales_transactions_shift_id_fkey" (SQLSTATE 23503)';
    expect(penjelasan(asli)).toContain("menunggu shift-nya terkirim");
  });

  it("mengenali data yang sudah ada di server", () => {
    expect(penjelasan("duplicate key value violates unique constraint")).toContain("sudah ada");
    expect(penjelasan("ERROR: ... (SQLSTATE 23505)")).toContain("sudah ada");
  });

  it("mengembalikan null untuk galat yang belum dikenali", () => {
    // Penting: null berarti UI hanya menampilkan pesan mentah, bukan menebak.
    expect(penjelasan("galat aneh yang belum pernah terjadi")).toBeNull();
  });
});
