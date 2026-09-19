import qrcode from "qrcode-generator";

/**
 * Matriks QR untuk nota (ADR-0013): printer termal (raster ESC/POS) dan nota
 * browser (SVG) memakai matriks yang SAMA, jadi keduanya terbaca identik.
 *
 * Koreksi galat "M" (±15%): kertas termal murah pudar dan sering tergores;
 * "L" terlalu rapuh, "Q/H" membesarkan QR sampai memakan separuh nota 58 mm.
 */
export interface QrMatrix {
  /** Jumlah modul per sisi (tanpa zona tenang). */
  size: number;
  dark(row: number, col: number): boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const q = qrcode(0, "M");
  q.addData(text, "Byte");
  q.make();
  return { size: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) };
}

/** Zona tenang standar QR: 4 modul putih di tiap sisi. */
export const QR_TENANG = 4;

/**
 * Bitmap 1-bit untuk `GS v 0` (raster ESC/POS): baris demi baris, 8 titik per
 * byte, bit paling kiri = MSB, 1 = hitam. Didukung hampir semua printer
 * termal — berbeda dengan perintah QR bawaan (`GS ( k`), yang tidak dimiliki
 * sebagian printer Bluetooth 58 mm murah dan tercetak sebagai sampah.
 */
export function qrRaster(
  text: string,
  titikPerModul: number,
): { widthBytes: number; height: number; data: Uint8Array } {
  const m = qrMatrix(text);
  const sisiModul = m.size + QR_TENANG * 2;
  const sisiTitik = sisiModul * titikPerModul;
  const widthBytes = Math.ceil(sisiTitik / 8);
  const data = new Uint8Array(widthBytes * sisiTitik);
  for (let y = 0; y < sisiTitik; y++) {
    const r = Math.floor(y / titikPerModul) - QR_TENANG;
    for (let x = 0; x < sisiTitik; x++) {
      const c = Math.floor(x / titikPerModul) - QR_TENANG;
      if (r >= 0 && c >= 0 && r < m.size && c < m.size && m.dark(r, c)) {
        data[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return { widthBytes, height: sisiTitik, data };
}

/** Path SVG (satu `<path>`, satu kotak per modul gelap) untuk nota browser. */
export function qrSvgPath(text: string): { size: number; d: string } {
  const m = qrMatrix(text);
  let d = "";
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.dark(r, c)) d += `M${c + QR_TENANG} ${r + QR_TENANG}h1v1h-1z`;
    }
  }
  return { size: m.size + QR_TENANG * 2, d };
}
