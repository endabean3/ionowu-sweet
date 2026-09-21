import { encodeReportLines, printedText } from "@/lib/receipt/escpos";
import { describe, expect, it } from "vitest";
import type { LaporanHarian } from "./api";
import { type KepalaLaporan, barisZReport, teksZReport } from "./zreport";

const KEPALA: KepalaLaporan = {
  namaToko: "Warung Wangi",
  alamat: "Jl. Melati 12",
  dicetakOleh: "Pemilik",
  dicetakPada: "2026-09-20T14:05:00+07:00",
};

const KOSONG: LaporanHarian = {
  periode: { dari: "2026-09-20T00:00:00+07:00", sampai: "2026-09-21T00:00:00+07:00" },
  ringkasan: {
    transaksi: 0,
    baris_barang: 0,
    penjualan_kotor: "0",
    diskon: "0",
    pajak: "0",
    penjualan_bersih: "0",
    void_jumlah: 0,
    void_nilai: "0",
    refund_jumlah: 0,
    refund_nilai: "0",
  },
  kas: { tunai: "0", kas_masuk: "0", kas_keluar: "0" },
  pembayaran: [],
  terlambat: { jumlah: 0, nilai: "0" },
  shift: [],
  terlaris: [],
};

const ISI: LaporanHarian = {
  ...KOSONG,
  ringkasan: {
    transaksi: 12,
    baris_barang: 27,
    penjualan_kotor: "450000",
    diskon: "10000",
    pajak: "0",
    penjualan_bersih: "440000",
    void_jumlah: 1,
    void_nilai: "15000",
    refund_jumlah: 2,
    refund_nilai: "30000",
  },
  kas: { tunai: "300000", kas_masuk: "50000", kas_keluar: "20000" },
  pembayaran: [
    { payment_method: "cash", payment_count: 8, total: "300000" },
    { payment_method: "qris", payment_count: 4, total: "140000" },
  ],
  terlambat: { jumlah: 2, nilai: "45000" },
  shift: [
    {
      id: "01SHIFT",
      opened_at: "2026-09-20T08:00:00+07:00",
      closed_at: "2026-09-20T16:00:00+07:00",
      opening_cash: "150000",
      expected_cash: "420000",
      counted_cash: "415000",
      variance: "-5000",
      status: "closed",
      cashier_name: "Budi",
    },
  ],
  terlaris: [
    {
      product_name: "Bibit Parfum Vanilla",
      variant_name: "Default",
      uom: "ml",
      quantity_sold: "450.000",
      revenue: "225000",
    },
  ],
};

const teks = (d: LaporanHarian, lebar = 32) => teksZReport(barisZReport(d, KEPALA, lebar), lebar);

describe("barisZReport", () => {
  it("tidak ada baris yang melebihi lebar kertas", () => {
    for (const lebar of [32, 48]) {
      for (const b of barisZReport(ISI, KEPALA, lebar)) {
        expect(b.teks.length, `"${b.teks}"`).toBeLessThanOrEqual(lebar);
      }
    }
  });

  it("memuat angka induk penjualan", () => {
    const t = teks(ISI);
    expect(t).toContain("Rp 450.000");
    expect(t).toContain("-Rp 10.000");
    expect(t).toContain("Rp 440.000");
    expect(t).toContain("Warung Wangi");
  });

  it("merinci tiap metode bayar dengan jumlah transaksinya", () => {
    const t = teks(ISI);
    expect(t).toContain("Tunai (8)");
    expect(t).toContain("QRIS (4)");
  });

  // Invarian §6 #5 — inti seluruh laporan ini.
  it("memisahkan transaksi terlambat dan menyatakan ia TIDAK ikut dihitung", () => {
    const t = teks(ISI);
    expect(t).toContain("TERLAMBAT MASUK");
    expect(t).toContain("2 transaksi");
    expect(t).toContain("TIDAK termasuk");
  });

  it("tidak mencetak bagian terlambat bila memang tidak ada", () => {
    expect(teks(KOSONG)).not.toContain("TERLAMBAT");
  });

  // Baris yang hilang tidak bisa dibedakan dari fitur yang rusak.
  it("tetap mencetak Void & Refund walau nol", () => {
    const t = teks(KOSONG);
    expect(t).toContain("Void (0)");
    expect(t).toContain("Refund (0)");
  });

  it("periode satu hari tidak dicetak sebagai rentang dua hari", () => {
    const t = teks(KOSONG);
    expect(t).toContain("Periode : 20 Sep 2026");
    expect(t).not.toContain("21 Sep");
  });

  it("shift yang masih terbuka ditandai belum final, bukan Rp 0", () => {
    const t = teks({
      ...ISI,
      shift: [
        {
          id: "01SHIFT",
          opened_at: "2026-09-20T08:00:00+07:00",
          closed_at: null,
          opening_cash: "150000",
          expected_cash: null,
          counted_cash: null,
          variance: null,
          status: "open",
          cashier_name: "Budi",
        },
      ],
    });
    expect(t).toContain("MASIH TERBUKA");
    expect(t).not.toContain("Dihitung");
  });

  it("varian bernama Default tidak ikut dicetak di daftar terlaris", () => {
    const t = teks(ISI);
    expect(t).toContain("Bibit Parfum Vanilla");
    expect(t).not.toContain("- Default");
    expect(t).toContain("450 ml");
  });

  it("laporan kosong tetap terbaca, bukan halaman kosong", () => {
    const t = teks(KOSONG);
    expect(t).toContain("Belum ada pembayaran.");
    expect(t).toContain("Tidak ada shift di periode ini.");
    expect(t).toContain("Belum ada barang terjual.");
  });
});

describe("encodeReportLines", () => {
  // Alasan modul ini dipisah: pratinjau layar dan hasil cetak WAJIB identik.
  it("byte yang dikirim ke printer memuat teks yang sama dengan pratinjau", () => {
    const baris = barisZReport(ISI, KEPALA, 32);
    const dicetak = printedText(encodeReportLines(baris, 58));
    for (const b of baris) {
      if (b.teks.trim()) expect(dicetak).toContain(b.teks.trim());
    }
  });

  it("diakhiri perintah potong kertas", () => {
    const bytes = encodeReportLines(barisZReport(KOSONG, KEPALA, 32), 58);
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });
});
