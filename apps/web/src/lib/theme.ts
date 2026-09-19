/**
 * Tema terang/gelap pilihan kasir, disimpan per perangkat.
 *
 * Sengaja TIDAK mengikuti prefers-color-scheme sistem: ponsel Android banyak
 * yang menyalakan mode gelap otomatis di malam hari, sementara layar kasir
 * justru paling sering dipakai di bawah silau — mode gelap yang menyala
 * sendiri di etalase kaca membuat angka lebih sulit dibaca, bukan lebih mudah.
 * Gelap hanya kalau kasir memintanya.
 *
 * Dipakai header kasir (layar lebar) dan halaman Pengaturan (ponsel — header
 * 360 px tidak punya ruang untuk tombol tema).
 */
const KUNCI = "ionowu.tema";
const GELAP = "dark-cocoa";

export function temaGelapTersimpan(): boolean {
  try {
    return localStorage.getItem(KUNCI) === GELAP;
  } catch {
    // Penyimpanan diblokir: tema jatuh ke mode terang bawaan.
    return false;
  }
}

export function terapkanTema(gelap: boolean) {
  if (gelap) {
    document.documentElement.setAttribute("data-theme", GELAP);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function simpanTema(gelap: boolean) {
  terapkanTema(gelap);
  try {
    localStorage.setItem(KUNCI, gelap ? GELAP : "oat-milk");
  } catch {
    // Tema tetap berlaku untuk sesi ini meski tidak bisa disimpan.
  }
}
