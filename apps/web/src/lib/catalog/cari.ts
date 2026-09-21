/**
 * Pencarian barang di kolom "Cari produk / scan barcode" (layar kasir).
 *
 * Dipisah dari komponen supaya bisa diuji: aturannya halus, dan salah
 * sedikit saja berakibat nyata di meja kasir — pencocokan yang terlalu
 * longgar membuat barang masuk keranjang saat kasir sedang MENGETIK nama,
 * pencocokan yang terlalu ketat membuat pemindai tidak menemukan apa pun
 * (keluhan yang memunculkan modul ini).
 */

/** Bentuk minimal yang dibutuhkan; layar kasir mengirim MacaronProduct. */
export interface BarangTercari {
  name: string;
  category: string;
  barcode?: string;
  sku?: string;
}

/**
 * Bentuk baku sebuah kode. Pemindai kerap menambahkan spasi/CR di ujung,
 * dan SKU toko ditulis huruf besar-kecil bercampur ("BBT-01" vs "bbt-01").
 */
export function normalisasiKode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Barang yang barcode ATAU SKU-nya sama PERSIS dengan yang dipindai.
 *
 * Sengaja bukan pencocokan awalan: kasir yang mengetik tidak boleh
 * tiba-tiba kejatuhan barang hanya karena ketikannya sempat melewati
 * sebuah kode yang sah. Barcode unik per tenant (migrasi 00003), jadi
 * kecocokan pertama sudah pasti satu-satunya.
 */
export function cariBarangByKode<T extends BarangTercari>(
  daftar: readonly T[],
  kode: string,
): T | undefined {
  const k = normalisasiKode(kode);
  if (!k) return undefined;
  return daftar.find(
    (b) =>
      (b.barcode && normalisasiKode(b.barcode) === k) || (b.sku && normalisasiKode(b.sku) === k),
  );
}

/**
 * Filter daftar barang untuk grid kasir. Kueri kosong = tampilkan semua.
 * Barcode & SKU ikut dicari sebagian: label yang separuh terkelupas masih
 * bisa diketik angkanya, dan barang yang dipindai tetap tampil di grid
 * meskipun kodenya tidak cocok persis (mis. salah satu digit tak terbaca).
 */
export function cocokPencarian(barang: BarangTercari, kueri: string): boolean {
  const q = kueri.trim().toLowerCase();
  if (q === "") return true;
  return (
    barang.name.toLowerCase().includes(q) ||
    barang.category.toLowerCase().includes(q) ||
    (barang.barcode?.toLowerCase().includes(q) ?? false) ||
    (barang.sku?.toLowerCase().includes(q) ?? false)
  );
}
