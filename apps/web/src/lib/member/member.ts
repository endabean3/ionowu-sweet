/**
 * Member pelanggan (migrasi 00012, Warung Wangi).
 *
 * Member didaftarkan di PERANGKAT — bisa saat offline — lalu dikirim lewat
 * /sync/push. Aturan di sini WAJIB sama dengan services/pos-engine
 * (member.go): server menolak apa pun yang tidak lolos aturan yang sama,
 * dan member yang ditolak berarti kartu yang sudah dipegang pelanggan
 * tidak pernah berlaku.
 */

/**
 * Nomor WhatsApp Indonesia dalam bentuk baku 62xxxxxxxxxx; "" bila tidak
 * masuk akal. "0812-3456-7890", "+62 812…", dan "812…" adalah orang yang SAMA.
 */
export function normalizeWA(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("62")) {
    // sudah baku
  } else if (d.startsWith("0")) {
    d = `62${d.slice(1)}`;
  } else if (d.startsWith("8")) {
    d = `62${d}`;
  } else {
    return "";
  }
  return d.length >= 10 && d.length <= 15 ? d : "";
}

/** 6281234567890 → "0812-3456-7890" untuk ditampilkan ke kasir. */
export function formatWA(baku: string): string {
  const lokal = baku.startsWith("62") ? `0${baku.slice(2)}` : baku;
  return lokal.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");
}

/** Tanpa "@" di depan dan tanpa spasi — "@warungwangi" = "warungwangi". */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

/**
 * Kode member dari ULID id-nya: "M-" + 6 karakter acak terakhir ULID
 * (Crockford base32 — tanpa I, L, O, U yang mudah tertukar saat dibaca).
 * Dibuat offline, jadi keunikannya dijamin server (indeks unik per tenant);
 * peluang tabrakan 1 : 32⁶ ≈ 1 : 1 miliar per pasangan.
 */
export function memberCodeFromUlid(id: string): string {
  return `M-${id.slice(-6).toUpperCase()}`;
}

const POLA_KODE = /^[A-Z0-9][A-Z0-9-]{3,19}$/;

/** Hasil scan/ketik yang BERBENTUK kode member (belum tentu terdaftar). */
export function looksLikeMemberCode(raw: string): boolean {
  const s = raw.trim().toUpperCase();
  return s.startsWith("M-") && POLA_KODE.test(s);
}
