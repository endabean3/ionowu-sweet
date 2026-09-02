# Override halaman: **Kasir / POS**

> Menimpa `../MASTER.md`. Semua yang tidak disebut di sini mengikuti MASTER.
> Layar ini dipakai ratusan kali sehari oleh orang yang sedang terburu-buru,
> sering sambil berdiri, kadang di bawah silau matahari, di perangkat murah,
> dan kadang tanpa internet. Setiap keputusan di bawah tunduk pada itu.

## Zona gerak: `none` (mutlak)

```tsx
<MotionZone zone="none">…</MotionZone>
```

Nol animasi dekoratif. Yang tersisa hanya umpan balik fungsional CSS di bawah
100 ms: press state, fokus, dan perubahan warna baris.

ESLint memblokir impor `gsap`, `motion`, dan bahkan `@/components/motion/*`
dari `src/app/(app)/kasir/**`. Ini disengaja — di kasir, wrapper zona pun tidak
perlu, karena jawabannya selalu "tidak".

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

## Uji sebelum kirim

- [ ] Transaksi lengkap (scan → bayar → struk) selesai tanpa mouse
- [ ] Diuji dengan jaringan dimatikan di tengah transaksi
- [ ] Diuji di Android RAM 2 GB nyata, bukan emulator desktop
- [ ] INP < 200 ms saat scan berturut-turut
- [ ] Diuji di bawah cahaya terang / layar kecerahan rendah
