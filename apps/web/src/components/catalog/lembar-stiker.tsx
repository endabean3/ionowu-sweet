import { qrSvgPath } from "@/lib/barcode/qr";
import {
  ISI,
  KERTAS,
  PER_LEMBAR,
  STIKER,
  STRIP_CODE128,
  batangTegak,
  keLembar,
  posisiStiker,
} from "@/lib/barcode/stiker";

export interface StikerData {
  /** Kode 8 karakter yang tercetak sebagai QR dan CODE128. */
  kode: string;
  nama: string;
  /** Sudah diformat ("Rp 25.000"); komponen ini tidak menghitung uang. */
  harga: string;
}

/** Margin dalam stiker, mm. */
const SISI = 2;

/**
 * Panjang nama yang dicetak. Dipotong per baris, bukan digulung, karena
 * stiker tidak bisa memanjang — nama yang meluber akan menimpa QR.
 */
const BARIS_NAMA = 3;
const PER_BARIS = 16;

function pecahNama(nama: string): string[] {
  const kata = nama.split(/\s+/);
  const baris: string[] = [];
  let kini = "";
  for (const k of kata) {
    const calon = kini ? `${kini} ${k}` : k;
    if (calon.length <= PER_BARIS) {
      kini = calon;
    } else {
      if (kini) baris.push(kini);
      kini = k.length > PER_BARIS ? `${k.slice(0, PER_BARIS - 1)}…` : k;
    }
    if (baris.length === BARIS_NAMA) break;
  }
  if (kini && baris.length < BARIS_NAMA) baris.push(kini);
  return baris.slice(0, BARIS_NAMA);
}

/** Satu stiker, digambar pada koordinat milimeter di dalam lembar. */
function Stiker({ data, x, y }: { data: StikerData; x: number; y: number }) {
  const qr = qrSvgPath(data.kode);
  const panjangBatang = STIKER.tinggi - SISI * 2;
  const batang = batangTegak(data.kode, panjangBatang, STRIP_CODE128 - SISI * 1.5);
  const nama = pecahNama(data.nama);

  // QR mengisi lebar sisa dikurangi margin; skala dari modul ke mm.
  const qrMm = ISI.lebar - SISI * 2;
  const skalaQr = qrMm / qr.size;

  const isiX = ISI.x + SISI;
  const qrY = STIKER.tinggi - SISI - qrMm - 3.2;

  return (
    <g transform={`translate(${x} ${y})`}>
      {/* Garis potong: tipis dan abu, cukup untuk dituruti gunting tanpa
          ikut terbaca pemindai sebagai batang. */}
      <rect
        x={0}
        y={0}
        width={STIKER.lebar}
        height={STIKER.tinggi}
        fill="none"
        stroke="#c8c8c8"
        strokeWidth={0.1}
      />

      {/* CODE128 diputar 90°: sumbu panjangnya memakai tinggi stiker. */}
      {batang.map((b) => (
        <rect
          key={b.y}
          x={SISI * 0.75}
          y={SISI + b.y}
          width={b.tebal}
          height={b.tinggi}
          fill="#000"
        />
      ))}

      {nama.map((baris, i) => (
        <text
          // biome-ignore lint/suspicious/noArrayIndexKey: baris nama dipotong sekali saat render, tidak pernah diurut ulang
          key={i}
          x={isiX}
          y={SISI + 2.6 + i * 2.6}
          fontSize={2.2}
          fontFamily="sans-serif"
          fill="#000"
        >
          {baris}
        </text>
      ))}

      <text
        x={isiX}
        y={SISI + 3.2 + BARIS_NAMA * 2.6}
        fontSize={2.6}
        fontWeight="bold"
        fontFamily="sans-serif"
        fill="#000"
      >
        {data.harga}
      </text>

      <g transform={`translate(${isiX} ${qrY}) scale(${skalaQr})`}>
        <path d={qr.d} fill="#000" />
      </g>

      {/* Kode yang bisa dibaca manusia: satu-satunya jalan masuk kalau
          stikernya tergores dan kedua simbol gagal dibaca. */}
      <text
        x={isiX + qrMm / 2}
        y={STIKER.tinggi - SISI}
        fontSize={2.3}
        fontFamily="monospace"
        textAnchor="middle"
        fill="#000"
      >
        {data.kode}
      </text>
    </g>
  );
}

/**
 * Lembar-lembar A4 siap cetak.
 *
 * Ukurannya dikunci dalam milimeter lewat `width`/`height` SVG, bukan piksel:
 * stiker 30 mm harus keluar 30 mm dari printer, berapa pun zoom peramban.
 */
export function LembarStiker({ stiker }: { stiker: StikerData[] }) {
  const lembar = keLembar(stiker);

  return (
    <div className="lembar-stiker">
      {lembar.map((isi, n) => (
        <svg
          // biome-ignore lint/suspicious/noArrayIndexKey: urutan lembar ADALAH urutan cetak; tidak ada reorder
          key={n}
          className="lembar"
          width={`${KERTAS.lebar}mm`}
          height={`${KERTAS.tinggi}mm`}
          viewBox={`0 0 ${KERTAS.lebar} ${KERTAS.tinggi}`}
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>{`Lembar stiker ${n + 1} dari ${lembar.length}`}</title>
          <rect width={KERTAS.lebar} height={KERTAS.tinggi} fill="#fff" />
          {isi.map((s, i) => {
            const { x, y } = posisiStiker(i);
            return <Stiker key={`${s.kode}-${i}`} data={s} x={x} y={y} />;
          })}
        </svg>
      ))}
      <style>{`
        .lembar-stiker { display: flex; flex-direction: column; gap: 16px; }
        .lembar { background: #fff; box-shadow: 0 1px 6px rgb(0 0 0 / 0.15); }
        @media print {
          @page { size: A4; margin: 0; }
          .lembar-stiker { gap: 0; }
          /* Satu lembar per halaman; tanpa ini dua lembar bisa berdempet dan
             semua garis potong meleset. */
          .lembar { box-shadow: none; break-after: page; }
          .lembar:last-child { break-after: auto; }
        }
      `}</style>
    </div>
  );
}

export { PER_LEMBAR };
