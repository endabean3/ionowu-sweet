# Roadmap & Fase Rilis

> **Status:** 🟡 Draft — butuh persetujuan pemilik produk
> **Urutan baca:** dokumen **ke-4**. Sebelumnya: [PRD-01-POS-INTI.md](./PRD-01-POS-INTI.md) · Berikutnya: [SUCCESS-METRICS.md](./SUCCESS-METRICS.md)

---

## 1. Kenapa Dokumen Ini Ada

PRD menjelaskan **ruang lingkup**; roadmap menjelaskan **urutan**. Saat ini
[PRD-01](./PRD-01-POS-INTI.md) menyajikan FR-01 sampai FR-51 sebagai satu daftar datar,
seolah semuanya sama pentingnya. Itu tidak mungkin benar — dan tanpa urutan, tim akan
membangun bagian yang paling menyenangkan lebih dulu, bukan yang paling menentukan.

---

## 2. Prinsip Pengurutan

1. **Bangun jalur uang lebih dulu.** Fitur yang menyentuh transaksi dan kas mendapat prioritas
   tertinggi, karena kesalahan di sana paling mahal dan paling merusak kepercayaan.
2. **Buktikan pembeda utama lebih awal.** Offline-first adalah alasan keberadaan produk ini.
   Menundanya berarti menunda satu-satunya hal yang membuat kami berbeda.
3. **Aktivasi mendahului kecanggihan.** Tenant yang tidak pernah sampai transaksi pertama
   tidak akan pernah menikmati fitur AI.
4. **Kecerdasan datang setelah data ada.** Prediksi restock butuh riwayat penjualan.
   Membangunnya di bulan pertama berarti melatih model dengan tabel kosong.

---

## 3. Fase

### 🔴 Fase 0 — Fondasi Bisa Berjualan (MVP)

**Tujuan:** satu toko sungguhan bisa berjualan seharian penuh tanpa nota tulis tangan.

| Termasuk | FR |
|---|---|
| Registrasi tenant, login, PIN kasir | FR-01, FR-02, FR-05 |
| RBAC (3 peran: owner, manager, cashier) | FR-03 |
| **Super admin + break-glass** | [RBAC-MODEL](../40-security/RBAC-MODEL.md) §3 |
| Produk & varian, barcode/SKU | FR-10, FR-11, FR-12 |
| **Stok desimal + UOM + konversi + `item_type`** | [MARKET-SEGMENTS](./MARKET-SEGMENTS.md) §4, §4b |
| Alur kasir: keranjang, bayar, struk | FR-20, FR-21, FR-24, FR-25 |
| Tunai + QRIS | FR-22, FR-23 |
| Buka/tutup shift + rekonsiliasi | FR-30, FR-32 |
| **Offline penuh + auto-sync** | **FR-40, FR-41, FR-42, FR-43** |
| Audit log aksi sensitif | SECURITY §6 |

**Kriteria lulus fase — bukan "kode selesai", melainkan:**
- [ ] Satu toko percontohan berjualan **7 hari berturut-turut** memakai sistem ini sebagai
      satu-satunya kasir
- [ ] Minimal satu kejadian offline nyata tertangani tanpa kehilangan data
- [ ] Selisih kas dapat dijelaskan setiap hari
- [ ] Kasir baru bisa dilatih dalam satu shift

> **Sengaja belum ada:** multi-outlet, AI, dasbor pemilik, impor massal.
> Toko percontohan boleh diinput katalognya secara manual oleh tim.

---

### 🟠 Fase 1 — Siap Dijual

**Tujuan:** tenant bisa mendaftar dan berhasil aktif **tanpa bantuan tim**.

| Termasuk | FR |
|---|---|
| Impor massal Excel/CSV | FR-13 |
| Alert stok berbasis warna | FR-14 |
| Kas masuk/keluar (petty cash) | FR-31 |
| Refund & void berpersetujuan | `/sales/{id}/refund` |
| Stock opname | `/stock/opname` |
| Dasbor pemilik (omzet real-time) | — |
| Ringkasan omzet harian ke WA | FR-51 |
| **Layanan Python aktif** ([ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md)) | — |
| **Prediksi restock V0/V1** | FR-50 sebagian |
| **CRM dasar:** data pelanggan, consent, segmentasi RFM | ADR-0006 |
| **BI dasar:** tabel ringkasan harian & performa produk | [ANALYTICS-BI](../10-architecture/ANALYTICS-BI.md) |
| **SOP lapis 1–2:** template per arketipe + checklist | [SOP-MODULE](./SOP-MODULE.md) §7 |
| **BOM ringan** — prasyarat arketipe C & parfum refill | [MARKET-SEGMENTS](./MARKET-SEGMENTS.md) §5 |
| Onboarding mandiri | [ONBOARDING-ACTIVATION.md](./ONBOARDING-ACTIVATION.md) |
| **Peran gudang & SPG** | [RBAC-MODEL](../40-security/RBAC-MODEL.md) §2 |
| **Pesanan tertahan** (*held order*) — prasyarat SPG | menutup celah FR |
| Penagihan & paket | [PRICING-PACKAGING.md](./PRICING-PACKAGING.md) |

