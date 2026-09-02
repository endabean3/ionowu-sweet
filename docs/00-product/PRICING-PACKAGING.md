# Paket & Penetapan Harga

> **Status:** 🔴 **Usulan — belum divalidasi.** Seluruh angka rupiah di bawah adalah titik awal
> diskusi, bukan keputusan.
> **Urutan baca:** dokumen **ke-8**

---

## 1. Kenapa Ini Mendesak

`plan_tier` **sudah ada di dalam skema database produksi**:

```sql
-- 10-architecture/FDR.md §2
plan_tier VARCHAR(20) DEFAULT 'free',  -- free, premium
```

Namun tidak ada satu pun dokumen yang menjelaskan apa arti `free` dan apa arti `premium`.
Kolom ini akan menentukan penggerbangan fitur di seluruh basis kode. Membiarkannya tidak
terdefinisi berarti setiap engineer akan menebak sendiri batasnya, dan tebakan itu akan
tersebar ke puluhan tempat sebelum ada yang menyadarinya.

[PRD-01](./PRD-01-POS-INTI.md) §2 juga sudah menjanjikan Hendra "paket hemat multi-outlet" —
janji harga tanpa model harga.

---

## 2. Filosofi Penetapan Harga

| Prinsip | Alasan |
|---|---|
| **Jangan pernah menyandera transaksi** | Membatasi jumlah transaksi berarti menghukum pelanggan justru saat mereka sukses, dan mendorong mereka kembali ke nota tulis tangan di jam sibuk |
| **Berbayar per outlet, bukan per pengguna** | Tingkat keluar-masuk kasir tinggi; menagih per pengguna menghukum praktik yang benar (setiap kasir punya akun sendiri) dan mendorong akun bersama — yang merusak seluruh audit trail |
| **Free tier harus benar-benar berguna** | Ia adalah jalur akuisisi utama, bukan versi cacat |
| **Batas harus jelas & terprediksi** | Pemilik UMKM sangat sensitif terhadap tagihan yang mengejutkan |

> **Konsekuensi keamanan yang sering terlewat:** menagih per pengguna secara langsung
> bertentangan dengan [SECURITY.md](../40-security/SECURITY.md) — audit trail anti-fraud
> hanya bermakna bila setiap kasir punya akun sendiri. Model harga tidak boleh membuat
> berbagi akun menjadi pilihan yang menghemat uang.

---

## 3. Usulan Paket

| | 🆓 **Free** | ⭐ **Premium** | 🏢 **Multi-Outlet** |
|---|---|---|---|
| **Harga/bulan** | Rp 0 | *(perlu riset)* | *(per outlet)* |
| Outlet | 1 | 1 | Tidak dibatasi |
| Pengguna | 2 | Tidak dibatasi | Tidak dibatasi |
| Produk / varian | 50 | Tidak dibatasi | Tidak dibatasi |
| **Transaksi** | **Tidak dibatasi** | **Tidak dibatasi** | **Tidak dibatasi** |
| **Offline-first penuh** | ✅ | ✅ | ✅ |
| Kasir, shift, struk | ✅ | ✅ | ✅ |
| Tunai + QRIS | ✅ | ✅ | ✅ |
| Audit log | 30 hari | 12 bulan | 24 bulan |
| Riwayat laporan | 30 hari | Tidak dibatasi | Tidak dibatasi |
| Impor massal (FR-13) | ❌ | ✅ | ✅ |
| Ringkasan WA harian (FR-51) | ❌ | ✅ | ✅ |
| Prediksi restock (FR-50) | ❌ | ✅ | ✅ |
| **CRM: data pelanggan** | 100 pelanggan | Tidak dibatasi | Tidak dibatasi |
| **CRM: segmentasi RFM** | ❌ | ✅ | ✅ |
| **CRM: prediksi churn** | ❌ | ✅ | ✅ |
| **BI: laporan ringkasan harian** | 30 hari | Tidak dibatasi | Tidak dibatasi |
| **BI: analisis performa produk** | ❌ | ✅ | ✅ |
| Laporan konsolidasi | — | — | ✅ |
| Transfer stok antar-outlet | — | — | ✅ |

