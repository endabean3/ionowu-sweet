import { describe, expect, it } from "vitest";
import { type BarangTercari, cariBarangByKode, cocokPencarian, normalisasiKode } from "./cari";

const katalog: BarangTercari[] = [
  { name: "Bibit Parfum Vanilla", category: "Kategori", barcode: "8991002103016", sku: "BBT-VAN" },
  { name: "Botol 30 ml", category: "Kategori", barcode: "8991002103023", sku: "BTL-30" },
  { name: "Mentega Wijsman", category: "Kategori" },
];

describe("normalisasiKode", () => {
  it("membuang spasi dan menyamakan huruf besar-kecil", () => {
    expect(normalisasiKode("  bbt-van \n")).toBe("BBT-VAN");
  });
});

describe("cariBarangByKode", () => {
  it("menemukan barang dari barcode yang dipindai", () => {
    expect(cariBarangByKode(katalog, "8991002103016")?.name).toBe("Bibit Parfum Vanilla");
  });

  it("menerima ekor CR/spasi yang ditambahkan pemindai", () => {
    expect(cariBarangByKode(katalog, "8991002103023\r")?.name).toBe("Botol 30 ml");
  });

  it("menemukan barang dari SKU tanpa peduli huruf besar-kecil", () => {
    expect(cariBarangByKode(katalog, "btl-30")?.name).toBe("Botol 30 ml");
  });

  // Inti dari keputusan "cocok persis": kalau awalan ikut dihitung, kasir
  // yang baru mengetik "899" sudah kejatuhan barang ke keranjang.
  it("TIDAK cocok pada potongan kode", () => {
    expect(cariBarangByKode(katalog, "899100210301")).toBeUndefined();
    expect(cariBarangByKode(katalog, "8991002103016X")).toBeUndefined();
  });

  it("kueri kosong tidak pernah cocok", () => {
    expect(cariBarangByKode(katalog, "   ")).toBeUndefined();
  });

  it("barang tanpa barcode/SKU tidak ikut tercocokkan", () => {
    expect(cariBarangByKode([{ name: "Mentega", category: "Kategori" }], "")).toBeUndefined();
  });
});

describe("cocokPencarian", () => {
  it("kueri kosong menampilkan semua barang", () => {
    expect(katalog.every((b) => cocokPencarian(b, "  "))).toBe(true);
  });

  it("masih mencocokkan nama seperti sebelumnya", () => {
    expect(cocokPencarian(katalog[0], "vanilla")).toBe(true);
    expect(cocokPencarian(katalog[0], "botol")).toBe(false);
  });

  it("mencocokkan potongan barcode — label yang separuh terkelupas", () => {
    expect(cocokPencarian(katalog[1], "103023")).toBe(true);
  });

  it("mencocokkan potongan SKU", () => {
    expect(cocokPencarian(katalog[0], "bbt")).toBe(true);
  });
});