**Kriteria lulus fase:**
- [ ] 10 tenant mendaftar sendiri dan mencapai transaksi pertama tanpa campur tangan tim
- [ ] Waktu daftar → transaksi pertama **< 30 menit** (median)
- [ ] Fondasi produksi siap: `CONFIGURATION.md`, `BACKUP-DR.md`, runbook (lihat [DOCS-MAP.md](../DOCS-MAP.md))

---

### 🟡 Fase 2 — Bertumbuh

**Tujuan:** melayani pemilik multi-outlet dan menepati janji "intelligence".

| Termasuk | FR |
|---|---|
| Multi-outlet penuh + laporan konsolidasi | FR-04, [MULTI-OUTLET.md](./MULTI-OUTLET.md) |
| Transfer stok antar-outlet | — |
| **Prediksi restock V2/V3** | FR-50 |
| Analisis keranjang belanja | FDR §1 |
| **Prediksi churn pelanggan** | ADR-0006 |
| **Deteksi anomali anti-fraud** | [ANALYTICS-BI](../10-architecture/ANALYTICS-BI.md) §7 |
| Dasbor BI lanjutan & ekspor | idem |
| **Portal pelanggan** (riwayat, e-struk, kelola consent) | [RBAC-MODEL](../40-security/RBAC-MODEL.md) §4 |
| Laporan lanjutan & ekspor akuntansi | — |

> **Prasyarat mutlak:** prediksi restock membutuhkan ≥8 minggu riwayat penjualan per outlet.
> Fase ini tidak bisa dimulai lebih awal hanya karena tim ingin mengerjakannya.

---

### ⚪ Fase 3 — Ditunda (Belum Berkomitmen)

**Portal distributor** (alur B2B dua arah — butuh ADR tersendiri, menyentuh Non-Goals
"marketplace pemasok"), loyalitas berpoin, integrasi pembukuan, aplikasi pelanggan.
Semuanya menunggu bukti permintaan dari Fase 1–2. Jangan direncanakan detail sekarang.

---

## 4. Tampilan Now / Next / Later

```
NOW (Fase 0)          NEXT (Fase 1)           LATER (Fase 2+)
─────────────────     ─────────────────       ─────────────────
Alur kasir            Impor massal            Multi-outlet
Offline + sync        Dasbor pemilik          Prediksi restock
Shift & kas           Onboarding mandiri      Transfer stok
RBAC + audit          Penagihan               Analisis keranjang
Tunai + QRIS          Refund & opname         Ekspor akuntansi
```

---

## 5. ⚠️ Perbaikan Penomoran FR

Judul-judul bagian di [PRD-01](./PRD-01-POS-INTI.md) menyebut rentang yang **tidak terisi penuh**:

| Judul bagian menjanjikan | Yang benar-benar ada | Hilang |
|---|---|---|
| FR-10 s.d. FR-15 | FR-10…FR-14 | FR-15 |
| FR-20 s.d. FR-29 | FR-20…FR-25 | FR-26…FR-29 |
| FR-30 s.d. FR-34 | FR-30…FR-32 | FR-33, FR-34 |
| FR-40 s.d. FR-45 | FR-40…FR-43 | FR-44, FR-45 |
| FR-50 s.d. FR-55 | FR-50, FR-51 | FR-52…FR-55 |

Ini bisa berarti dua hal, dan keduanya butuh tindakan berbeda:

* **Bila nomor itu memang dicadangkan** untuk ruang tumbuh → ubah judul menjadi
  "FR-10 s.d. FR-19 *(FR-15+ dicadangkan)*" agar tidak ada yang mengira ada dokumen hilang.
* **Bila memang ada kebutuhan yang belum ditulis** → tulis sekarang. Kandidat yang jelas
  terasa hilang: **penanganan pelanggan menunggu / pesanan tertahan**, **cetak ulang struk**,
  dan **penyesuaian harga manual** — ketiganya muncul setiap hari di kasir nyata namun
  tidak ada satu pun FR yang mencakupnya.

---

## 6. Yang Akan Mengubah Roadmap Ini

* Wawancara pengguna membantah asumsi A1/A2 di [VISION-SCOPE.md](./VISION-SCOPE.md) §7
  → Fase 0 mungkin perlu dirumuskan ulang seluruhnya.
* Toko percontohan gagal di Fase 0 → jangan lanjut ke Fase 1; perbaiki dulu.
* Permintaan multi-outlet muncul lebih awal dari dugaan → Fase 2 sebagian naik ke Fase 1.