**Dua keputusan yang saya anggap paling penting di tabel ini:**

1. **Offline-first ada di paket gratis.** Itu janji inti produk. Menjualnya sebagai fitur
   premium akan mengubah pembeda utama menjadi sekadar tambahan berbayar, dan merusak
   posisi produk yang dinyatakan di [VISION-SCOPE.md](./VISION-SCOPE.md) §4.
2. **Transaksi tidak dibatasi di semua paket.** Pembatasan transaksi merusak North Star
   metric kita sendiri ([SUCCESS-METRICS.md](./SUCCESS-METRICS.md) §1) — kita akan menagih
   pelanggan tepat pada perilaku yang ingin kita dorong.

---

## 4. Pemicu Peningkatan Paket

Batas free tier dirancang untuk mengikat pada **saat usaha bertumbuh**, bukan saat mencoba:

| Pemicu | Kenapa terasa wajar bagi pemilik |
|---|---|
| Melewati 50 produk | Katalog bertambah = usaha berkembang |
| Butuh kasir ke-3 | Menambah karyawan = mampu membayar |
| Ingin melihat laporan >30 hari | Butuh perbandingan bulanan |
| Membuka cabang kedua | Momen paling jelas untuk naik paket |

Batas harus diberitahukan **sebelum** tercapai ("tersisa 5 slot produk"), tidak pernah
sebagai penghalang mendadak di tengah jam sibuk.

---

## 5. Aturan Penurunan Paket & Tunggakan

Ini menyangkut catatan keuangan orang lain — dan sikap kita di sini menentukan kepercayaan:

| Situasi | Aturan |
|---|---|
| Pembayaran gagal | Masa tenggang 7 hari, fitur tetap penuh |
| Setelah masa tenggang | Turun ke Free — **kasir tetap berfungsi** |
| Melewati batas Free setelah turun | Data lama tetap dapat dibaca; penambahan baru dibatasi |
| **Data pelanggan** | **Tidak pernah dihapus karena alasan penagihan.** Selalu bisa diekspor. |
| Berhenti berlangganan | Ekspor penuh tersedia 90 hari |

> **Aturan yang tidak bisa ditawar:** kasir tidak boleh berhenti berfungsi karena
> masalah tagihan. Mematikan kasir toko yang sedang buka berarti menghentikan pendapatan
> pelanggan kita — kerusakan reputasinya jauh melebihi nilai tagihan mana pun.

---

## 6. Yang Masih Harus Diriset

- [ ] Harga pesaing sesungguhnya di pasar Indonesia ([COMPETITIVE-LANDSCAPE.md](./COMPETITIVE-LANDSCAPE.md))
- [ ] Kesediaan membayar — wawancara 10 pemilik
- [ ] Apakah biaya QRIS diteruskan atau diserap
- [ ] Apakah menagih per outlet atau per tenant untuk paket multi-outlet
- [ ] Model penagihan tahunan (diskon berapa persen?)
- [ ] Struktur biaya sisi kami per tenant (menentukan batas bawah harga)

---

## 7. Implikasi Teknis

Bila paket ini disetujui, konsekuensinya menyebar ke beberapa dokumen:

* [30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md) butuh tabel langganan, riwayat tagihan,
  dan penghitung pemakaian.
* `plan_tier` di FDR §2 perlu diperluas: `free`, `premium`, `multi_outlet`, ditambah status
  langganan (`active`, `grace`, `past_due`).
* Penggerbangan fitur harus **terpusat di satu tempat**, bukan tersebar sebagai
  `if plan == 'premium'` di seluruh basis kode.
* Batas retensi audit log per paket bertabrakan dengan kewajiban hukum penyimpanan bukti
  transaksi — periksa [40-security/COMPLIANCE-ID.md](../40-security/COMPLIANCE-ID.md) sebelum mengunci angka.
* Kuota rate limit di [API-GUIDELINES.md](../20-api/API-GUIDELINES.md) §6 saat ini seragam
  untuk semua tenant; perlu diputuskan apakah dibedakan per paket.
