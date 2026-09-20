import { describe, expect, it } from "vitest";
import { encodeReceipt, printedText } from "./escpos";
import type { ReceiptData } from "./format";
import { type LogoBitmap, decodeLogo, encodeLogo, logoTerbaca } from "./logo";

/** Kotak 16×4: baris 0 & 2 hitam penuh, sisanya putih. */
const contohLogo: LogoBitmap = {
  width: 16,
  height: 4,
  bits: new Uint8Array([0xff, 0xff, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00]),
};

const nota: ReceiptData = {
  transactionId: "01K5SALE00000000000000000A",
  occurredAt: "2026-09-20T03:00:00Z",
  outletName: "Warung Wangi Dongko",
  cashierName: "Kasir",
  lines: [{ name: "Botol Spray", quantity: "1", unitPrice: "5000", discount: "0" }],
  subtotal: "5000",
  taxTotal: "0",
  grandTotal: "5000",
  method: "cash",
  givenAmount: 5000,
  changeAmount: 0,
  pending: false,
};

describe("logo nota", () => {
  it("encode → decode menghasilkan bitmap yang sama", () => {
    const kembali = decodeLogo(encodeLogo(contohLogo));
    expect(kembali).not.toBeNull();
    expect(kembali?.width).toBe(16);
    expect(kembali?.height).toBe(4);
    expect(Array.from(kembali?.bits ?? [])).toEqual(Array.from(contohLogo.bits));
  });

  it("bit dibaca dari kiri (MSB) — logo tidak tercetak terbalik", () => {
    const setengah: LogoBitmap = { width: 8, height: 1, bits: new Uint8Array([0b10000000]) };
    expect(logoTerbaca(setengah, 0, 0)).toBe(true);
    expect(logoTerbaca(setengah, 1, 0)).toBe(false);
    expect(logoTerbaca(setengah, 7, 0)).toBe(false);
  });

  it("data rusak ditolak, bukan dicetak jadi sampah", () => {
    for (const rusak of [
      "",
      "bukan logo",
      "16,4,", // tanpa data
      "12,4,AAAA", // lebar bukan kelipatan 8
      // Ukuran benar, data kependekan: inilah yang membuat printer
      // memuntahkan sampah sepanjang gulungan kertas.
      `16,4,${encodeLogo({ ...contohLogo, bits: new Uint8Array(4) }).split(",")[2]}`,
    ]) {
      expect(decodeLogo(rusak)).toBeNull();
    }
    expect(decodeLogo(null)).toBeNull();
  });

  it("nota termal memuat gambar logo SEBELUM nama toko", () => {
    const teks = printedText(encodeReceipt({ ...nota, logo: encodeLogo(contohLogo) }));
    expect(teks.indexOf("[ gambar ]")).toBeGreaterThanOrEqual(0);
    expect(teks.indexOf("[ gambar ]")).toBeLessThan(teks.indexOf("Warung Wangi"));
  });

  it("tanpa logo: tidak ada gambar di nota", () => {
    expect(printedText(encodeReceipt(nota))).not.toContain("[ gambar ]");
  });

  it("logo lebih lebar dari kertas dilewati, bukan mencetak berantakan", () => {
    const kebesaran = encodeLogo({
      width: 640,
      height: 1,
      bits: new Uint8Array(640 / 8),
    });
    expect(printedText(encodeReceipt({ ...nota, logo: kebesaran }, 58))).not.toContain(
      "[ gambar ]",
    );
  });
});
