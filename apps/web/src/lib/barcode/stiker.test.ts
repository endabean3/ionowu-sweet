import { describe, expect, it } from "vitest";
import { kodeProdukBaru } from "./kode-produk";
import {
  BARIS,
  KOLOM,
  MODUL_MINIMUM_MM,
  PER_LEMBAR,
  STIKER,
  STRIP_CODE128,
  batangTegak,
  keLembar,
  lebarModulMm,
  posisiStiker,
} from "./stiker";

describe("lembar stiker A4", () => {
  it("muat 6 x 5 = 30 stiker per lembar, tanpa keluar kertas", () => {
    expect(KOLOM).toBe(6);
    expect(BARIS).toBe(5);
    expect(PER_LEMBAR).toBe(30);
    const akhir = posisiStiker(PER_LEMBAR - 1);
    expect(akhir.x + STIKER.lebar).toBeLessThanOrEqual(210 - 10);
    expect(akhir.y + STIKER.tinggi).toBeLessThanOrEqual(297 - 10);
  });

  it("stiker tidak saling tumpang tindih", () => {
    const kotak = Array.from({ length: PER_LEMBAR }, (_, i) => posisiStiker(i));
    const unik = new Set(kotak.map((k) => `${k.x},${k.y}`));
    expect(unik.size).toBe(PER_LEMBAR);
  });

  it("161 produk jadi 6 lembar, lembar terakhir tidak penuh", () => {
    const lembar = keLembar(Array.from({ length: 161 }, (_, i) => i));
    expect(lembar).toHaveLength(6);
    expect(lembar[lembar.length - 1]).toHaveLength(161 - 5 * 30);
  });
});

describe("CODE128 diputar", () => {
  it("modulnya di atas batas aman kalau memanjang di sisi 50 mm", () => {
    // Inilah alasan batangnya diputar. Kalau angka ini turun di bawah
    // 0,25 mm, stiker yang dicetak tidak akan terbaca pemindai murah.
    const panjang = STIKER.tinggi - 4; // 2 mm margin atas-bawah
    for (let i = 0; i < 50; i++) {
      expect(lebarModulMm(kodeProdukBaru(), panjang)).toBeGreaterThan(MODUL_MINIMUM_MM);
    }
  });

  it("mendatar di sisi 30 mm TIDAK aman — bukti kenapa diputar", () => {
    const mendatar = lebarModulMm("ABCD1234", STIKER.lebar - 2);
    expect(mendatar).toBeLessThan(MODUL_MINIMUM_MM);
  });

  it("batang tetap di dalam stiker dan menyisakan zona tenang", () => {
    const panjang = STIKER.tinggi - 4;
    const batang = batangTegak("ABCD1234", panjang, STRIP_CODE128 - 2);
    expect(batang.length).toBeGreaterThan(0);
    const pertama = batang[0];
    const terakhir = batang[batang.length - 1];
    // Zona tenang 10 modul di awal…
    expect(pertama.y).toBeGreaterThan(lebarModulMm("ABCD1234", panjang) * 9);
    // …dan simbol selesai sebelum ujung, menyisakan zona tenang di akhir.
    expect(terakhir.y + terakhir.tinggi).toBeLessThan(panjang);
  });
});
