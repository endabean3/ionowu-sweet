import { describe, expect, it } from "vitest";
import { encodeReceipt, printedText } from "../receipt/escpos";
import { type ReceiptData, kodeNota, notaQrJudul, notaWebLink } from "../receipt/format";
import { QR_TENANG, qrMatrix, qrRaster, qrSvgPath } from "./qr";

const URL_NOTA =
  "https://warungwangi.ionowu.com/nota/01K5TENANT0000000000000000/01K5SALE00000000000000000A";

describe("QR nota", () => {
  it("tautan nota = base/tenant/id, garis miring akhir dibuang", () => {
    expect(notaWebLink("https://a.id/nota/", "T1", "S1")).toBe("https://a.id/nota/T1/S1");
    expect(notaWebLink("", "T1", "S1")).toBeNull();
    expect(notaWebLink("https://a.id/nota", null, "S1")).toBeNull();
  });

  it("muat di kertas 58 mm (384 titik) dengan 4 titik per modul", () => {
    const m = qrMatrix(URL_NOTA);
    const r = qrRaster(URL_NOTA, 4);
    expect(r.height).toBe((m.size + QR_TENANG * 2) * 4);
    expect(r.widthBytes * 8).toBeLessThanOrEqual(384);
    expect(r.data.length).toBe(r.widthBytes * r.height);
  });

  it("raster dan SVG berasal dari matriks yang sama", () => {
    const m = qrMatrix(URL_NOTA);
    const r = qrRaster(URL_NOTA, 1);
    const svg = qrSvgPath(URL_NOTA);
    let gelap = 0;
    for (let y = 0; y < m.size; y++)
      for (let x = 0; x < m.size; x++) {
        const bit =
          (r.data[(y + QR_TENANG) * r.widthBytes + ((x + QR_TENANG) >> 3)] >>
            (7 - ((x + QR_TENANG) & 7))) &
          1;
        expect(bit === 1).toBe(m.dark(y, x));
        if (m.dark(y, x)) gelap++;
      }
    expect(svg.d.split("M").length - 1).toBe(gelap);
  });

  const contoh: ReceiptData = {
    transactionId: "01K5SALE00000000000000000A",
    occurredAt: "2026-09-19T03:00:00Z",
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
    notaUrl: URL_NOTA,
  };

  it("nota termal memuat blok QR; pratinjau melompati data raster utuh", () => {
    const teks = printedText(encodeReceipt(contoh));
    expect(teks).toContain("Cek garansi & daftar member");
    expect(teks).toContain("[ gambar ]");
    // Data raster (byte biner) tidak bocor jadi huruf acak: baris setelah QR
    // tetap utuh.
    // Byte raster (biner) tidak bocor jadi huruf acak: blok sesudahnya utuh.
    expect(teks).toMatch(/\[ gambar \]\n-+\n\|\|\| \w+ \|\|\|\nNo\. 01K5SALE00000000000000000A/);
  });

  it("tanpa alamat web nota: tidak ada QR", () => {
    expect(printedText(encodeReceipt({ ...contoh, notaUrl: null }))).not.toContain("gambar");
  });

  it("nota member tidak menawarkan daftar member lagi", () => {
    expect(notaQrJudul({ member: { code: "M-ABCDEF", bonuses: [] } })).toBe("Cek garansi nota ini");
  });

  it("kode nota = 6 karakter terakhir id, huruf besar", () => {
    expect(kodeNota("01k5sale00000000000000000a")).toBe("00000A");
    expect(kodeNota(URL_NOTA.slice(-30))).toHaveLength(6);
  });

  it("nota termal memuat barcode kode nota di atas baris No.", () => {
    const teks = printedText(encodeReceipt(contoh));
    const kode = kodeNota(contoh.transactionId);
    expect(teks).toContain(`||| ${kode} |||`);
    expect(teks).toMatch(
      new RegExp(`\\|\\|\\|\\s*${kode}\\s*\\|\\|\\|\\nNo\\. ${contoh.transactionId}`),
    );
  });
});
