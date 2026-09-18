import { describe, expect, it } from "vitest";
import { CODE128_POLA, code128B, code128Bars } from "./code128";

describe("CODE128 B", () => {
  it("107 pola; setiap pola 11 modul (STOP 13), enam/tujuh elemen", () => {
    expect(CODE128_POLA).toHaveLength(107);
    CODE128_POLA.forEach((p, i) => {
      const jumlah = Array.from(p, Number).reduce((a, b) => a + b, 0);
      expect(jumlah, `pola ${i}`).toBe(i === 106 ? 13 : 11);
      expect(p.length).toBe(i === 106 ? 7 : 6);
    });
    // Tidak ada pola ganda — dua simbol berpola sama tak bisa dibedakan pemindai.
    expect(new Set(CODE128_POLA).size).toBe(107);
  });

  it("checksum 'PJJ123C' = 55", () => {
    // Nilai: P=48 J=42 J=42 1=17 2=18 3=19 C=35 → (104 + 48 + 84 + 126 + 68 + 90 + 114 + 245) = 879; 879 % 103 = 55
    const lebar = code128B("PJJ123C");
    const simbol = [];
    for (let i = 0; i < lebar.length - 7; i += 6) simbol.push(lebar.slice(i, i + 6).join(""));
    expect(simbol.at(-1)).toBe(CODE128_POLA[55]);
  });

  it("kode member: panjang modul = 11 × (n + 3) + 2", () => {
    const { total, bars } = code128Bars("M-433XJB");
    expect(total).toBe(11 * (8 + 3) + 2);
    expect(bars[0].x).toBe(0);
  });

  it("menolak karakter di luar ASCII", () => {
    expect(() => code128B("M-①")).toThrow();
  });
});
