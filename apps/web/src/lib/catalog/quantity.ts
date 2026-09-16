import Decimal from "decimal.js";

/**
 * Kuantitas jual untuk usaha curah/timbang (arketipe B, CLAUDE.md §2).
 *
 * Warung Wangi menjual parfum **per ml** dan Media Boga menjual bahan kue
 * **per gram** dari karung 25 kg. Keduanya pelanggan yang sudah pasti, dan
 * keduanya mustahil dilayani dengan tombol +/- yang melangkah satu-satu.
 *
 * Sumber kebenaran satuannya adalah kolom `uom_precision` per varian
 * (migrasi 00003, 0–3 angka desimal) yang sudah dikirim server lewat
 * `/sync/pull` — BUKAN daftar satuan yang ditebak di frontend. Varian `pcs`
 * berpresisi 0 dan perilakunya tidak berubah sama sekali: satu ketuk = satu
 * item, tanpa dialog, karena kasir tidak boleh menunggu (CLAUDE.md §5).
 *
 * Semua nilai mengalir sebagai STRING desimal, tidak pernah float
 * (CLAUDE.md §6.3): dari sini ke keranjang, ke calculateCart, lalu apa adanya
 * ke payload sync sebagai `qty`.
 */

/** Varian dengan presisi > 0 dijual dalam pecahan (ml, gram, liter…). */
export function isCurah(uomPrecision: number): boolean {
  return uomPrecision > 0;
}

export class QuantityError extends Error {}

/**
 * Mengubah ketikan kasir menjadi kuantitas yang sah.
 *
 * Menolak — bukan membulatkan diam-diam — bila melebihi presisi satuannya:
 * "0,25 pcs" dan "1,5 ml" pada varian ml-presisi-0 adalah salah input, dan
 * membulatkannya berarti menagih pembeli untuk jumlah yang tidak ia minta.
 */
export function parseQuantity(input: string, uomPrecision: number): Decimal {
  const bersih = input.trim().replace(",", ".");
  if (bersih === "") throw new QuantityError("Jumlah belum diisi");

  let qty: Decimal;
  try {
    qty = new Decimal(bersih);
  } catch {
    throw new QuantityError("Jumlah tidak valid");
  }

  if (!qty.isFinite()) throw new QuantityError("Jumlah tidak valid");
  if (qty.lte(0)) throw new QuantityError("Jumlah harus lebih dari nol");
  if (qty.decimalPlaces() > uomPrecision) {
    throw new QuantityError(
      uomPrecision === 0
        ? "Satuan ini hanya menerima angka bulat"
        : `Maksimal ${uomPrecision} angka di belakang koma`,
    );
  }
  return qty;
}

/** Bentuk simpan: string desimal tanpa nol berlebih ("30", "0.5"). */
export function toQuantityString(qty: Decimal): string {
  return qty.toString();
}

/** Tampilan untuk kasir: "30 ml", "0,5 kg", "2 pcs". */
export function formatQuantity(quantity: string, uom: string): string {
  const angka = new Decimal(quantity || 0).toString().replace(".", ",");
  return `${angka} ${uom}`;
}

/**
 * Pintasan jumlah yang sering dipakai. Ini MURNI kenyamanan UI — kasir selalu
 * bisa mengetik angka lain, dan tidak ada satu pun angka di sini yang
 * mengklaim mewakili harga, stok, atau kebiasaan toko tertentu. Daftarnya
 * dipilih dari besaran satuannya saja.
 */
export function quickQuantities(uom: string): string[] {
  switch (uom.toLowerCase()) {
    case "ml":
      return ["10", "30", "50", "100"];
    case "g":
    case "gram":
      return ["100", "250", "500", "1000"];
    case "kg":
    case "l":
    case "liter":
      return ["0.25", "0.5", "1", "2"];
    default:
      return [];
  }
}
