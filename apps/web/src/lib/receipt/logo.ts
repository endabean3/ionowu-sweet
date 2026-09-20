/**
 * Logo toko di kepala nota.
 *
 * Printer termal hanya bisa hitam-putih, satu titik = satu bit. Karena itu
 * yang DISIMPAN bukan berkas gambar, melainkan bitmap 1-bit siap cetak
 * ("<lebar>,<tinggi>,<base64>", tata letak `GS v 0`). Konversinya dilakukan
 * sekali saat pemilik mengunggah di Pengaturan, bukan setiap kali mencetak —
 * kasir tidak boleh menunggu gambar diproses saat pembeli berdiri di depan.
 *
 * Nota browser memakai bitmap yang SAMA, jadi pratinjau di layar benar-benar
 * memperlihatkan hasil cetaknya, termasuk bagian gradasi yang menjadi titik.
 */

/** Lebar cetak printer termal dalam titik. */
export const LEBAR_TITIK = { 58: 384, 80: 576 } as const;

/** Batas tinggi: menjaga satu nota tetap cepat terkirim lewat Bluetooth. */
export const MAKS_TINGGI = 240;

export interface LogoBitmap {
  /** Kelipatan 8 (satu byte = 8 titik). */
  width: number;
  height: number;
  /** Baris demi baris, 8 titik per byte, MSB kiri, bit 1 = hitam. */
  bits: Uint8Array;
}

/** "<lebar>,<tinggi>,<base64>" — bentuk yang disimpan di outlets.receipt_logo. */
export function encodeLogo(logo: LogoBitmap): string {
  let biner = "";
  for (const b of logo.bits) biner += String.fromCharCode(b);
  return `${logo.width},${logo.height},${btoa(biner)}`;
}

export function decodeLogo(raw: string | null | undefined): LogoBitmap | null {
  if (!raw) return null;
  const [w, h, b64] = raw.split(",", 3);
  const width = Number(w);
  const height = Number(h);
  if (!width || !height || width % 8 !== 0 || !b64) return null;
  try {
    const biner = atob(b64);
    if (biner.length !== (width / 8) * height) return null;
    const bits = new Uint8Array(biner.length);
    for (let i = 0; i < biner.length; i++) bits[i] = biner.charCodeAt(i);
    return { width, height, bits };
  } catch {
    return null;
  }
}

export function logoTerbaca(logo: LogoBitmap, x: number, y: number): boolean {
  return (logo.bits[y * (logo.width / 8) + (x >> 3)] >> (7 - (x & 7))) % 2 === 1;
}

/**
 * Berkas gambar → bitmap 1-bit, diskalakan agar muat lebar kertas dan
 * tingginya dibatasi.
 *
 * Latar transparan dianggap PUTIH: kertas termal tidak punya "tidak dicetak"
 * selain putih, dan logo PNG transparan yang diperlakukan sebagai hitam akan
 * keluar sebagai kotak hitam pekat.
 *
 * Gradasi (mis. tutup botol emas) diubah dengan dithering Floyd–Steinberg,
 * bukan ambang keras: ambang keras membuat gradasi jadi bidang hitam besar
 * yang boros tinta panas dan kehilangan bentuk.
 */
export async function gambarKeLogo(
  file: Blob,
  lebarTitik: number = LEBAR_TITIK[58],
  maksTinggi: number = MAKS_TINGGI,
): Promise<LogoBitmap> {
  const { gambar, lebarAsli, tinggiAsli, tutup } = await muatGambar(file);
  // Kelipatan 8: satu baris bitmap dikirim utuh per byte.
  // Muat lebar kertas DAN batas tinggi tanpa gepeng: logo persegi 1024×1024
  // yang dipaksa 384×240 akan terlihat penyok, dan itu logo toko orang.
  const rasio = tinggiAsli / lebarAsli;
  let width = Math.max(8, Math.floor(lebarTitik / 8) * 8);
  let height = Math.round(rasio * width);
  if (height > maksTinggi) {
    width = Math.max(8, Math.floor(maksTinggi / rasio / 8) * 8);
    height = Math.round(rasio * width);
  }
  if (height < 1) height = 1;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Peramban ini tidak bisa memproses gambar");
  // Putih dulu, lalu gambar di atasnya — inilah yang membuat PNG transparan
  // menjadi putih, bukan hitam.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(gambar, 0, 0, width, height);
  tutup();

  const { data } = ctx.getImageData(0, 0, width, height);
  // Kecerahan 0–255 (Rec. 601), lalu dithering.
  const abu = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    abu[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // Logo bergaris tegas (hampir semua piksel hitam atau putih) lebih bersih
  // dengan AMBANG KERAS: dithering menyebarkan galat ke tepi huruf dan
  // membuat teks kecil seperti "Parfum Refill Berkualitas" berbintik.
  // Gambar bergradasi (foto, emas berkilau) sebaliknya: ambang keras
  // mengubahnya jadi bidang hitam pekat, jadi di situ dithering menang.
  let ekstrem = 0;
  for (let i = 0; i < abu.length; i++) if (abu[i] < 40 || abu[i] > 215) ekstrem++;
  const pakaiDithering = ekstrem / abu.length < 0.9;

  const bits = new Uint8Array((width / 8) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const lama = abu[i];
      const baru = lama < 128 ? 0 : 255;
      if (baru === 0) bits[y * (width / 8) + (x >> 3)] |= 0x80 >> (x & 7);
      if (!pakaiDithering) continue;
      const galat = lama - baru;
      // Sebar galat ke tetangga (Floyd–Steinberg).
      if (x + 1 < width) abu[i + 1] += (galat * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) abu[i + width - 1] += (galat * 3) / 16;
        abu[i + width] += (galat * 5) / 16;
        if (x + 1 < width) abu[i + width + 1] += galat / 16;
      }
    }
  }
  return { width, height, bits };
}

/**
 * Memuat gambar apa pun yang bisa digambar ke canvas.
 *
 * `createImageBitmap` dicoba lebih dulu (paling cepat, tanpa DOM). Cadangan
 * `<img>` + object URL disediakan karena WebView Android lama tidak selalu
 * punya `createImageBitmap` untuk semua jenis berkas, dan pemilik hanya akan
 * melihat "gambar tidak bisa dibaca" tanpa tahu sebabnya.
 */
async function muatGambar(file: Blob): Promise<{
  gambar: CanvasImageSource;
  lebarAsli: number;
  tinggiAsli: number;
  tutup: () => void;
}> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      gambar: bitmap,
      lebarAsli: bitmap.width,
      tinggiAsli: bitmap.height,
      tutup: () => bitmap.close?.(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        gambar: img,
        lebarAsli: img.naturalWidth,
        tinggiAsli: img.naturalHeight,
        tutup: () => URL.revokeObjectURL(url),
      };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }
}

/** Bitmap → PNG data URL, untuk ditampilkan di nota browser & pratinjau. */
export function logoKeDataUrl(logo: LogoBitmap): string {
  const canvas = document.createElement("canvas");
  canvas.width = logo.width;
  canvas.height = logo.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(logo.width, logo.height);
  for (let y = 0; y < logo.height; y++) {
    for (let x = 0; x < logo.width; x++) {
      const hitam = logoTerbaca(logo, x, y);
      const i = (y * logo.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = hitam ? 0 : 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
