# Onboarding & Aktivasi Tenant

> **Status:** 🟡 Draft
> **Prioritas:** 🔴 **P0 untuk Fase 1** — ini risiko terbesar produk, bukan sekadar fitur
> **Urutan baca:** dokumen **ke-7**

---

## 1. Masalahnya

[VISION-SCOPE.md](./VISION-SCOPE.md) §7 mencatat **A4** sebagai risiko terbesar:

> Sistem tercepat sekalipun tidak berarti apa-apa bila pemilik menyerah saat harus
> memasukkan 300 SKU.

Ini adalah kegagalan diam-diam. Tenant mendaftar, terlihat sebagai angka pertumbuhan yang
menyenangkan, lalu tidak pernah bertransaksi sekali pun. `FR-13` (impor massal) memang ada,
tetapi impor mengasumsikan pemilik **sudah punya berkas katalog rapi** — sebagian besar UMKM tidak.

Perbedaan cara pandang yang menentukan:

| Cara pandang | Akibatnya |
|---|---|
| ❌ Onboarding = wizard setup | Ukurannya "wizard selesai". Tenant bisa selesai tetapi tetap mati. |
| ✅ Onboarding = perjalanan menuju **transaksi sungguhan pertama** | Ukurannya nilai yang benar-benar diterima. |

---

## 2. Momen Aktivasi

> **Aktivasi = shift pertama ditutup dengan minimal 1 transaksi sungguhan.**

Bukan "akun dibuat". Bukan "produk ditambahkan". Bukan bahkan "transaksi pertama" — karena
menutup shift membuktikan pemilik memercayakan **uang sungguhan** pada sistem ini.

---

## 3. Jalur Aktivasi Bertahap

Prinsipnya: **tunda setiap kerja yang bisa ditunda.** Pemilik harus mencapai transaksi
pertama sebelum diminta memasukkan seluruh katalog.

```
DAFTAR                    →  <2 menit
  nama usaha, email, sandi
  ↓ otomatis: tenant + outlet pertama + akun owner (FR-01)

5 PRODUK PERTAMA          →  <10 menit   ← DIBATASI DI SINI
  "Masukkan 5 barang terlaris Anda dulu"
  bukan "Impor seluruh katalog"
  ↓
TRANSAKSI PERCOBAAN       →  <2 menit
  Transaksi Rp 0 yang ditandai, untuk merasakan alurnya
  ↓
TRANSAKSI SUNGGUHAN PERTAMA          ← nilai pertama tersampaikan
  ↓
TUTUP SHIFT PERTAMA                  ← ✅ AKTIVASI
  ↓
─────────── setelah aktivasi, baru minta sisanya ───────────
  ↓
LENGKAPI KATALOG          →  impor massal (FR-13), atau bertahap sambil jualan
UNDANG KASIR              →  buat PIN untuk Sari
HUBUNGKAN QRIS            →  onboarding payment gateway
```

**Pembalikan yang paling penting:** hubungkan QRIS **setelah** aktivasi, bukan sebelum.
Verifikasi merchant butuh berhari-hari — menaruhnya di awal berarti mengubur momen aktivasi
di balik proses pihak ketiga yang tidak kami kendalikan. Transaksi tunai sudah cukup untuk
membuktikan nilai produk.

---

## 4. Strategi Input Katalog

Hambatan terbesar butuh lebih dari satu jalan keluar:

| Jalur | Untuk siapa | Prioritas |
|---|---|---|
| **Manual, 5 barang terlaris** | Semua orang, sebagai langkah pertama | 🔴 Fase 0 |
| **Impor Excel/CSV** (FR-13) | Yang pindah dari POS lain | 🟠 Fase 1 |
| **Template per jenis usaha** | Isi templatenya ada di [MARKET-SEGMENTS](./MARKET-SEGMENTS.md) §6 — parfum refill, bahan kue, warung kopi, kelontong | 🟠 Fase 1 |
| **Tambah sambil jualan** | Barang baru dibuat langsung dari layar kasir | 🟠 Fase 1 |
| **Impor terpandu berbantuan tim** | Tenant bernilai tinggi | manual dulu |
| Pindai foto menu / OCR | Menarik, mahal | ⚪ Fase 3 |

> **"Tambah sambil jualan" kemungkinan besar lebih berdampak daripada impor massal.**
> Ia menghapus kebutuhan katalog lengkap di muka sepenuhnya — pemilik cukup mulai berjualan,
> dan katalognya tumbuh sendiri. Layak diuji lebih dulu sebelum menyempurnakan alur impor.

---

## 5. Ke Mana Tenant Menghilang

| Tahap | Kenapa berhenti | Penangkal |
|---|---|---|
| Setelah daftar | "Nanti saja" | Ingatkan via WA dalam 24 jam |
| Input produk | Terasa seperti pekerjaan tanpa ujung | Batasi jadi 5 barang; tampilkan progres |
| Sebelum transaksi pertama | Takut merusak pencatatan sungguhan | Mode percobaan yang jelas & bisa dihapus |
| Setelah beberapa transaksi | Kembali ke cara lama saat sibuk | Alur kasir harus **lebih cepat** dari nota tulis tangan |
| Tutup shift pertama | Kas tidak cocok, hilang kepercayaan | Layar variance yang menjelaskan, bukan menuduh |

---

## 6. Perlakuan Data Percobaan

Keputusan yang harus diambil sebelum implementasi: transaksi percobaan **tidak boleh**
mencemari laporan sungguhan.

```sql
-- Usulan: penanda pada sales_transactions
is_sandbox BOOLEAN DEFAULT FALSE
```

Aturan: data sandbox dikecualikan dari seluruh laporan dan metrik, dapat dihapus massal
dalam satu tindakan, dan **penandanya tidak bisa dibalik** — transaksi sungguhan tidak
boleh bisa diubah menjadi sandbox untuk menyembunyikan penjualan.

> Ini memengaruhi skema di [30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md) dan definisi
> "Transaksi" di [SUCCESS-METRICS.md](./SUCCESS-METRICS.md) §5. Putuskan sekarang, karena
> menambahkannya belakangan berarti menulis ulang setiap kueri laporan.

---

## 7. Ukuran Keberhasilan

| Metrik | Target |
|---|---|
| Daftar → transaksi sungguhan pertama | Median **<30 menit** |
| Daftar → aktivasi (tutup shift) | **<24 jam** untuk >60% tenant |
| Drop-off di tahap input katalog | **<20%** |
| Tenant aktif tanpa bantuan tim sama sekali | **>80%** di akhir Fase 1 |
