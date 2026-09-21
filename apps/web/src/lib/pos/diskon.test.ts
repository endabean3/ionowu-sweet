import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { DiskonError, bacaDiskon, butuhPersetujuan, persenDiskon } from "./diskon";

describe("bacaDiskon", () => {
  it("membaca nominal rupiah apa adanya", () => {
    expect(bacaDiskon("5000", "100000").toString()).toBe("5000");
  });

  it("membaca persen terhadap subtotal", () => {
    expect(bacaDiskon("10%", "100000").toString()).toBe("10000");
    expect(bacaDiskon("7,5%", "100000").toString()).toBe("7500");
  });

  // Kembalian tidak pernah mengandung sen; nominal pecahan membuat total di
  // nota berbeda dari total yang ditagihkan.
  it("membulatkan hasil persen ke rupiah utuh", () => {
    expect(bacaDiskon("33%", "10001").toString()).toBe("3300");
  });

  it("kosong = tanpa diskon", () => {
    expect(bacaDiskon("   ", "100000").isZero()).toBe(true);
  });

  it("menolak diskon melebihi belanja", () => {
    expect(() => bacaDiskon("200000", "100000")).toThrow(DiskonError);
    expect(() => bacaDiskon("101%", "100000")).toThrow(DiskonError);
  });

  it("menolak isian yang bukan angka", () => {
    for (const t of ["gratis", "5rb", "-1000", "10 %x"]) {
      expect(() => bacaDiskon(t, "100000"), t).toThrow(DiskonError);
    }
  });
});

describe("persenDiskon", () => {
  it("menghitung persen dari subtotal", () => {
    expect(persenDiskon("25000", "100000").toNumber()).toBe(25);
  });

  // Tanpa penjagaan ini, keranjang kosong menghasilkan Infinity dan gerbang
  // persetujuan menyala sebelum ada satu barang pun.
  it("subtotal nol menghasilkan 0, bukan Infinity", () => {
    expect(persenDiskon("5000", "0").toNumber()).toBe(0);
  });
});

describe("butuhPersetujuan", () => {
  it("owner & manager menyetujui dirinya sendiri", () => {
    expect(butuhPersetujuan("owner", 90)).toBe(false);
    expect(butuhPersetujuan("manager", 90)).toBe(false);
  });

  it("kasir bebas sampai 20%, di atasnya butuh PIN", () => {
    expect(butuhPersetujuan("cashier", 20)).toBe(false);
    expect(butuhPersetujuan("cashier", new Decimal("20.01"))).toBe(true);
    expect(butuhPersetujuan("cashier", 21)).toBe(true);
  });

  it("peran tidak dikenal diperlakukan seperti kasir", () => {
    expect(butuhPersetujuan(undefined, 50)).toBe(true);
  });
});
