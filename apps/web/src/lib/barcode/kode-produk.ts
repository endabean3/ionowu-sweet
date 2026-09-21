/**
 * Kode barcode yang DIBUAT SENDIRI untuk stiker produk.
 *
 * Toko ini tidak menjual barang berbarcode pabrik — parfum dijual per ml dari
 * botol besar — jadi tidak ada EAN-13 yang bisa dipindai. Kodenya kita cetak
 * sendiri di stiker 30 × 50 mm.
 *
 * Panjangnya 8 karakter, dan itu bukan angka sembarangan. Lebar modul CODE128
 * pada stiker 30 mm (28 mm setelah margin) adalah 28 / (55 + 11n) mm; pada
 * n = 8 hasilnya 0,20 mm — di bawah batas aman 0,25 mm untuk pemindai murah.
 * Karena itu batangnya dicetak DIPUTAR 90°, memakai sisi 50 mm: 48 / 143 =
 * 0,34 mm, lega. Kalau panjang kode ditambah, hitungan ini harus diulang.
 *
 * Abjadnya Crockford base32 tanpa I, L, O, U: empat huruf itu paling sering
 * tertukar dengan 1, 1, 0, dan V saat kasir membacanya dari stiker yang
 * tergores. U dibuang juga karena Crockford membuangnya agar tidak membentuk
 * kata yang tidak pantas secara tidak sengaja.
 */

/** 32 karakter, tanpa I, L, O, U. */
const ABJAD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const PANJANG_KODE = 8;

/**
 * Kode acak 8 karakter.
 *
 * Acak, bukan berurutan: nomor urut membocorkan berapa banyak produk yang
 * dimiliki toko dan urutan masuknya, dan stiker yang tertukar antara dua
 * produk bernomor berdekatan tidak akan pernah ketahuan. Ruangnya 32^8 ≈ 1,1
 * triliun, jadi untuk ratusan produk tabrakan praktis tidak terjadi — dan
 * kalaupun terjadi, indeks unik `idx_variants_barcode` menolaknya dan
 * pemanggil tinggal meminta kode baru.
 */
export function kodeProdukBaru(acak: (n: number) => Uint8Array = acakAman): string {
  const bytes = acak(PANJANG_KODE);
  let kode = "";
  // 256 bukan kelipatan 32? 256 = 32 × 8 — jadi modulo di sini TIDAK berat
  // sebelah, tiap karakter punya peluang sama persis.
  for (let i = 0; i < PANJANG_KODE; i++) kode += ABJAD[bytes[i] % 32];
  return kode;
}

function acakAman(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/**
 * Membetulkan kode yang diketik manual saat stikernya rusak.
 *
 * Sama seperti di web toko: huruf yang tidak ada di abjad selalu salah baca,
 * bukan kode sah yang dirusak. Mengembalikan "" bila bentuknya tetap salah.
 */
export function rapikanKodeProduk(mentah: string): string {
  const bersih = mentah
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V");
  if (bersih.length !== PANJANG_KODE) return "";
  for (const c of bersih) if (!ABJAD.includes(c)) return "";
  return bersih;
}
