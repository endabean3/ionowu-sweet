import { describe, expect, it } from "vitest";
import { COLUMNS, encodeReceipt, row, toPrinterText, wrap } from "./escpos";
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
      if (bytes[i + 1] !== 0x56) throw new Error(`perintah GS tak dikenal: ${bytes[i + 1]}`);
      commands.push("GS V");
      i += 4;
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
    expect(lines).toContain(row("PPN", "Rp 2.035", 32)[0]);
    expect(lines).toContain(row("TOTAL", "Rp 20.035", 32)[0]);
    expect(lines).toContain(row("Tunai", "Rp 25.000", 32)[0]);
    expect(lines).toContain(row("Kembali", "Rp 4.965", 32)[0]);
    expect(lines).toContain(`No. ${contoh.transactionId}`);
    expect(lines).toContain("(belum tersinkronisasi)");
  });

  it("baris PPN, Kembali, dan penanda offline hilang bila tidak relevan", () => {
    const { lines } = decode(
      encodeReceipt(
        { ...contoh, taxTotal: "0.00", changeAmount: 0, method: "qris", pending: false },
        58,
      ),
    );
    const teks = lines.join("\n");
    expect(teks).not.toContain("PPN");
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
