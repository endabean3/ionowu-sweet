import { code128Bars } from "./code128";

/**
 * Tata letak stiker barcode produk di kertas stiker A4 biasa.
 *
 * Pemilik mencetak di printer kertas biasa lalu memotong sendiri, jadi yang
 * dibutuhkan bukan gulungan die-cut melainkan grid rapi dengan garis potong.
 * Semua ukuran di sini MILIMETER, dan SVG-nya memakai mm sebagai satuan
 * viewBox supaya apa yang tercetak benar-benar sebesar yang tertulis —
 * ukuran stiker tidak boleh ikut berubah kalau pengaturan zoom peramban
 * berubah.
 */

/** Ukuran stiker yang diminta pemilik. */
export const STIKER = { lebar: 30, tinggi: 50 } as const;

/** A4. */
export const KERTAS = { lebar: 210, tinggi: 297 } as const;

/**
 * Margin kertas 10 mm: hampir semua printer rumahan tidak bisa mencetak
 * sampai tepi, dan stiker yang terpotong printer terbuang percuma.
 */
export const MARGIN = 10;

export const KOLOM = Math.floor((KERTAS.lebar - MARGIN * 2) / STIKER.lebar);
export const BARIS = Math.floor((KERTAS.tinggi - MARGIN * 2) / STIKER.tinggi);
export const PER_LEMBAR = KOLOM * BARIS;

/**
 * Lebar strip CODE128 di sisi kiri stiker. Batangnya DIPUTAR 90°: sumbu
 * panjang simbol memakai tinggi stiker, bukan lebarnya. Lihat kode-produk.ts
 * untuk kenapa — pada lebar 30 mm, mendatar modulnya cuma 0,20 mm.
 */
export const STRIP_CODE128 = 8;

/** Sisa ruang untuk nama, harga, QR, dan kode yang bisa dibaca manusia. */
export const ISI = { x: STRIP_CODE128, lebar: STIKER.lebar - STRIP_CODE128 } as const;

/** Batas aman lebar satu modul untuk pemindai murah dan kamera HP. */
export const MODUL_MINIMUM_MM = 0.25;

/**
 * Lebar satu modul CODE128 bila simbol `kode` dipasang memanjang `panjangMm`,
 * sudah termasuk zona tenang 10 modul di dua ujung.
 *
 * Zona tenang bukan hiasan: tanpa ruang kosong itu pemindai tidak tahu di mana
 * simbolnya mulai, dan stiker yang dipotong mepet batang jadi tidak terbaca.
 */
export function lebarModulMm(kode: string, panjangMm: number): number {
  const { total } = code128Bars(kode);
  return panjangMm / (total + 20);
}

/** Geometri satu stiker ke-i pada lembar (0-based dalam lembar itu). */
export function posisiStiker(i: number): { x: number; y: number } {
  const kolom = i % KOLOM;
  const baris = Math.floor(i / KOLOM);
  return {
    x: MARGIN + kolom * STIKER.lebar,
    y: MARGIN + baris * STIKER.tinggi,
  };
}

/** Memecah daftar stiker menjadi lembar-lembar A4. */
export function keLembar<T>(item: T[]): T[][] {
  const lembar: T[][] = [];
  for (let i = 0; i < item.length; i += PER_LEMBAR) lembar.push(item.slice(i, i + PER_LEMBAR));
  return lembar;
}

/**
 * Batang CODE128 sebagai persegi panjang, sudah diputar 90° dan diskalakan ke
 * milimeter — siap ditaruh apa adanya di dalam `<g>` stiker.
 *
 * Hasilnya bergerak sepanjang sumbu Y (memanjang ke bawah), dengan tebal
 * `tebalMm` pada sumbu X.
 */
export function batangTegak(
  kode: string,
  panjangMm: number,
  tebalMm: number,
): { y: number; tinggi: number; tebal: number }[] {
  const { bars, total } = code128Bars(kode);
  const modul = panjangMm / (total + 20);
  const tenang = 10 * modul;
  return bars.map((b) => ({
    y: tenang + b.x * modul,
    tinggi: b.w * modul,
    tebal: tebalMm,
  }));
}
