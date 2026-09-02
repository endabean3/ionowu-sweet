# Kepatuhan & Aspek Hukum (Indonesia)

> **Status:** 🟡 **Kerangka + pembagian tanggung jawab** · **Prioritas:** 🟠 P1 (turun dari P0 setelah §1c)
> ⚠️ Dokumen ini **bukan** nasihat hukum. Isinya adalah daftar pertanyaan yang harus
> ditanyakan kepada penasihat hukum, bukan jawaban.

---

## 1. Kenapa Kerangka Ini Kosong

Keputusan di beberapa dokumen lain **menunggu jawaban hukum**, dan mengisinya dengan tebakan
akan lebih berbahaya daripada membiarkannya kosong:

| Menunggu | Untuk |
|---|---|
| Masa wajib simpan bukti transaksi | [RETENTION.md](../30-data/RETENTION.md) §2 |
| Kewajiban penghapusan data pribadi | [RETENTION.md](../30-data/RETENTION.md) §3 |
| Batas retensi audit log per paket | [PRICING-PACKAGING.md](../00-product/PRICING-PACKAGING.md) §7 |
| Status sub-merchant vs agregator | [INTEGRATION-QRIS.md](../20-api/INTEGRATION-QRIS.md) §2 |

---

## 1b. 🔴 Perubahan Status: Sistem Kini Menyimpan PII Pelanggan

Sampai 21 Agustus 2026, sistem ini **tidak menyimpan satu pun data pribadi pelanggan** —
argumen kepatuhan yang sangat kuat dan sederhana.

[ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md) mengubahnya: CRM
menambahkan nama, nomor telepon, email, tanggal lahir, dan riwayat belanja per individu.

**Konsekuensinya, kewajiban UU PDP berubah dari teoretis menjadi nyata.** Konsultasi hukum
yang semula P2 kini layak dinaikkan ke **P1** dan diselesaikan sebelum fitur CRM dirilis,
bukan sesudah.

Yang sudah kami siapkan secara teknis: tabel `customer_consents`
([DATA-MODEL](../30-data/DATA-MODEL.md) §5B) mencatat persetujuan per jenis, dapat dicabut,
dan penegakannya ada di kode — bukan diserahkan pada kebijakan tenant.

---

## 1c. Pembagian Tanggung Jawab Legal (keputusan 22 Agustus 2026)

Pemilik produk menetapkan: **urusan legalitas usaha ditangani owner/tenant**, tim fokus
membangun aplikasi. Itu tepat — tetapi perlu dipisahkan dari kewajiban yang **melekat pada
kita sebagai penyedia platform** dan tidak bisa dialihkan lewat syarat & ketentuan.

### ✅ Tanggung jawab tenant (owner) — kita tidak ikut campur

| Hal | Keterangan |
|---|---|
| Izin usaha, NIB, NPWP usaha | Legalitas badan usaha tenant |
| Sertifikasi produk (PIRT, halal, BPOM) | Melekat pada produk mereka |
| Kewajiban pajak usaha tenant | Kita sediakan data & ekspor, bukan nasihat pajak |
| Kepatuhan ketenagakerjaan | Upah, BPJS, kontrak karyawan |
| Kebenaran isi data yang mereka masukkan | |

Sikap kita: **sediakan alat & ekspor data yang rapi**, jangan memberi nasihat hukum atau pajak.

### 🔴 Tidak bisa dialihkan ke tenant

| Hal | Kenapa melekat pada kita |
|---|---|
| **UU PDP sebagai pemroses data** | Kita **menyimpan** PII pelanggan tenant di server kita ([ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md)). Kewajiban pemroses tidak hilang karena tenant setuju pada T&C. |
| **Pelaporan kebocoran data** | Bila server kita jebol, kitalah yang wajib melapor |
| **Keamanan penyimpanan & transmisi** | Sepenuhnya di bawah kendali kita |
| **Lisensi pembayaran** *(bila jadi agregator)* | Menghindarinya dengan **model sub-merchant** ([INTEGRATION-QRIS](../20-api/INTEGRATION-QRIS.md) §2) |

### Cara memperkecil paparan kita — tanpa menghambat pembangunan

1. **Model sub-merchant untuk QRIS**, bukan agregator → menghapus kebutuhan lisensi pembayaran.
   *Sudah menjadi arah yang disetujui.*
