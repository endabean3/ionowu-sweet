import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  encodeReceipt,
  encodeTestPage,
  printedText,
  row,
  toPrinterText,
  wrap,
} from "./escpos";
import { type ReceiptData, rupiah } from "./format";

const ESC = 0x1b;
const GS = 0x1d;

/**
 * Membaca balik byte ESC/POS menjadi baris teks polos. Setiap perintah yang
 * TIDAK dikenal membuat uji gagal — encoder hanya boleh memakai perintah yang
 * didukung printer termal murah (lihat catatan di escpos.ts).
 */
function decode(bytes: Uint8Array): { lines: string[]; commands: string[] } {
  const commands: string[] = [];
  let text = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === ESC) {
      const op = String.fromCharCode(bytes[i + 1]);
      if (op === "@") {
        commands.push("ESC @");
        i += 2;
      } else if (op === "a" || op === "E" || op === "d") {
        commands.push(`ESC ${op} ${bytes[i + 2]}`);
        i += 3;
      } else {
        throw new Error(`perintah ESC tak dikenal: ${op}`);
      }
    } else if (b === GS) {
      const op = bytes[i + 1];
      if (op === 0x56) {
        commands.push("GS V");
        i += 4;
      } else if (op === 0x68 || op === 0x77 || op === 0x48) {
        // GS h/w/H n — tinggi, lebar modul, dan posisi teks barcode.
        commands.push(`GS ${String.fromCharCode(op)} ${bytes[i + 2]}`);
        i += 3;
      } else if (op === 0x6b) {
        // GS k 73 n {B <data> — CODE128; datanya byte cetak, bukan teks nota.
        const n = bytes[i + 3];
        commands.push(`GS k ${String.fromCharCode(...bytes.slice(i + 6, i + 4 + n))}`);
        i += 4 + n;
      } else if (op === 0x76) {
        // GS v 0 m xL xH yL yH <bitmap> — gambar raster (QR nota).
        const lebar = bytes[i + 4] | (bytes[i + 5] << 8);
        const tinggi = bytes[i + 6] | (bytes[i + 7] << 8);
        commands.push("GS v 0");
        i += 8 + lebar * tinggi;
      } else {
        throw new Error(`perintah GS tak dikenal: ${op}`);
      }
    } else if (b === 0x0a || (b >= 0x20 && b <= 0x7e)) {
      text += String.fromCharCode(b);
      i += 1;
    } else {
      throw new Error(`byte non-ASCII bocor ke printer: ${b}`);
    }
  }
  return { lines: text.split("\n"), commands };
}

const contoh: ReceiptData = {
  transactionId: "01K4ZQ8J7M2N3P4Q5R6S7T8V9W",
  occurredAt: "2026-09-14T06:05:00.000Z",
  outletName: "Warung Wangi Dongko",
  cashierName: "Siti",
  lines: [
    {
      name: "Parfum Refill Aroma Vanilla Bourbon Édition Spesial",
      quantity: "30",
      unitPrice: "500.00",
      discount: "0",
      uom: "ml",
    },
    { name: "Botol Spray 30ml", quantity: "1", unitPrice: "3500.00", discount: "500.00" },
  ],
  subtotal: "18500.00",
  taxTotal: "2035.00",
  grandTotal: "20035.00",
  method: "cash",
  givenAmount: 25000,
  changeAmount: 4965,
  pending: true,
};

describe("rupiah", () => {
  it("memisah ribuan dengan titik dan membulatkan half-up", () => {
    expect(rupiah("20035.00")).toBe("Rp 20.035");
    expect(rupiah("1234567.49")).toBe("Rp 1.234.567");
    expect(rupiah("0.50")).toBe("Rp 1");
    expect(rupiah(0)).toBe("Rp 0");
  });
});

describe("toPrinterText", () => {
  it("menurunkan aksen, mengganti × dan simbol di luar ASCII", () => {
    expect(toPrinterText("Édition × 2 🙏")).toBe("Edition x 2 ?");
  });

  it("spasi Unicode (mis. NNBSP dari toLocaleString) menjadi spasi biasa", () => {
    expect(toPrinterText("14/9/26 13.05")).toBe("14/9/26 13.05");
  });
});

describe("wrap & row", () => {
  it("wrap tidak pernah melebihi lebar", () => {
    const hasil = wrap("Parfum Refill Aroma Vanilla SuperpanjangsekalitanpaspasiXYZ", 10);
    for (const l of hasil) expect(l.length).toBeLessThanOrEqual(10);
    expect(hasil.join("")).toBe("ParfumRefillAromaVanillaSuperpanjangsekalitanpaspasiXYZ");
  });

  it("row memindahkan angka ke baris sendiri bila tidak muat, tanpa memotongnya", () => {
    expect(row("TOTAL", "Rp 14.430", 32)).toEqual([`TOTAL${" ".repeat(18)}Rp 14.430`]);
    const sempit = row("Label yang sangat panjang", "Rp 1.000.000", 16);
    expect(sempit.at(-1)).toBe("    Rp 1.000.000");
  });
});

