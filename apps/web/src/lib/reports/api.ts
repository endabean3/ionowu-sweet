import { JaringanError } from "@/lib/auth/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * Laporan penjualan harian (tutup buku / Z-Report).
 *
 * Semua nilai uang datang sebagai STRING desimal, bukan number — pembulatan
 * biner pada `Rp 1.234.567,89` adalah cara paling mudah membuat selisih kas
 * yang tidak bisa dijelaskan siapa pun (CLAUDE.md §6 invarian #3).
 */
export interface RingkasanLaporan {
  transaksi: number;
  baris_barang: number;
  penjualan_kotor: string;
  diskon: string;
  pajak: string;
  penjualan_bersih: string;
  void_jumlah: number;
  void_nilai: string;
  refund_jumlah: number;
  refund_nilai: string;
}

export interface BarisPembayaran {
  payment_method: string;
  payment_count: number;
  total: string;
}

export interface BarisShiftLaporan {
  id: string;
  opened_at: string;
  closed_at?: string | null;
  opening_cash: string;
  expected_cash?: string | null;
  counted_cash?: string | null;
  variance?: string | null;
  status: "open" | "closed";
  cashier_name?: string | null;
}

export interface BarisTerlaris {
  product_name: string;
  variant_name: string;
  uom: string;
  quantity_sold: string;
  revenue: string;
}

export interface LaporanHarian {
  periode: { dari: string; sampai: string };
  ringkasan: RingkasanLaporan;
  kas: { tunai: string; kas_masuk: string; kas_keluar: string };
  pembayaran: BarisPembayaran[];
  /** Transaksi hari itu yang tiba SETELAH shift ditutup (invarian §6 #5). */
  terlambat: { jumlah: number; nilai: string };
  shift: BarisShiftLaporan[];
  terlaris: BarisTerlaris[];
}

export class LaporanError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * Laporan satu outlet untuk rentang tanggal (YYYY-MM-DD, inklusif di kedua
 * ujung; server menafsirkannya dalam WIB).
 *
 * Butuh koneksi, dan itu benar: laporan menjumlahkan transaksi SEMUA
 * perangkat kasir. Menghitungnya dari IndexedDB satu ponsel akan melaporkan
 * omzet toko yang lebih kecil dari yang sebenarnya — angka salah yang
 * terlihat meyakinkan, persis kelas kesalahan yang paling mahal di sini.
 */
export async function fetchLaporanHarian(
  accessToken: string,
  outletId: string,
  opsi: { dari?: string; sampai?: string } = {},
): Promise<LaporanHarian> {
  const q = new URLSearchParams({ outlet_id: outletId });
  if (opsi.dari) q.set("dari", opsi.dari);
  if (opsi.sampai) q.set("sampai", opsi.sampai);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/reports/daily?${q}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new JaringanError();
  }
  const b = await res.json().catch(() => null);
  if (!res.ok) {
    throw new LaporanError(b?.error?.message ?? "Gagal memuat laporan", b?.error?.code);
  }
  return b?.data as LaporanHarian;
}
