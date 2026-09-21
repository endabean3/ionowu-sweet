import { type BarisCetak, row, wrap } from "@/lib/receipt/escpos";
import { rupiah } from "@/lib/receipt/format";
import Decimal from "decimal.js";
import type { LaporanHarian } from "./api";

/**
 * Susunan baris laporan tutup buku (Z-Report).
 *
 * Dipisah dari jalur cetak dengan alasan yang sama seperti bitmap logo
 * (CHANGELOG 1.29.0): yang dilihat pemilik di layar HARUS byte-per-byte sama
 * dengan yang keluar dari printer. Kalau pratinjau dan hasil cetak disusun
 * dua kode berbeda, keduanya akan berbeda cepat atau lambat — dan laporan
 * yang berbeda dari cetakannya adalah laporan yang tidak bisa dipercaya.
 */
export type BarisLaporan = BarisCetak;

const SATUAN_BAYAR: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  debit: "Debit",
  credit: "Kartu kredit",
};

const tanggalPanjang = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));

const jam = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));

/** Kuantitas jual: 450 ml, 0,5 kg, 3 pcs — maksimal 3 desimal (skema 00005). */
const kuantitas = (v: string, uom: string) =>
  `${new Decimal(v || 0)
    .toDecimalPlaces(3)
    .toNumber()
    .toLocaleString("id-ID", { maximumFractionDigits: 3 })} ${uom}`;

export interface KepalaLaporan {
  namaToko: string;
  alamat?: string | null;
  /** Siapa yang mencetak — laporan tutup buku ditandatangani seseorang. */
  dicetakOleh: string;
  /** ISO; dibiarkan sebagai parameter supaya uji tidak bergantung jam nyata. */
  dicetakPada: string;
}

/**
 * Menyusun seluruh laporan menjadi baris siap cetak selebar `lebar` kolom
 * (32 untuk kertas 58 mm, 48 untuk 80 mm).
 *
 * Urutannya disengaja: angka yang dicocokkan pemilik dengan UANG FISIK
 * (pembayaran, kas laci) datang sebelum angka yang hanya informatif
 * (terlaris). Pemilik yang berdiri di depan laci sudah punya jawabannya di
 * separuh atas kertas dan tidak perlu menggulung nota sampai habis.
 */
