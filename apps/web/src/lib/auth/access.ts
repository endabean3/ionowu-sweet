/**
 * Siapa yang boleh membuka layar kasir, dan siapa yang harus login dulu.
 *
 * Aturan ini TIDAK bisa disederhanakan menjadi "tidak ada sesi → usir ke
 * /login", dan itu bukan soal selera:
 *
 * Kasir wajib tetap bisa berjualan meski VPS, Redis, internet, atau gateway
 * mati (CLAUDE.md §6.2 invarian #2). Access token hanya hidup di memori dan
 * di-refresh lewat jaringan saat aplikasi dibuka; kasir yang membuka aplikasi
 * di toko yang sedang offline TIDAK akan punya sesi — dan penjaga naif akan
 * melemparnya ke halaman login yang juga tidak bisa dihubungi. Toko berhenti
 * berjualan justru karena kode yang dimaksudkan mengamankannya.
 *
 * Karena itu yang ditanya bukan "punya sesi sekarang?" melainkan "perangkat
 * ini pernah dipakai login?". Refresh token di localStorage adalah jawabannya:
 * ia hanya ada bila seseorang pernah berhasil login di perangkat ini.
 *
 * Yang TIDAK dilindungi aturan ini, dan memang bukan tugasnya: data di
 * IndexedDB perangkat. Siapa pun yang memegang ponsel kasir yang sudah pernah
 * login bisa melihat katalog dan antrean lokalnya. Perlindungannya adalah
 * kunci layar ponsel — sama seperti laci uang dijaga kunci laci, bukan oleh
 * mesin kasirnya.
 */

/** Kunci refresh token — harus sama dengan RT_KEY di context.tsx. */
const RT_KEY = "ionowu_rt";

/** true bila perangkat ini pernah berhasil login, walau sesinya sudah habis. */
export function pernahLoginDiPerangkatIni(): boolean {
  try {
    return localStorage.getItem(RT_KEY) !== null;
  } catch {
    // Penyimpanan diblokir (mode privat, kebijakan perangkat). Diperlakukan
    // sebagai "belum pernah" — lebih aman salah meminta login daripada salah
    // membuka layar kasir.
    return false;
  }
}

export type KeputusanAkses =
  /** Pemulihan sesi masih berjalan — jangan render, jangan pindah halaman. */
  | "tunggu"
  /** Boleh masuk. */
  | "izinkan"
  /** Belum pernah login di perangkat ini — wajib ke /login. */
  | "ke-login";

export interface KondisiAkses {
  /** AuthProvider masih memulihkan sesi. */
  isLoading: boolean;
  /** Ada sesi hidup di memori. */
  adaSesi: boolean;
  /** Perangkat pernah dipakai login (refresh token tersimpan). */
  pernahLogin: boolean;
}

/**
 * Untuk layar kasir: toleran terhadap sesi mati, TIDAK toleran terhadap
 * perangkat asing.
 */
export function aksesKasir({ isLoading, adaSesi, pernahLogin }: KondisiAkses): KeputusanAkses {
  if (isLoading) return "tunggu";
  if (adaSesi) return "izinkan";
  // Inti aturannya: sesi mati + perangkat dikenal = kemungkinan besar offline,
  // bukan penyusup. Kasir tetap boleh berjualan; antreannya menyusul.
  if (pernahLogin) return "izinkan";
  return "ke-login";
}

/**
 * Untuk layar pemilik (dasbor, katalog): butuh sesi hidup.
 *
 * Tidak ada janji offline di sini — angkanya memang datang dari server, dan
 * menampilkan cangkang kosong tanpa sesi hanya terlihat seperti aplikasi rusak.
 */
export function aksesPemilik({ isLoading, adaSesi }: KondisiAkses): KeputusanAkses {
  if (isLoading) return "tunggu";
  return adaSesi ? "izinkan" : "ke-login";
}
