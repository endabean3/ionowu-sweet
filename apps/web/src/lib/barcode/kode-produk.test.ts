import { describe, expect, it } from "vitest";
import { code128Bars } from "./code128";
import { PANJANG_KODE, kodeProdukBaru, rapikanKodeProduk } from "./kode-produk";

/** Acak palsu yang bisa diramal, supaya ujinya tidak berubah-ubah. */
const tetap = (nilai: number[]) => (n: number) =>
  Uint8Array.from({ length: n }, (_, i) => nilai[i % nilai.length]);

describe("kode produk", () => {
  it("panjangnya 8 dan hanya memakai abjad tanpa I, L, O, U", () => {
    for (let i = 0; i < 200; i++) {
      const kode = kodeProdukBaru();
      expect(kode).toHaveLength(PANJANG_KODE);
      expect(kode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    }
  });

  it("tiap karakter punya peluang sama — 256 habis dibagi 32", () => {
    // Byte 0..255 berturut-turut harus memetakan rata ke 32 karakter: 8 kali
    // masing-masing. Kalau abjadnya diubah jadi bukan 32, uji ini jatuh.
    const hitung = new Map<string, number>();
    for (let b = 0; b < 256; b++) {
      const k = kodeProdukBaru(tetap([b]))[0];
      hitung.set(k, (hitung.get(k) ?? 0) + 1);
    }
    expect(hitung.size).toBe(32);
    for (const n of hitung.values()) expect(n).toBe(8);
  });

  it("kode 8 karakter memberi 143 modul CODE128 — dasar hitungan lebar stiker", () => {
    // 55 + 11 x 8 = 143. Angka ini yang membuat batang HARUS diputar 90° di
    // stiker 30 mm; kalau berubah, tata letak stiker ikut salah.
    const { total } = code128Bars("ABCD1234");
    expect(total).toBe(143 - 20); // 143 termasuk zona tenang 10 modul di dua sisi
  });

  it("membetulkan salah baca yang khas: huruf besar-kecil, spasi, I/L/O/U", () => {
    expect(rapikanKodeProduk("abcd1234")).toBe("ABCD1234");
    expect(rapikanKodeProduk("ABCD-1234")).toBe("ABCD1234");
    expect(rapikanKodeProduk("ABCD 12 34")).toBe("ABCD1234");
    // O -> 0, I dan L -> 1, U -> V
    expect(rapikanKodeProduk("OBCDI23L")).toBe("0BCD1231");
    expect(rapikanKodeProduk("UBCD1234")).toBe("VBCD1234");
  });

  it("menolak yang panjangnya salah atau berisi karakter mustahil", () => {
    expect(rapikanKodeProduk("")).toBe("");
    expect(rapikanKodeProduk("ABC123")).toBe("");
    expect(rapikanKodeProduk("ABCD12345")).toBe("");
    expect(rapikanKodeProduk("ABCD123!")).toBe("");
  });
});
