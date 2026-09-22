# Backlog — Apa yang Belum Ada, dan Mana yang Duluan

> **Status:** ✅ Baseline — diaudit langsung dari kode, bukan dari ingatan
> **Diaudit:** 2026-09-22 terhadap commit `main` setelah PR #49
> **Urutan baca:** pelengkap [ROADMAP.md](./ROADMAP.md). Roadmap menjawab *fase apa*;
> berkas ini menjawab *besok kerjakan apa*.

---

## 1. Kenapa Dokumen Ini Ada

[ROADMAP.md](./ROADMAP.md) menyusun pekerjaan per fase, dan [PRD-01](./PRD-01-POS-INTI.md)
mendaftar FR-01…FR-51 sebagai kebutuhan. Keduanya ditulis **sebelum** kode ada, jadi tidak
satu pun menjawab pertanyaan yang benar-benar ditanyakan tiap pagi: *dari semua itu, mana
yang sudah jalan di produksi dan mana yang belum?*

Menjawabnya dari ingatan berbahaya. Contoh yang baru saja terjadi: selama berbulan-bulan
`cashier` diperlakukan sebagai peran yang ada, padahal **tidak ada satu pun cara membuat
akun karyawan** — setiap tenant hanya punya owner, dan seluruh aturan RBAC yang membedakan
kasir dari owner tidak pernah bisa dipakai siapa pun. Tidak ada dokumen yang menyebutnya
karena semua dokumen menganggapnya sudah ada.

Karena itu setiap baris di bawah **diverifikasi terhadap kode** — rute di `router.go`,
halaman di `apps/web/src/app/`, atau kueri di `30-data/queries/`. Kalau tidak bisa
ditunjukkan di kode, statusnya ❌.

---

## 2. Status FR-01…FR-51

