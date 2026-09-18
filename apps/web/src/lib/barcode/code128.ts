/**
 * Encoder CODE128 set B (ASCII 32–127) untuk barcode member di nota browser.
 *
 * Printer termal menggambar barcode-nya sendiri (ESC/POS `GS k`), tetapi nota
 * yang dicetak lewat browser/PWA butuh gambarnya dari sini — supaya pelanggan
 * tetap bisa memindai kode member dari nota apa pun. Ditulis sendiri, bukan
 * pustaka: hanya ±100 baris, tanpa menambah bundle layar kasir. Keterbacaan
 * hasilnya diuji dengan pemindai sungguhan (zbarimg), bukan hanya bentuknya.
 */

// Lebar batang/spasi bergantian (dimulai batang) untuk nilai simbol 0–106.
// Setiap pola berjumlah 11 modul; STOP (106) 13 modul.
const POLA: readonly string[] = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
];

const START_B = 104;
const STOP = 106;

/** Pola mentah — diekspor untuk uji. */
export const CODE128_POLA = POLA;

/**
 * Lebar modul batang/spasi bergantian, dimulai batang, termasuk START B,
 * checksum, dan STOP. Melempar bila ada karakter di luar ASCII 32–127.
 */
export function code128B(teks: string): number[] {
  const nilai: number[] = [START_B];
  for (const ch of teks) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 127) throw new Error(`Karakter tidak didukung CODE128 B: ${ch}`);
    nilai.push(c - 32);
  }
  let cek = START_B;
  for (let i = 1; i < nilai.length; i++) cek += nilai[i] * i;
  nilai.push(cek % 103, STOP);
  return nilai.flatMap((v) => Array.from(POLA[v], Number));
}

/** Kotak batang siap-gambar (x, lebar dalam modul) + lebar total. */
export function code128Bars(teks: string): { bars: { x: number; w: number }[]; total: number } {
  const lebar = code128B(teks);
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  lebar.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return { bars, total: x };
}
