# Override halaman: **Kasir / POS**

> Menimpa `../MASTER.md`. Semua yang tidak disebut di sini mengikuti MASTER.
> Layar ini dipakai ratusan kali sehari oleh orang yang sedang terburu-buru,
> sering sambil berdiri, kadang di bawah silau matahari, di perangkat murah,
> dan kadang tanpa internet. Setiap keputusan di bawah tunduk pada itu.

## Zona gerak: `fungsional`

> **Direvisi 2026-09-16 atas keputusan pemilik produk.** Sebelumnya zona ini
> `none` (mutlak): nol animasi, dan impor pustaka gerak diblokir dari jalur
> `/kasir`. Aturan itu **dicabut** — framer-motion kini berlaku di seluruh
> aplikasi, termasuk layar ini. Yang di bawah adalah batas penggantinya,
> bukan pelonggaran tanpa syarat.

Gerak di layar ini harus **fungsional**: ia menjelaskan sebab-akibat yang baru
saja terjadi. Kalau sebuah animasi bisa dihapus tanpa mengurangi pemahaman
kasir, ia dekoratif dan tidak boleh ada di sini.

**Yang boleh, dan alasannya:**

| Gerak | Alasan |
|---|---|
| Baris keranjang masuk/keluar | Kasir harus melihat barang benar-benar masuk, tanpa membaca ulang seluruh daftar |
| Bar ringkasan bawah naik/turun | Menjelaskan dari mana total itu muncul saat item pertama ditambahkan |
| Dialog (bayar, shift, printer) | Kaitan ruang antara tombol pemicu dan panel yang terbuka |
| Badge antrean sync | Perubahan status yang datang sendiri, bukan dari aksi kasir |

**Yang tetap dilarang:**

- **Stagger pada grid produk.** Grid dirender ulang setiap huruf yang diketik
  di kolom cari; stagger membuat seluruh katalog berkedip di tiap ketukan, dan
  ini jalur scan-to-cart yang dijanjikan < 100 ms.
- Animasi `width`/`height`/`top`/`left` — hanya `transform` dan `opacity`.
- Animasi layout framer-motion. Paket fitur yang dipasang sengaja
  `domAnimation`, bukan `domMax`, sehingga mesin layout animation tidak ikut
  terkirim ke perangkat kasir.
- Skeleton shimmer (lihat "Yang dilarang di layar ini" di bawah).

**Syarat yang mengikat:**

1. Durasi masuk memakai token `springTegas` (`src/lib/motion/tokens.ts`); keluar
   selalu lebih cepat daripada masuk.
2. `prefers-reduced-motion` dihormati terpusat lewat `MotionConfig
   reducedMotion="user"` + blok CSS di `globals.css`. Tidak ada komponen yang
   boleh menangani ini sendiri-sendiri.
3. Gerak tidak pernah memblokir input: tidak ada animasi yang harus selesai
   sebelum kasir bisa menekan tombol berikutnya.

**Ongkos yang diterima.** framer-motion menambah **20 kB** (gzip, First Load JS)
pada rute ini: 193 kB → 213 kB. Lihat catatan anggaran di bawah — rute ini
sudah melewati anggarannya bahkan sebelum penambahan tersebut, dan itu belum
diselesaikan.

## Ukuran — menimpa default

| Elemen | MASTER | **Kasir** |
|---|---|---|
| Tombol | `size="default"` (40px) | **`size="pos"` (48px)** |
| Tombol Bayar | — | **`size="pos-lg"` (64px)** |
| Input | `size="default"` | **`size="pos"` (48px, teks 18px, tabular)** |
| Ketebalan garis | `--stroke` (3px) | **`--stroke-lg` (4px)** |
| Teks harga di keranjang | 14px | **≥18px, bold, mono** |

## Keyboard-first — ini fitur kecepatan terbesar

Alur kasir harus bisa diselesaikan **tanpa menyentuh layar sama sekali**:

| Tombol | Aksi |
|---|---|
| (scan barcode) | Langsung masuk keranjang, tanpa klik konfirmasi |
| `Enter` | Lanjut ke pembayaran |
| `Escape` | Batalkan dialog aktif; dari keranjang kosong = keluar |
| `F2` | Cari produk manual |
| `+` / `-` | Ubah qty baris terpilih |
| `Delete` | Hapus baris terpilih (dengan undo di toast) |

Fokus harus selalu kembali ke kolom scan setelah aksi apa pun. Kalau kasir
harus mengklik kolom scan lagi, alurnya salah.

## Warna

- Kontras dinaikkan: hindari `text-muted-foreground` untuk informasi yang perlu
  dibaca. Abu-abu di atas krem hilang di bawah silau matahari.
- Total belanja memakai blok `--primary` dengan tinta hitam, bukan teks pink.
- Status offline: `ConnectionStatus` selalu terlihat di header, tidak pernah
  disembunyikan di menu.

## Yang dilarang di layar ini

- Skeleton shimmer (pakai teks "Memuat…" statis — shimmer adalah animasi)
- Toast yang muncul dengan slide panjang; pakai fade instan
- Grafik apa pun
- Maskot / ilustrasi dekoratif
- Lazy-load pada komponen di jalur transaksi utama — semuanya harus sudah siap
  sebelum kasir menekan tombol pertama

## Anggaran

**150 KB gzip.** Rute ini yang paling ketat di seluruh produk. Setiap dependensi
baru di jalur `/kasir` harus dibenarkan di PR-nya.

> **Terukur 2026-09-16 (`next build`): 213 kB First Load JS — DI ATAS anggaran.**
> Rute ini sudah 193 kB sebelum framer-motion, jadi pelanggarannya **bukan**
> disebabkan oleh gerak; framer-motion menambah 20 kB di atas utang yang sudah
> ada. Angka anggaran sengaja TIDAK dinaikkan agar utangnya tetap terlihat.
> Belum ada gerbang CI yang menegakkannya (PERFORMANCE-BUDGET §4 menyebut
> "gerbang CI", dan gerbang itu belum ada).

## Uji sebelum kirim

- [ ] Transaksi lengkap (scan → bayar → struk) selesai tanpa mouse
- [ ] Diuji dengan jaringan dimatikan di tengah transaksi
- [ ] Diuji di Android RAM 2 GB nyata, bukan emulator desktop
- [ ] INP < 200 ms saat scan berturut-turut
- [ ] Diuji di bawah cahaya terang / layar kecerahan rendah
