import Decimal from "decimal.js";

/**
 * Diskon seluruh transaksi di layar kasir.
 *
 * Dipisah dari komponen supaya bisa diuji: aturan batas 20% menentukan siapa
 * boleh memberi diskon berapa, dan salah sedikit berarti kasir bisa memberi
 * potongan sebesar apa pun tanpa sepengetahuan pemilik.
 */

/** RBAC-MODEL §Matriks: "Diskon manual >20%" butuh PIN manager bagi kasir. */
export const BATAS_DISKON_KASIR = 20;

export class DiskonError extends Error {}

/**
 * Membaca isian diskon menjadi nominal rupiah.
 *
 * Menerima dua bentuk yang sama-sama wajar di warung: nominal ("5000") dan
 * persen ("10%"). Persen dihitung terhadap subtotal dan DIBULATKAN ke rupiah
 * utuh — kembalian tidak pernah mengandung sen, dan menyimpan 4.999,5 akan
 * membuat total di nota berbeda dari total yang ditagihkan.
 */
export function bacaDiskon(teks: string, subtotal: Decimal.Value): Decimal {
  const t = teks.trim().replace(",", ".");
  if (t === "") return new Decimal(0);

  const persen = t.endsWith("%");
  const angka = persen ? t.slice(0, -1).trim() : t;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(angka)) {
    throw new DiskonError("Isi angka, mis. 5000 atau 10%");
  }

  const n = new Decimal(angka);
  const nominal = persen
    ? new Decimal(subtotal).mul(n).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    : n;

  if (nominal.gt(subtotal)) {
    throw new DiskonError("Diskon tidak boleh melebihi total belanja");
  }
  return nominal;
}

/**
 * Berapa persen diskon ini dari subtotal. Subtotal nol menghasilkan 0 —
 * bukan Infinity, yang akan membuat gerbang persetujuan menyala pada
 * keranjang kosong.
 */
export function persenDiskon(nominal: Decimal.Value, subtotal: Decimal.Value): Decimal {
  const s = new Decimal(subtotal);
  if (s.lte(0)) return new Decimal(0);
  return new Decimal(nominal).div(s).mul(100);
}

/**
 * Apakah diskon sebesar ini butuh persetujuan manager?
 *
 * Owner dan manager menyetujui dirinya sendiri. Peran lain di atas batas
 * WAJIB lewat PIN — dan karena PIN diperiksa di server, diskon besar hanya
 * bisa diberikan saat perangkat online. Itu disengaja: satu-satunya
 * alternatif adalah menyimpan hash PIN di setiap ponsel kasir.
 */
export function butuhPersetujuan(role: string | undefined, persen: Decimal.Value): boolean {
  if (role === "owner" || role === "manager") return false;
  return new Decimal(persen).gt(BATAS_DISKON_KASIR);
}
