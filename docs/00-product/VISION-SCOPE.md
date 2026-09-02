# Visi & Ruang Lingkup Produk

> **Status:** 🟡 Draft — butuh persetujuan pemilik produk
> **Versi:** 0.1 · 21 Agustus 2026
> **Urutan baca:** dokumen **ke-1** dari 00-product. Berikutnya: [PERSONAS-JTBD.md](./PERSONAS-JTBD.md)

---

## 1. Masalah yang Kami Selesaikan

UMKM ritel dan kafe di Indonesia menjalankan usaha bernilai puluhan juta rupiah per bulan
dengan pencatatan yang tidak dapat diandalkan. Tiga kegagalan yang berulang:

1. **Jaringan mati = usaha berhenti.** Sebagian besar POS berbasis cloud menjadi tidak berguna
   saat internet padam. Toko lalu kembali ke nota tulis tangan, dan data hari itu hilang selamanya.
2. **Selisih kas tidak pernah terjelaskan.** Pemilik tahu uang berkurang, tetapi tidak tahu
   di transaksi mana, oleh siapa, dan kapan.
3. **Data ada, wawasan tidak.** POS mencatat ribuan transaksi lalu menyajikan tabel. Pemilik
   tetap harus menyimpulkan sendiri apa yang harus dibeli besok pagi.

Ditambah satu masalah yang jarang diakui: **kasir menatap layar 8 jam sehari**. Antarmuka POS
umumnya putih menyilaukan dengan tabel padat — melelahkan mata, dan kelelahan menimbulkan
kesalahan input yang berujung pada selisih kas.

## 2. Visi

> Menjadi sistem kasir yang **tetap bekerja saat semua hal lain gagal**, dan mengubah setiap
> transaksi menjadi satu keputusan yang bisa langsung dijalankan pemilik usaha —
> tentang **stok**, maupun tentang **pelanggan**.

## 3. Kenapa Sekarang

* Penetrasi QRIS membuat pembayaran non-tunai menjadi standar bahkan di warung kecil.
* PWA kini setara aplikasi native untuk kebutuhan POS — tanpa biaya app store, tanpa friksi instalasi.
* Perangkat Android murah (RAM 3GB) sudah mampu menjalankan POS berbasis browser dengan baik.
* Kualitas jaringan di luar kota besar masih tidak menentu — *offline-first* adalah keunggulan
  nyata, bukan sekadar fitur pelengkap.

## 4. Posisi Produk

Bagi **pemilik UMKM ritel dan kafe di Indonesia** yang **kehilangan uang akibat pencatatan
yang buruk dan jaringan yang tidak stabil**, ionowu sweet adalah **sistem kasir PWA
offline-first** yang **tetap berjualan tanpa internet dan memberi tahu apa yang harus
dibeli besok**.

Berbeda dari POS cloud konvensional, kami memperlakukan perangkat kasir sebagai **sumber
kebenaran sementara**, bukan sekadar terminal tampilan.

## 5. Prinsip Produk

Lima aturan ini menyelesaikan perdebatan saat prioritas bertabrakan:

| # | Prinsip | Artinya saat harus memilih |
|---|---|---|
| 1 | **Kasir tidak boleh menunggu** | Kecepatan mengalahkan kelengkapan fitur. Ragu, buang fiturnya. |
| 2 | **Offline adalah keadaan normal, bukan pengecualian** | Setiap fitur dirancang untuk mode offline lebih dulu, online belakangan. |
| 3 | **Uang harus selalu bisa dijelaskan** | Setiap rupiah yang berpindah punya jejak audit. Tanpa kecuali. |
| 4 | **Wawasan harus berujung tombol** | Rekomendasi yang tidak bisa langsung dijalankan sama saja dengan laporan. |
| 5 | **Layar itu tempat kerja, bukan dasbor** | Nyaman dipandang 8 jam mengalahkan tampilan yang mengesankan 8 detik. |

---

## 6. Non-Goals (Yang Sengaja **Tidak** Kami Bangun)

Bagian ini sama pentingnya dengan daftar fitur. Tanpa ini, ruang lingkup akan melar diam-diam.

| Tidak dibangun | Alasan |
|---|---|
| **Akuntansi lengkap** (jurnal, neraca, laba-rugi resmi) | Ranah berbeda; cukup sediakan ekspor ke aplikasi akuntansi |
| **Payroll & absensi karyawan** | Bersinggungan dengan shift, tetapi masalah yang sama sekali lain |
| **E-commerce / toko online** | Kami sistem kasir toko fisik. Integrasi boleh, membangun sendiri tidak. |
| **Marketplace pemasok** | Menarik, tetapi butuh sisi penawaran yang tidak kami miliki |
| ~~Loyalitas & CRM pelanggan~~ | ✅ **Dikeluarkan 21 Agu 2026** — CRM & BI kini bagian produk ([ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md)). Yang **tetap** di luar: program loyalitas berpoin penuh & kampanye pemasaran massal |
| **Manajemen meja & KDS restoran** | Segmen berbeda (*full-service dining*) dengan alur kerja berbeda |
| **Aplikasi native iOS/Android** | PWA cukup; app store menambah biaya rilis tanpa manfaat setara |
| **Dukungan multi-mata uang** | Rupiah saja. Ekspansi lintas negara bukan hipotesis saat ini. |

> **Aturan:** memindahkan sesuatu dari daftar ini ke daftar fitur membutuhkan ADR, bukan
> sekadar permintaan di grup chat.

---

## 7. Asumsi & Risiko

| # | Asumsi | Bila salah | Cara menguji lebih awal |
|---|---|---|---|
| A1 | UMKM mau mengganti POS lamanya | Seluruh strategi akuisisi gugur | Wawancara 10 pemilik: apa yang membuat mereka pindah? |
| A2 | Offline-first adalah alasan cukup untuk beralih | Jadi sekadar fitur pelengkap, bukan pembeda | Tanyakan frekuensi & dampak gangguan jaringan |
| A3 | Pemilik akan menjalankan rekomendasi restock | Fitur AI jadi hiasan | Uji rekomendasi manual via WhatsApp sebelum membangun ML |
| A4 | Input katalog awal bukan penghalang | Tenant mendaftar lalu tidak pernah aktif | Ukur waktu dari daftar → transaksi pertama (lihat [ONBOARDING-ACTIVATION.md](./ONBOARDING-ACTIVATION.md)) |
| A5 | Kasir mau memakai *keyboard-first* | Investasi kecepatan sia-sia | Amati langsung kasir bekerja saat jam sibuk |

**Risiko terbesar bukan teknis, melainkan A4.** Sistem tercepat sekalipun tidak berarti apa-apa
bila pemilik menyerah saat harus memasukkan 300 SKU.

---

## 8. Definisi Sukses (12 Bulan)

Angka-angka ini adalah **usulan awal yang harus divalidasi**, bukan target yang sudah disepakati.

| Dimensi | Ambang keberhasilan |
|---|---|
| Adopsi | 100 outlet aktif berbayar |
| Keterikatan | ≥70% outlet aktif bertransaksi ≥5 hari/minggu |
| Retensi | Churn bulanan <5% |
| Bukti nilai inti | ≥30% outlet pernah bertransaksi saat offline (membuktikan pembeda utama dipakai) |
| Kepercayaan | Nol insiden kebocoran data antar-tenant |

Rincian metrik ada di [SUCCESS-METRICS.md](./SUCCESS-METRICS.md).