describe("encodeReceipt", () => {
  for (const paper of [58, 80] as const) {
    it(`setiap baris muat di kertas ${paper}mm`, () => {
      const { lines } = decode(encodeReceipt(contoh, paper));
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(COLUMNS[paper]);
    });
  }

  it("berisi angka yang sama dengan struk HTML", () => {
    const { lines } = decode(encodeReceipt(contoh, 58));
    expect(lines).toContain("Warung Wangi Dongko");
    expect(lines).toContain("Kasir: Siti");
    // Barang curah: satuan wajib ikut tercetak.
    expect(lines).toContain(row("30 ml x Rp 500", "Rp 15.000", 32)[0]);
    expect(lines).toContain(row("Diskon", "-Rp 500", 32)[0]);
    expect(lines).toContain(row("Pajak", "Rp 2.035", 32)[0]);
    expect(lines).toContain(row("TOTAL", "Rp 20.035", 32)[0]);
    expect(lines).toContain(row("Tunai", "Rp 25.000", 32)[0]);
    expect(lines).toContain(row("Kembali", "Rp 4.965", 32)[0]);
    expect(lines).toContain(`No. ${contoh.transactionId}`);
    expect(lines).toContain("(belum tersinkronisasi)");
  });

  it("baris pajak, Kembali, dan penanda offline hilang bila tidak relevan", () => {
    const { lines } = decode(
      encodeReceipt(
        { ...contoh, taxTotal: "0.00", changeAmount: 0, method: "qris", pending: false },
        58,
      ),
    );
    const teks = lines.join("\n");
    expect(teks).not.toContain("Pajak");
    expect(teks).not.toContain("Kembali");
    expect(teks).not.toContain("tersinkronisasi");
    expect(teks).toContain("QRIS");
  });

  it("diawali reset dan diakhiri dorong kertas + potong", () => {
    const { commands } = decode(encodeReceipt(contoh, 58));
    expect(commands[0]).toBe("ESC @");
    expect(commands.slice(-2)).toEqual(["ESC d 4", "GS V"]);
  });
});

describe("encodeTestPage", () => {
  const teks = printedText;

  it.each([58, 80] as const)("penggaris %i mm tepat selebar satu baris", (paper) => {
    const baris = teks(encodeTestPage(paper, "RPP02N")).split("\n");
    const penggaris = baris.find((b) => /^[0-9]+$/.test(b));
    expect(penggaris).toHaveLength(COLUMNS[paper]);
    // Tidak ada baris yang melebihi lebar kertas — kalau ada, printer
    // membungkusnya sendiri dan uji ini justru menipu kasir.
    for (const b of baris) expect(b.length).toBeLessThanOrEqual(COLUMNS[paper]);
  });

  it("dimulai dengan reset dan diakhiri dorong + potong kertas", () => {
    const bytes = encodeTestPage(58, "Printer");
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(bytes.slice(-7))).toEqual([0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00]);
  });
});

describe("profil toko di struk", () => {
  const cetak = (d: ReceiptData, paper: 58 | 80 = 58) =>
    printedText(encodeReceipt(d, paper)).split("\n");

  it("alamat, telepon, dan penutup dari Pengaturan tercetak — dan muat lebar kertas", () => {
    const baris = cetak({
      ...contoh,
      outletAddress: "Jl. Raya Dongko No. 12, Dongko, Trenggalek",
      outletPhone: "0812-3456-7890",
      footer: "Terima kasih, selamat wangi! IG @warungwangi",
    });
    const semua = baris.join("\n");
    expect(semua).toContain("Jl. Raya Dongko No. 12,");
    expect(semua).toContain("Telp/WA 0812-3456-7890");
    expect(semua).toContain("selamat wangi!");
    expect(semua).not.toMatch(/^Terima kasih$/m);
    // Alamat panjang dibungkus, tidak pernah melampaui 32 kolom.
    for (const b of baris) expect(b.length).toBeLessThanOrEqual(COLUMNS[58]);
  });

  it("tanpa profil: tidak ada baris kosong berlebih dan penutup bawaan dipakai", () => {
    const baris = cetak({ ...contoh, outletAddress: "  ", outletPhone: null, footer: "" });
    expect(baris.some((b) => b.startsWith("Telp/WA"))).toBe(false);
    expect(baris).toContain("Terima kasih");
    // Baris ke-2 langsung tanggal — alamat kosong tidak menyisakan baris.
    expect(baris[1]).toMatch(/\d{4}|\d{2}\.\d{2}/);
  });
});