export function barisZReport(
  data: LaporanHarian,
  kepala: KepalaLaporan,
  lebar: number,
): BarisLaporan[] {
  const out: BarisLaporan[] = [];
  const teks = (t: string) => out.push({ teks: t });
  const judul = (t: string) => out.push({ teks: t, tebal: true });
  const tengah = (t: string, tebal = false) => out.push({ teks: t, tebal, tengah: true });
  const pisah = () => teks("-".repeat(lebar));
  const pasangan = (kiri: string, kanan: string) => {
    for (const l of row(kiri, kanan, lebar)) teks(l);
  };

  for (const l of wrap(kepala.namaToko, lebar)) tengah(l, true);
  if (kepala.alamat?.trim()) for (const l of wrap(kepala.alamat, lebar)) tengah(l);
  tengah("LAPORAN TUTUP BUKU", true);
  pisah();

  const sampaiIso = data.periode.sampai;
  // `sampai` dari server adalah batas EKSKLUSIF (tengah malam hari
  // berikutnya). Mencetaknya apa adanya membuat laporan 20 Sep berbunyi
  // "20 Sep - 21 Sep" dan pemilik mengira penjualan dua hari tercampur.
  const sampaiTampil = new Date(new Date(sampaiIso).getTime() - 1000).toISOString();
  const dariTgl = tanggalPanjang(data.periode.dari);
  const sampaiTgl = tanggalPanjang(sampaiTampil);
  teks(dariTgl === sampaiTgl ? `Periode : ${dariTgl}` : `Periode : ${dariTgl} - ${sampaiTgl}`);
  teks(`Dicetak : ${tanggalPanjang(kepala.dicetakPada)} ${jam(kepala.dicetakPada)}`);
  for (const l of wrap(`Oleh    : ${kepala.dicetakOleh}`, lebar)) teks(l);
  pisah();

  const r = data.ringkasan;
  judul("PENJUALAN");
  pasangan("Transaksi", String(r.transaksi));
  pasangan("Baris barang", String(r.baris_barang));
  pasangan("Kotor", rupiah(r.penjualan_kotor));
  if (!new Decimal(r.diskon || 0).isZero()) pasangan("Diskon", `-${rupiah(r.diskon)}`);
  if (!new Decimal(r.pajak || 0).isZero()) pasangan("Pajak", rupiah(r.pajak));
  pasangan("BERSIH", rupiah(r.penjualan_bersih));
  pisah();

  judul("PEMBAYARAN");
  if (data.pembayaran.length === 0) {
    teks("Belum ada pembayaran.");
  } else {
    for (const p of data.pembayaran) {
      const label = SATUAN_BAYAR[p.payment_method] ?? p.payment_method;
      pasangan(`${label} (${p.payment_count})`, rupiah(p.total));
    }
  }
  pisah();

  judul("KAS LACI");
  pasangan("Penjualan tunai", rupiah(data.kas.tunai));
  pasangan("Kas masuk", rupiah(data.kas.kas_masuk));
  pasangan("Kas keluar", `-${rupiah(data.kas.kas_keluar)}`);
  if (r.refund_jumlah > 0) pasangan(`Refund (${r.refund_jumlah})`, `-${rupiah(r.refund_nilai)}`);
  pisah();

  // Void & refund TIDAK dilewati saat nol: pemilik yang melihat "Void 0"
  // tahu angkanya memang nol. Baris yang hilang tidak bisa dibedakan dari
  // fitur yang rusak.
  judul("KOREKSI");
  pasangan(`Void (${r.void_jumlah})`, rupiah(r.void_nilai));
  pasangan(`Refund (${r.refund_jumlah})`, rupiah(r.refund_nilai));
  pisah();

  // Invarian §6 #5. Baris ini hanya muncul bila memang ada — nota yang
  // bersih berarti semua transaksi hari itu tiba tepat waktu.
  if (data.terlambat.jumlah > 0) {
    judul("TERLAMBAT MASUK");
    pasangan(`${data.terlambat.jumlah} transaksi`, rupiah(data.terlambat.nilai));
    for (const l of wrap("Tiba setelah shift ditutup; TIDAK termasuk angka di atas.", lebar)) {
      teks(l);
    }
    pisah();
  }

  judul("SHIFT");
  if (data.shift.length === 0) {
    teks("Tidak ada shift di periode ini.");
  } else {
    for (const s of data.shift) {
      const rentang = `${jam(s.opened_at)}-${s.closed_at ? jam(s.closed_at) : "sekarang"}`;
      for (const l of wrap(`${s.cashier_name ?? "Kasir"} ${rentang}`, lebar)) teks(l);
      pasangan("  Modal awal", rupiah(s.opening_cash));
      if (s.status === "open") {
        // Shift terbuka belum punya expected/counted. Menampilkannya sebagai
        // "Rp 0" akan terbaca sebagai laci kosong, bukan sebagai belum tutup.
        teks("  MASIH TERBUKA - belum final");
      } else {
        pasangan("  Diharapkan", rupiah(s.expected_cash ?? "0"));
        pasangan("  Dihitung", rupiah(s.counted_cash ?? "0"));
        pasangan("  Selisih", rupiah(s.variance ?? "0"));
      }
    }
  }
  pisah();

  judul("TERLARIS");
  if (data.terlaris.length === 0) {
    teks("Belum ada barang terjual.");
  } else {
    data.terlaris.forEach((t, i) => {
      const nama =
        t.variant_name && t.variant_name !== "Default"
          ? `${t.product_name} - ${t.variant_name}`
          : t.product_name;
      for (const l of wrap(`${i + 1}. ${nama}`, lebar)) teks(l);
      pasangan(`   ${kuantitas(t.quantity_sold, t.uom)}`, rupiah(t.revenue));
    });
  }
  pisah();

  // Ruang tanda tangan: laporan tutup buku dipegang pemilik sebagai bukti
  // serah-terima laci, dan kertas termal tanpa tempat tanda tangan membuat
  // orang menandatangani di pinggir yang tintanya cepat hilang.
  teks("Kasir              Pemilik");
  teks("");
  teks("");
  teks("(          )     (          )");
  tengah("--- TUTUP BUKU ---");

  return out;
}

/** Laporan sebagai teks polos — untuk pratinjau layar dan unduhan. */
export function teksZReport(baris: BarisLaporan[], lebar: number): string {
  return baris
    .map((b) => {
      if (!b.tengah) return b.teks;
      const sisa = Math.max(0, lebar - b.teks.length);
      return " ".repeat(Math.floor(sisa / 2)) + b.teks;
    })
    .join("\n");
}
