# Lanskap Kompetitif — Kerangka Riset

> **Status:** 🔴 **Kerangka kosong — belum diriset.** Dokumen ini sengaja tidak berisi klaim
> tentang pesaing, karena saya tidak memiliki data terverifikasi tentang harga dan fitur
> mereka per Agustus 2026. Mengisinya dengan tebakan justru berbahaya: keputusan harga dan
> diferensiasi akan dibangun di atas fiksi.
> **Urutan baca:** dokumen **ke-10**

---

## 1. Kenapa Dokumen Ini Tetap Ada Meski Kosong

Dua keputusan produk sudah **menunggu** data ini:

* [PRICING-PACKAGING.md](./PRICING-PACKAGING.md) §6 — harga tidak bisa ditetapkan tanpa titik acuan pasar.
* [VISION-SCOPE.md](./VISION-SCOPE.md) §4 — klaim posisi "berbeda dari POS cloud konvensional"
  belum terbukti sampai kita tahu apa yang benar-benar ditawarkan pesaing.

---

## 2. Yang Harus Diriset

Pemain POS UMKM di Indonesia yang perlu diperiksa (nama-nama yang lazim disebut di pasar ini —
**verifikasi mana yang masih aktif per 2026**):

- [ ] Moka POS
- [ ] Majoo
- [ ] Olsera
- [ ] Qasir
- [ ] Pawoon
- [ ] POS bawaan dompet digital (GoBiz, dsb.)
- [ ] **Pesaing sesungguhnya: buku tulis dan kalkulator** — jangan diremehkan

> Untuk sebagian besar calon pelanggan, pesaing utama bukan POS lain, melainkan **tidak
> memakai apa pun**. Riset harus mencakup pemilik yang belum pernah memakai POS sama sekali,
> bukan hanya yang sedang berpindah.

---

## 3. Kerangka Perbandingan

Isi satu tabel per pesaing. Kolom yang ditandai ⭐ berkaitan langsung dengan tesis produk kita.

| Dimensi | Isi dengan |
|---|---|
| Harga (paket & batasan) | Angka nyata, bukan "mulai dari" |
| Batas transaksi | Apakah mereka membatasi? |
| ⭐ **Kemampuan offline** | Sungguhan atau sekadar klaim? **Uji sendiri: matikan Wi-Fi.** |
| ⭐ Perilaku saat internet mati | Bisa checkout? Cetak struk? Data hilang? |
| Model perangkat | PWA / native / butuh perangkat keras khusus |
| Kebutuhan perangkat keras | Terikat perangkat tertentu? |
| Multi-outlet | Termasuk paket apa? |
| Dukungan QRIS | Langsung atau lewat pihak ketiga |
| Onboarding | Berapa lama sampai transaksi pertama? |
| ⭐ Kualitas antarmuka kasir | Kecepatan, kelelahan mata, kurva belajar |
| Fitur kecerdasan | Laporan saja, atau bisa langsung dijalankan? |
| Ekspor data | Bisa pelanggan membawa datanya pergi? |

---

## 4. Metode Riset yang Disarankan

Urut dari yang paling bernilai:

1. **Daftar dan pakai sendiri.** Ukur waktu daftar → transaksi pertama pada tiap pesaing.
   Ini sekaligus tolok ukur untuk target <30 menit di [ONBOARDING-ACTIVATION.md](./ONBOARDING-ACTIVATION.md).
2. **Uji offline secara langsung.** Matikan jaringan di tengah transaksi. Ini uji tunggal
   yang paling menentukan apakah pembeda kita nyata.
3. **Wawancara pengguna mereka.** Kenapa mereka memilihnya, dan apa yang membuat frustrasi.
   Ini menutup asumsi A1 di [VISION-SCOPE.md](./VISION-SCOPE.md) §7.
4. **Baca ulasan aplikasi.** Keluhan yang berulang adalah peta peluang.

> **Uji offline adalah prioritas nomor satu.** Seluruh strategi produk bertumpu pada
> hipotesis bahwa pesaing menangani offline dengan buruk. Bila ternyata mereka
> menanganinya dengan baik, [VISION-SCOPE.md](./VISION-SCOPE.md) harus ditulis ulang —
> dan lebih baik mengetahuinya sekarang daripada setelah Fase 1.

---

## 5. Keluaran yang Diharapkan

Setelah riset selesai, dokumen ini harus menjawab tiga pertanyaan:

1. **Di mana kita harus setara?** (Fitur yang tanpanya kita tidak dianggap serius.)
2. **Di mana kita harus jauh lebih baik?** (Hipotesis saat ini: offline-first, kenyamanan kasir.)
3. **Di mana kita sengaja lebih lemah?** (Sudah sebagian terjawab di Non-Goals
   [VISION-SCOPE.md](./VISION-SCOPE.md) §6.)

**Pemilik & tenggat riset:** *belum ditetapkan* — perlu diputuskan sebelum Fase 1 dimulai.