describe("printedText & tata letak tanpa pajak", () => {
  const baris = (d: ReceiptData) => printedText(encodeReceipt(d, 58)).split("\n");
  const tanpaPajak: ReceiptData = { ...contoh, taxTotal: "0", grandTotal: "18500.00" };

  it("baris pertama TEPAT nama toko — reset ESC @ tidak menelan perintah berikutnya", () => {
    expect(baris(tanpaPajak)[0]).toBe("Warung Wangi Dongko");
    expect(printedText(encodeTestPage(58, "RPP02N")).split("\n")[0]).toBe("CETAK UJI");
  });

  it("tanpa pajak: tidak ada Subtotal/Pajak, TOTAL tetap ada", () => {
    const b = baris(tanpaPajak);
    expect(b.some((x) => x.startsWith("Subtotal") || x.startsWith("Pajak"))).toBe(false);
    expect(b.some((x) => x.startsWith("TOTAL"))).toBe(true);
  });

  it("dengan pajak: Subtotal dan Pajak tercetak", () => {
    const b = baris(contoh);
    expect(b.some((x) => x.startsWith("Subtotal"))).toBe(true);
    expect(b.some((x) => x.startsWith("Pajak"))).toBe(true);
  });

  it("'pcs' tidak dicetak, satuan curah tetap", () => {
    const semua = baris({
      ...tanpaPajak,
      lines: [
        { name: "Botol Slim", quantity: "1", unitPrice: "4000", discount: "0", uom: "pcs" },
        { name: "Bibit Vanilla", quantity: "30", unitPrice: "1500", discount: "0", uom: "ml" },
      ],
    }).join("\n");
    expect(semua).toContain("1 x Rp 4.000");
    expect(semua).not.toContain("pcs");
    expect(semua).toContain("30 ml x Rp 1.500");
  });
});

describe("toPrinterText — nama produk nyata Warung Wangi", () => {
  it.each([
    ["Tutup ① (25–35 ml)", "Tutup 1 (25-35 ml)"],
    ["Tutup ⑨ Sprayer", "Tutup 9 Sprayer"],
    ["Parfum “Oud” ½ botol", 'Parfum "Oud" 1/2 botol'],
    ["Crème Brûlée…", "Creme Brulee..."],
  ])("%s → %s", (masuk, keluar) => {
    expect(toPrinterText(masuk)).toBe(keluar);
  });

  it("emoji tetap menjadi ? — terlihat salah, bukan hilang diam-diam", () => {
    expect(toPrinterText("Wangi 🌸")).toBe("Wangi ?");
  });
});

describe("garansi di nota", () => {
  const cetak = (d: ReceiptData) => printedText(encodeReceipt(d, 58));

  it("garansi 7 hari: tanggal beli + 7 hari tercetak sebelum penutup", () => {
    const d: ReceiptData = { ...contoh, occurredAt: "2026-09-19T03:00:00.000Z", warrantyDays: 7 };
    const baris = cetak(d).split("\n");
    const i = baris.findIndex((b) => b.startsWith("Garansi 7 hari s/d"));
    expect(i).toBeGreaterThan(-1);
    expect(baris[i]).toContain("26/09/2026");
    // Garansi di atas teks penutup.
    expect(baris.findIndex((b) => b.startsWith("Terima kasih"))).toBeGreaterThan(i);
  });

  it("0 atau kosong: tidak ada baris garansi", () => {
    expect(cetak({ ...contoh, warrantyDays: 0 })).not.toContain("Garansi");
    expect(cetak({ ...contoh, warrantyDays: null })).not.toContain("Garansi");
  });
});

describe("member di nota", () => {
  const denganMember: ReceiptData = {
    ...contoh,
    member: { code: "M-433XJB", name: "Siti", bonuses: ["1 tester", "merchandise perdana"] },
  };

  it("kode, bonus, dan barcode CODE128 tercetak", () => {
    const bytes = encodeReceipt(denganMember, 58);
    const teks = printedText(bytes);
    expect(teks).toContain("Member M-433XJB (Siti)");
    expect(teks).toContain("Bonus: 1 tester");
    expect(teks).toContain("Bonus: merchandise perdana");
    expect(teks).toContain("||| M-433XJB |||");
    // GS k 73 n "{B" + data — panjang n = 2 + 8.
    const i = Array.from(bytes).findIndex((b, k) => b === 0x1d && bytes[k + 1] === 0x6b);
    expect(Array.from(bytes.slice(i, i + 6))).toEqual([0x1d, 0x6b, 73, 10, 0x7b, 0x42]);
    for (const b of teks.split("\n")) expect(b.length).toBeLessThanOrEqual(COLUMNS[58]);
  });

  it("tanpa member: tidak ada blok member", () => {
    expect(printedText(encodeReceipt(contoh, 58))).not.toContain("Member");
  });
});

describe("resep TIDAK dicetak di nota", () => {
  // Permintaan pemilik: resep racikan adalah pengetahuan toko. Nota pembeli
  // hanya menyebut jumlah bibit dalam ml; takaran botol tetap ada di keypad
  // kasir (components/pos/qty-keypad.tsx).
  it("nota berisi bibit ml tidak memuat tabel takaran atau kata resep", () => {
    for (const paper of [58, 80] as const) {
      const teks = printedText(encodeReceipt(contoh, paper));
      expect(teks).not.toContain("Racikan");
      expect(teks).not.toContain("Pelarut");
      expect(teks).not.toMatch(/pelarut/i);
      // Yang JUSTRU harus ada: jumlah bibit dalam ml pada baris barangnya.
      expect(teks).toMatch(/30 ml x Rp/);
    }
  });
});
