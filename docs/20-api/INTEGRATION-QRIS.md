# Integrasi Pembayaran QRIS

> **Status:** 🔴 Draft — **vendor belum dipilih** · **Prioritas:** 🔴 P0
> **Dokumen Terkait:** [SECURITY.md](../40-security/SECURITY.md) §5, [ERROR-CATALOG.md](./ERROR-CATALOG.md) §D

---

## 1. Keadaan Saat Ini

[PRD](../00-product/PRD-01-POS-INTI.md) FR-23 menjanjikan QRIS dinamis, dan
[SECURITY.md](../40-security/SECURITY.md) §5 sudah menetapkan verifikasi HMAC untuk
webhook-nya. Keduanya **mengasumsikan sebuah payment gateway yang belum pernah dipilih**.

Ini celah P0 karena pilihan vendor menentukan hal-hal yang tidak bisa diabstraksi belakangan:
format webhook, perilaku kedaluwarsa, jadwal settlement, dan cara rekonsiliasi.

---

## 2. Kriteria Pemilihan Vendor

| Kriteria | Kenapa menentukan |
|---|---|
| **Biaya per transaksi** | Margin UMKM tipis; selisih 0,2% terasa nyata |
| **Jadwal settlement** | T+1 atau T+2 memengaruhi arus kas pemilik |
| **Kualitas webhook** | Ada percobaan ulang? Ada jaminan urutan? |
| **Dukungan sandbox** | Tanpa ini, pengujian mustahil |
| **Onboarding merchant** | Berapa hari verifikasi? Berdampak pada [ONBOARDING](../00-product/ONBOARDING-ACTIVATION.md) |
| **Model sub-merchant** | Apakah tiap tenant jadi merchant sendiri, atau kita jadi agregator? |

> **Pertanyaan terakhir adalah yang terbesar, dan bukan sekadar teknis.** Menjadi agregator
> berarti uang pelanggan mengalir melalui rekening kita — itu membawa kewajiban lisensi dan
> kepatuhan yang sepenuhnya berbeda. Model sub-merchant (tiap tenant punya rekening sendiri)
> jauh lebih ringan secara hukum, dan hampir pasti pilihan yang benar di tahap ini.
> Perlu dikonfirmasi di `40-security/COMPLIANCE-ID.md`.

Kandidat yang perlu dievaluasi: Midtrans, Xendit, Doku, dan penyedia QRIS langsung dari bank.
**Angka biaya dan jadwal settlement harus diambil dari penawaran resmi**, bukan dari asumsi.

---

## 3. Alur Pembayaran

```
Kasir pilih QRIS (F2)
   │
   ▼
POST /sales  → transaksi dibuat, payment_status = 'pending'
   │
   ▼
pos-engine → gateway: minta QR dinamis (nominal presisi)
   │
   ├─ gagal ──► QRIS_GENERATION_FAILED ──► ⚠️ arahkan kasir ke TUNAI
   │
   ▼
QR tampil di layar · timer mundur berjalan
   │
   ├─ pelanggan bayar ──► webhook masuk ──► verifikasi HMAC + timestamp
   │                                  ──► payment_status = 'paid'
   │                                  ──► struk tercetak
   │
   ├─ kedaluwarsa ──────► QRIS_EXPIRED ──► kasir buat ulang atau ganti tunai
   │
   └─ webhook TIDAK PERNAH DATANG ──► lihat §5 ⚠️
```

---

## 4. Keputusan Kritis: QRIS Butuh Internet

QRIS **tidak bisa bekerja offline.** Ini pengecualian tunggal terhadap prinsip offline-first
di [VISION-SCOPE.md](../00-product/VISION-SCOPE.md) §5, dan harus dinyatakan terbuka.

| Keadaan | Perilaku wajib |
|---|---|
| Offline, kasir tekan F2 (QRIS) | Nonaktifkan tombol dengan pesan jelas: *"QRIS butuh internet. Gunakan tunai."* |
| Online saat QR terbit, lalu offline | Transaksi tetap `pending`; **jangan cetak struk lunas** |
| Kembali online | Tanyakan status ke gateway (jangan menunggu webhook saja) |

> **Yang paling berbahaya adalah baris kedua.** Bila internet putus setelah QR ditampilkan,
> kasir tidak tahu apakah pelanggan sudah membayar. Mencetak struk lunas berdasarkan tebakan
> berarti barang keluar tanpa uang masuk. Aturannya: **status `pending` tidak pernah menjadi
> `paid` tanpa konfirmasi dari gateway.**

---

## 5. Webhook Tidak Datang

Webhook hilang adalah keadaan normal di sistem pembayaran, bukan kasus langka.
Mengandalkan webhook saja berarti sebagian pembayaran akan menggantung selamanya.

**Wajib ada polling sebagai jaring pengaman:**

```
Transaksi 'pending' berumur >30 detik
   └─► tanyakan status ke gateway (poll)
       ├─ paid    → selesaikan transaksi
       ├─ pending → ulangi (30s, 60s, 120s, s/d 15 menit)
       └─ expired → tandai kedaluwarsa
```

Transaksi yang masih `pending` setelah 15 menit masuk antrean **rekonsiliasi manual** —
dan harus muncul di dasbor, bukan hanya di log.

---

## 6. Rekonsiliasi Settlement

Status `paid` **bukan berarti uang sudah masuk rekening**. Settlement umumnya T+1.
Ketidaksesuaian di sini adalah sumber sengketa uang yang paling umum.

| Ketidaksesuaian | Penanganan |
|---|---|
| Gateway punya pembayaran, kami tidak | Transaksi yatim → **uang masuk tanpa penjualan**, wajib diselidiki |
| Kami punya `paid`, gateway tidak | Kemungkinan webhook palsu → **alarm keamanan** |
| Nominal berbeda | Selalu diselidiki manual |
| Nominal settlement ≠ jumlah transaksi | Biaya gateway; catat sebagai biaya, bukan selisih |

Diperlukan job harian yang menarik laporan settlement dan mencocokkannya. Ini membutuhkan
tabel `settlement_reports` yang belum ada di
[30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md) — perlu ditambahkan setelah vendor dipilih.

---

## 7. Keamanan

Sudah ditetapkan di [SECURITY.md](../40-security/SECURITY.md) §5:
verifikasi HMAC-SHA256 dan jendela timestamp 300 detik. Tambahan yang berlaku di sini:

* Endpoint webhook **tidak boleh** memakai autentikasi JWT — gateway tidak punya token kita.
  Signature-lah autentikasinya.
* Dedup lewat `webhook_events.external_event_id`
  ([DATA-MODEL.md](../30-data/DATA-MODEL.md) §3G).
* **Selalu balas 200** untuk webhook duplikat, agar gateway berhenti mengulang.
* Signature gagal = **alarm keamanan**, bukan sekadar baris log.
* Rahasia webhook per tenant, dirotasi berkala — lihat `50-operations/CONFIGURATION.md`.

---

## 8. Yang Harus Diputuskan Sebelum Implementasi

- [ ] Pilih vendor
- [ ] Model sub-merchant atau agregator (**bawa ke pertimbangan hukum**)
- [ ] Siapa menanggung biaya transaksi — kita atau tenant?
- [ ] Masa berlaku QR (usulan: 5 menit)
- [ ] Apakah refund lewat gateway atau tunai?
- [ ] Bagaimana onboarding merchant tiap tenant
- [ ] Sandbox untuk pengujian otomatis