| FR | Kebutuhan | Status | Bukti / catatan |
|---|---|---|---|
| FR-01 | Registrasi tenant | ✅ | `POST /auth/register` |
| **FR-02** | **Login cepat kasir dengan PIN 4–6 digit** | **❌** | `auth.go` tidak menyentuh `pin_hash` sama sekali. PIN yang ada adalah **PIN persetujuan** (refund/void/diskon) — beda hal. Pergantian shift antar-karyawan masih lewat email+password |
| FR-03 | RBAC | 🟡 | 5 peran di skema; `platform`/`distributor` ditolak eksplisit `TenantMiddleware` |
| FR-04 | Multi-outlet | ❌ | Karyawan baru ditugaskan ke SEMUA outlet; tidak ada layar penugasan |
| FR-05 | Session & token refresh | ✅ | JWT EdDSA, refresh 30 hari |
| FR-10 | Manajemen produk | 🟡 | Tambah/ubah/arsip ✅. **Foto produk ❌** — kolom `image_url` ada di migrasi 00003 tetapi tidak dibaca UI mana pun |
| FR-11 | Varian & opsi | ✅ | |
| FR-12 | Barcode & SKU | ✅ | PR #49 |
| FR-13 | Impor massal CSV | 🟡 | Jalan, tetapi **sinkron** — PRD meminta *job-based* asinkron. Ribuan SKU akan menahan satu permintaan HTTP |
| FR-14 | Pengingat bahan menipis | ✅ | Matcha/Custard/Strawberry + ikon + teks |
| FR-20 | Scan-to-cart tanpa jeda | ✅ | PR #49 |
| FR-21 | Navigasi keyboard-first | 🟡 | Ada: `Enter`, `Escape`, `F2`. **Belum:** `+`/`−` ubah qty, `Delete` hapus baris — padahal [pages/kasir.md](../70-design-system/pages/kasir.md) menuntutnya |
| **FR-22** | **Split & multi-payment** | **❌** | Payload selalu mengirim TEPAT satu pembayaran (`kasir/page.tsx`). Server & skema `payments` sudah mendukung banyak baris |
| FR-23 | QRIS dinamis | ⛔ | Terblokir vendor |
| FR-24 | Cetak struk termal | 🟡 | Termal & browser ✅. **E-receipt WhatsApp ❌** |
| FR-25 | Diskon & pajak | ✅ | Diskon PR #49. Pajak 0 (Warung Wangi bukan PKP) |
| FR-30 | Buka shift | ✅ | |
| FR-31 | Kas masuk/keluar | ✅ | |
| FR-32 | Tutup shift & Z-Report | ✅ | `/laporan-harian` (PR #49) |
| FR-40 | IndexedDB | ✅ | Dexie |
| FR-41 | Operasional 100% offline | ✅ | Diuji Playwright |
| FR-42 | Auto-sync saat online | 🟡 | Jalan, tetapi sync berkala **hanya bila ada antrean lokal** — perubahan dari server tidak ditarik sendiri (lihat §4) |
| FR-43 | Resolusi konflik stok | ✅ | Kunci baris Postgres |
| FR-50 | 1-click restock order | ❌ | Tidak ada endpoint maupun layar |
| FR-51 | Laporan omzet harian ke WA | ⛔ | Terblokir BSP WhatsApp |

**Ringkas:** 13 ✅ · 6 🟡 · 5 ❌ · 2 ⛔

---

## 3. Prioritas

Urutannya ditentukan satu pertanyaan: **apa yang paling mungkin membuat toko percontohan
berhenti berjualan, atau kehilangan uang tanpa ketahuan?** Bukan apa yang paling menarik
dikerjakan.

### P0 — sebelum toko percontohan (bukan fitur; kesiapan operasional)

| # | Pekerjaan | Kenapa duluan |
|---|---|---|
| 1 | **Uji restore backup sekali, catat waktunya** | Backup yang belum pernah dipulihkan bukan backup. Ini satu-satunya hal di daftar ini yang kegagalannya **tidak bisa diperbaiki** |
| 2 | **Alarm kritis + uptime monitor eksternal** | Tanpa ini, toko mati diketahui dari telepon pemilik, bukan dari sistem |
| 3 | **Pengguna `app_readonly`** | Kredensial web yang bocor saat ini bisa menulis ke seluruh basis data |
| 4 | **Verifikasi 429 rate limit di produksi** | Sudah di-merge sejak PR #31 tetapi tidak pernah dibuktikan hidup |
| 5 | **Runbook deploy §5 D–E di ponsel sungguhan** | Butuh pemilik, bukan kode |

[GO-LIVE](../50-operations/GO-LIVE.md) memuat 43 kotak yang belum dicentang; lima di atas
adalah yang tidak bisa ditunda.

### P1 — celah yang terasa di meja kasir

| # | Pekerjaan | FR | Kenapa |
|---|---|---|---|
| 6 | **Split & multi-payment** | FR-22 | Pembeli bayar Rp 20.000 tunai + sisanya transfer adalah kejadian biasa. Sekarang kasir **tidak punya jalan** selain memaksa satu metode — dan mencatat angka yang tidak sesuai kenyataan. Server sudah siap; yang kurang hanya layar |
| 7 | **Pintasan `+` / `−` / `Delete`** | FR-21 | Sudah dijanjikan dokumen desain. Murah, dan kasir bertangan satu (satu tangan memegang barang) mendapat manfaat tiap transaksi |
| 8 | **Login PIN kasir + auto-lock 5 menit** | FR-02 | Pergantian shift sekarang mengetik email+password di ponsel. Auto-lock juga ada di [GO-LIVE](../50-operations/GO-LIVE.md) dan **wajib jalan saat offline** |
| 9 | **Tarik perubahan server secara berkala** | FR-42 | Lihat §4 — celah yang sama pernah memutus alur member |

### P2 — setelah toko percontohan stabil

Void PIN sudah selesai; sisanya: **pesanan tertahan**, **transfer stok antar-outlet**,
**penugasan karyawan per-outlet** (FR-04), **foto produk** (FR-10), **impor CSV job-based**
(FR-13), **1-click restock** (FR-50).

### ⛔ Terblokir — bukan pekerjaan teknis

QRIS (vendor) · WhatsApp resmi (BSP) → FR-23, FR-24 e-receipt, FR-51 ·
wawancara Warung Wangi & Media Boga · T&C + DPA.

---

## 4. Satu pola yang layak diingat

FR-42 ditandai 🟡, bukan ✅, karena alasan yang sudah sekali menggigit:

Sync berkala di `lib/sync/provider.tsx` hanya berjalan **bila ada antrean lokal**. Artinya
perubahan yang lahir di SERVER — member yang mendaftar sendiri lewat QR nota, harga yang
diubah pemilik dari perangkat lain — tidak pernah ditarik sampai aplikasi dibuka ulang.
Untuk member, celah itu sudah ditambal dengan penelusuran langsung
(`GET /customers/lookup`), tetapi **penambalnya per-kasus**. Katalog dan harga masih punya
lubang yang sama, dan gejalanya selalu sama: perangkat menampilkan data lama dengan penuh
percaya diri, tanpa satu pun pesan galat.

Menarik katalog tiap 20 detik bukan jawabannya — `pullCatalog` menghapus lalu menulis ulang
SELURUH katalog, dan itu mahal di ponsel murah tepat saat kasir sedang bekerja. Jawaban yang
benar kemungkinan besar pull inkremental berbasis `updated_at`, yang skemanya sudah punya
kolomnya.
