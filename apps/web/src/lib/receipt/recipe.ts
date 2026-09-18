import Decimal from "decimal.js";

/**
 * Racikan parfum refill: X% bibit + (100 − X)% pelarut per botol.
 * Warung Wangi: 65% bibit : 35% pelarut (Pengaturan → Racikan).
 *
 * Ukuran botol yang ditampilkan — ukuran yang umum dijual. Kasir tetap bebas
 * mengetik jumlah lain.
 */
export const UKURAN_BOTOL_ML = [10, 15, 20, 30, 50, 100] as const;

export interface Takaran {
  botol: number;
  /** ml bibit, 1 desimal. */
  bibit: string;
  /** ml pelarut = botol − bibit, supaya jumlahnya selalu pas satu botol. */
  pelarut: string;
}

/**
 * Takaran per ukuran botol. Bibit dibulatkan 1 desimal (half-up, Decimal —
 * bukan float), pelarut adalah sisanya. [] bila racikan mati (0) atau tidak sah.
 */
export function takaranRacikan(
  bibitPercent: number | null | undefined,
  ukuran: readonly number[] = UKURAN_BOTOL_ML,
): Takaran[] {
  const p = bibitPercent ?? 0;
  if (!Number.isInteger(p) || p <= 0 || p > 100) return [];
  return ukuran.map((botol) => {
    const bibit = new Decimal(botol).times(p).div(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
    return { botol, bibit: bibit.toString(), pelarut: new Decimal(botol).minus(bibit).toString() };
  });
}

/** "19.5" → "19,5" (tampilan Indonesia). */
export function ml(angka: string): string {
  return angka.replace(".", ",");
}
