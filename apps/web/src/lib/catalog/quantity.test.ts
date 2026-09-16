import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  QuantityError,
  formatQuantity,
  isCurah,
  parseQuantity,
  quickQuantities,
  toQuantityString,
} from "./quantity";

describe("isCurah", () => {
  it("presisi 0 = satuan utuh, di atasnya = curah", () => {
    expect(isCurah(0)).toBe(false);
    expect(isCurah(1)).toBe(true);
    expect(isCurah(3)).toBe(true);
  });
});

describe("parseQuantity", () => {
  it("menerima koma maupun titik sebagai pemisah desimal", () => {
    // Papan tik Android Indonesia mengetik koma; Decimal hanya paham titik.
    expect(parseQuantity("0,5", 3).toString()).toBe("0.5");
    expect(parseQuantity("0.5", 3).toString()).toBe("0.5");
  });

  it("menerima kuantitas curah yang wajar", () => {
    expect(parseQuantity("30", 3).toString()).toBe("30");
    expect(parseQuantity("  250  ", 1).toString()).toBe("250");
    expect(parseQuantity("1.125", 3).toString()).toBe("1.125");
  });

  it("menolak nol dan negatif", () => {
    expect(() => parseQuantity("0", 3)).toThrow(QuantityError);
    expect(() => parseQuantity("-5", 3)).toThrow(QuantityError);
  });

  it("menolak yang bukan angka", () => {
    for (const salah of ["", "   ", "abc", "1,2,3", "NaN"]) {
      expect(() => parseQuantity(salah, 3)).toThrow(QuantityError);
    }
  });

  it("menolak desimal yang melebihi presisi satuan — tidak dibulatkan diam-diam", () => {
    // Membulatkan berarti menagih pembeli untuk jumlah yang tidak ia minta.
    expect(() => parseQuantity("1.5", 0)).toThrow(/angka bulat/);
    expect(() => parseQuantity("0.25", 1)).toThrow(/1 angka di belakang koma/);
    expect(parseQuantity("0.2", 1).toString()).toBe("0.2");
  });

  it("hasilnya Decimal, bukan float — tidak melewati pembulatan biner", () => {
    const q = parseQuantity("0.1", 3);
    expect(q).toBeInstanceOf(Decimal);
    expect(q.plus("0.2").toString()).toBe("0.3");
  });
});

describe("toQuantityString & formatQuantity", () => {
  it("disimpan sebagai string desimal ringkas", () => {
    expect(toQuantityString(parseQuantity("30,0", 3))).toBe("30");
    expect(toQuantityString(parseQuantity("0,50", 3))).toBe("0.5");
  });

  it("ditampilkan dengan satuan dan koma ala Indonesia", () => {
    expect(formatQuantity("30", "ml")).toBe("30 ml");
    expect(formatQuantity("0.5", "kg")).toBe("0,5 kg");
    expect(formatQuantity("2", "pcs")).toBe("2 pcs");
  });
});

describe("quickQuantities", () => {
  it("menyesuaikan besaran satuannya", () => {
    expect(quickQuantities("ml")).toEqual(["10", "30", "50", "100"]);
    expect(quickQuantities("KG")).toEqual(["0.25", "0.5", "1", "2"]);
    expect(quickQuantities("pcs")).toEqual([]);
  });

  it("setiap pintasan lolos parseQuantity pada presisi 3", () => {
    for (const uom of ["ml", "g", "kg"]) {
      for (const q of quickQuantities(uom)) {
        expect(() => parseQuantity(q, 3)).not.toThrow();
      }
    }
  });
});
