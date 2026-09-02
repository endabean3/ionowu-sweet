# Kebijakan Pelaporan Kerentanan

> Berkas ini untuk **pihak luar** yang menemukan celah keamanan.
> Standar keamanan internal ada di [40-security/](../docs/40-security/).

## Melaporkan celah

**Jangan buka issue publik.** Gunakan salah satu:

1. **GitHub Security Advisory** — tab *Security* → *Report a vulnerability* (disarankan)
2. Email ke pemelihara repositori

Sertakan bila memungkinkan: langkah reproduksi, dampak, versi/commit, dan bukti konsep.

## Tanggapan yang dapat Anda harapkan

| Tahap | Target |
|---|---|
| Konfirmasi diterima | 3 hari kerja |
| Penilaian awal tingkat keparahan | 7 hari kerja |
| Perbaikan celah kritis | Sesegera mungkin, diprioritaskan di atas fitur |
| Pemberitahuan publik | Setelah perbaikan tersedia |

## Yang kami anggap kritis

Sistem ini menangani **uang UMKM** dan **data pribadi pelanggan**. Empat hal berikut
ditangani sebagai insiden tertinggi:

1. **Kebocoran data antar-tenant** — satu toko melihat data toko lain
2. **Manipulasi jalur uang** — mengubah total, memalsukan pembayaran
3. **Akses tanpa izin ke PII pelanggan**
4. **Peningkatan hak akses** — kasir bertindak sebagai owner, atau lintas cabang

## Yang berada di luar lingkup

- Serangan yang membutuhkan akses fisik ke perangkat kasir yang sudah tidak terkunci
- Rekayasa sosial terhadap pemilik atau karyawan toko
- Temuan pemindai otomatis tanpa dampak yang dapat ditunjukkan
- Kerentanan pada layanan pihak ketiga (laporkan ke vendornya)

## Komitmen kami

Kami **tidak akan menempuh jalur hukum** terhadap peneliti yang melaporkan dengan
itikad baik, tidak mengakses data pengguna lebih dari yang diperlukan untuk membuktikan
celah, dan memberi kami waktu wajar untuk memperbaiki sebelum mengumumkan.