2. **Perjanjian pemrosesan data (DPA)** dengan tenant → menegaskan tenant adalah pengendali
   data, kita pemroses. Ini dokumen, bukan pekerjaan rekayasa.
3. **Consent tercatat di sistem** → `customer_consents` sudah ada
   ([DATA-MODEL](../30-data/DATA-MODEL.md) §5B). Ini justru **melindungi tenant juga**.
4. **Minimalkan PII yang disimpan** → nama & telepon cukup; email dan tanggal lahir opsional.

> **Kesimpulan praktisnya: pembangunan aplikasi jalan terus.** Yang dibutuhkan hanya dua
> dokumen (T&C + DPA) sebelum tenant berbayar pertama — pekerjaan legal, bukan rekayasa.
> Tidak ada satu pun yang memblokir Fase 0.

---

## 2. Wilayah yang Harus Diperiksa

### A. Pelindungan Data Pribadi (UU PDP)

- [ ] Apakah kami pengendali atau prosesor data? (kemungkinan **prosesor** — data milik tenant)
- [ ] Kewajiban perjanjian pemrosesan data dengan tenant
- [ ] Kewajiban pelaporan bila terjadi kebocoran, dan tenggat waktunya
- [ ] Hak subjek data (akses, koreksi, penghapusan) dan cara memenuhinya
- [ ] **Bagaimana hak penghapusan berinteraksi dengan bukti transaksi** — pelanggan minta
      dihapus, tetapi transaksinya adalah catatan keuangan tenant yang wajib disimpan.
      Usulan: anonimkan `customers`, pertahankan transaksi tanpa `customer_id`.
- [ ] **PII di perangkat kasir** — katalog pelanggan tersimpan di IndexedDB agar bisa
      dilayani offline. Perangkat hilang = PII ikut hilang. Apakah ini memicu kewajiban
      pelaporan?
- [ ] Apakah data boleh disimpan di server luar negeri? **Ini menentukan region VPS**
      ([INFRASTRUCTURE.md](../50-operations/INFRASTRUCTURE.md) §5)

> Pertanyaan terakhir harus dijawab **sebelum** memilih penyedia VPS, bukan sesudah.

### B. Perpajakan & Bukti Transaksi

- [ ] Kapan tenant wajib memungut PPN, dan apakah sistem harus mendukungnya?
- [ ] Apakah struk kami memenuhi syarat sebagai bukti transaksi yang sah?
- [ ] Kewajiban e-faktur — sudah masuk Non-Goals
      ([VISION-SCOPE.md](../00-product/VISION-SCOPE.md) §6); pastikan itu pilihan yang aman
- [ ] Masa simpan bukti pembukuan

### C. Pembayaran & QRIS

- [ ] Apakah model kami butuh lisensi penyelenggara jasa pembayaran?
- [ ] Kewajiban bila menjadi agregator (**hindari bila memungkinkan**)
- [ ] Kewajiban KYC merchant
- [ ] Kewajiban pelaporan transaksi

### D. Ketenagakerjaan & Pemantauan

- [ ] Apakah audit trail atas aktivitas kasir memerlukan pemberitahuan kepada karyawan?
- [ ] Apakah data shift dan kinerja kasir termasuk data pribadi?

---

## 3. Yang Sudah Kami Lakukan Benar

Tanpa menunggu nasihat hukum, beberapa keputusan sudah selaras dengan praktik yang baik:

* Isolasi multi-tenant yang ketat ([SECURITY.md](./SECURITY.md) §2)
* Zero-Sensitive-Logging (§7)
* Argon2id untuk password dan PIN (§4)
* Audit trail append-only (§6)
* **Data tidak pernah dihapus karena alasan penagihan**
  ([PRICING-PACKAGING.md](../00-product/PRICING-PACKAGING.md) §5)
* Ekspor penuh tersedia bagi tenant yang berhenti

---

## 4. Tindakan

1. **Konsultasi hukum** sebelum Fase 1 — terutama soal model pembayaran dan lokasi data
2. Susun Syarat & Ketentuan serta Kebijakan Privasi
3. Susun perjanjian pemrosesan data untuk tenant
4. Kembali ke dokumen di §1 dan ganti angka usulan dengan angka yang sah
