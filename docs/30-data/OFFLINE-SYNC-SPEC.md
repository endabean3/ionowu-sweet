# Spesifikasi Sinkronisasi Offline & Resolusi Konflik

> **Status:** 🟡 Draft · **Prioritas:** 🔴 **P0**
> **Dokumen Terkait:** [FDR.md](../10-architecture/FDR.md) §3, [DATA-MODEL.md](./DATA-MODEL.md), [ERROR-CATALOG.md](../20-api/ERROR-CATALOG.md)

---

## 1. Ruang Lingkup

[FDR.md](../10-architecture/FDR.md) §3 menjelaskan alur normal. Dokumen ini menangani
**yang terjadi saat alur itu gagal** — dan di sistem POS offline-first, kegagalan bukan
kasus tepi, melainkan operasi sehari-hari.

Setiap keputusan di sini menyangkut uang sungguhan yang sudah berpindah tangan.

---

## 2. Prinsip Penyelesaian Konflik

| # | Prinsip | Konsekuensi |
|---|---|---|
| 1 | **Transaksi offline sudah terjadi** | Barang keluar, uang diterima. Server tidak boleh "membatalkan" masa lalu. |
| 2 | **Jangan pernah menolak penjualan** | Menolak sync = menghapus pendapatan nyata dari catatan |
| 3 | **Lebih baik data janggal daripada data hilang** | Stok minus dapat direkonsiliasi; penjualan hilang tidak dapat dipulihkan |
| 4 | **Perangkat adalah sumber kebenaran untuk transaksi** | Server adalah sumber kebenaran untuk katalog & harga |
| 5 | **Setiap konflik meninggalkan jejak** | Rekonsiliasi butuh bukti, bukan hasil akhir saja |

> Prinsip 3 adalah yang paling sering dilanggar oleh sistem POS. Naluri engineer adalah
> menjaga konsistensi data; naluri yang benar di sini adalah **menjaga catatan penjualan**.

---

## 3. Konflik & Penyelesaiannya

### A. Dua perangkat menjual barang terakhir yang sama

```
Stok server: 1 unit
Perangkat A (offline) jual 1 → stok lokal 0
Perangkat B (offline) jual 1 → stok lokal 0
Keduanya tersinkron → server harus memotong 2 dari stok 1
```

| Pilihan | Penilaian |
|---|---|
| Tolak yang kedua | ❌ Melanggar prinsip 2 — penjualan nyata terhapus |
| **Terima keduanya, stok jadi −1** | ✅ **Dipilih** |

Tindak lanjut wajib: catat `stock_events` dengan `balance_after = -1`, naikkan
`stock_reconciliation_alerts`, tampilkan ke manager: *"Stok Matcha −1. Kemungkinan
penjualan ganda saat offline atau stok fisik tidak akurat. Lakukan opname."*

Stok minus adalah **informasi yang berguna**, bukan kerusakan data — ia menunjukkan tempat
yang perlu dihitung ulang.

### B. Jam perangkat salah

Perangkat kasir murah kerap punya jam yang meleset berjam-jam. Ini merusak laporan per jam,
urutan FIFO, dan penentuan shift.

**Penyelesaian:** klien mengirim `device_time` **dan** `device_clock_offset` (selisih terhadap
server yang diukur saat sinkronisasi terakhir). Server menyimpan keduanya:

```
offline_created_at       -- waktu perangkat, apa adanya
offline_created_at_adj   -- setelah dikoreksi offset
synced_at                -- waktu server
```

Laporan memakai versi terkoreksi; audit memakai versi mentah. Bila offset >2 jam, tandai
transaksi untuk ditinjau — dan peringatkan kasir agar memperbaiki jam perangkatnya.

### C. Transaksi tiba setelah shift ditutup

Sudah dibahas sebagai pertanyaan terbuka #1 di [DATA-MODEL.md](./DATA-MODEL.md) §6.
**Keputusan:** Z-Report yang sudah dicetak **tidak pernah berubah**.

```
shift.status = 'closed', Z-Report tercetak
   └─► transaksi terlambat masuk
       ├─ tetap terhubung ke shift_id aslinya (untuk audit)
       ├─ ditandai is_late_arrival = TRUE
       ├─ TIDAK mengubah expected_cash / variance shift
       └─► masuk laporan "penerimaan terlambat" untuk manager
```

Alasannya sederhana: kasir sudah menghitung uang fisik dan menandatangani hasilnya.
Mengubah angka itu setelahnya membuat kasir bertanggung jawab atas selisih yang muncul
setelah ia pulang.

### D. Batch gagal separuh

**Setiap transaksi dinilai sendiri-sendiri.** Satu transaksi bermasalah tidak boleh
memblokir 40 lainnya.

```json
HTTP 207
{ "results": [
    {"id":"01J...A","status":"accepted"},
    {"id":"01J...B","status":"duplicate"},
    {"id":"01J...C","status":"failed","code":"INVALID_TRANSACTION_TOTAL"}
]}
```

Klien menandai `accepted` dan `duplicate` sebagai `synced`, mempertahankan `failed` untuk
diulang sesuai kelasnya di [ERROR-CATALOG.md](../20-api/ERROR-CATALOG.md) §2.

> **Bahaya *head-of-line blocking*:** bila satu transaksi rusak menghalangi seluruh antrean,
> IndexedDB akan terus tumbuh sampai penuh — satu-satunya jalur menuju "kasir tidak bisa
> berjualan". Karena itu antrean **wajib** bisa melewati item yang gagal permanen.

### E. Katalog berubah saat perangkat offline

Perangkat menjual dengan harga lama. Prinsip 4 berlaku: **harga pada saat transaksi adalah
harga yang sah.** `sales_items` sudah menyimpan `unit_price` dan `unit_cost` sendiri —
jangan pernah menghitung ulang laporan memakai harga sekarang.

Bila produk dihapus saat perangkat offline, transaksinya tetap diterima. `variant_id` tetap
merujuk baris yang di-arsip, bukan dihapus — inilah alasan katalog memakai `is_active`,
bukan `DELETE`.

---

## 4. IndexedDB Penuh — Satu-satunya Kegagalan Total

[PRD](../00-product/PRD-01-POS-INTI.md) §4 menargetkan 10.000 transaksi offline.
Ini satu-satunya jalur menuju "toko tidak bisa berjualan"
([SCALABILITY-RELIABILITY.md](../10-architecture/SCALABILITY-RELIABILITY.md) §3).

### Penyimpanan persisten wajib diminta

Browser **dapat menghapus IndexedDB** saat perangkat kehabisan ruang, kecuali aplikasi
meminta izin persisten:

```js
await navigator.storage.persist();
```

Tanpa ini, seluruh janji offline berdiri di atas penyimpanan yang boleh dibuang sistem
operasi kapan saja, tanpa pemberitahuan. **Panggilan ini harus dilakukan saat onboarding,
dan kegagalannya harus dilaporkan.**

### Tingkat peringatan

| Pemakaian | Perilaku |
|---|---|
| <70% | Normal |
| 70% | Peringatan halus ke kasir |
| 85% | Peringatan mencolok + saran cari koneksi |
| 95% | Peringatan penuh layar; **buang antrean analytics** ([ANALYTICS-EVENTS](../00-product/ANALYTICS-EVENTS.md) §5) |
| 100% | 🔴 Transaksi baru gagal — **harus dicegah sebelum sampai sini** |

Yang dibuang saat tertekan, berurutan: cache gambar → antrean analytics → katalog (bisa
diambil ulang) → **tidak pernah transaksi**.

---

## 5. Aturan Antrean

1. **FIFO berdasarkan `offline_created_at`.** Urutan penting untuk perhitungan stok.
2. **Batch maksimal 50 transaksi**, agar tidak melewati batas ukuran permintaan.
3. **Satu batch berjalan pada satu waktu** per perangkat. Batch paralel merusak urutan.
4. **Backoff:** 5s, 15s, 60s, 300s, lalu setiap 15 menit.
5. **Kegagalan permanen dipindahkan ke antrean mati**, tidak menghalangi antrean utama.
6. **Antrean mati harus terlihat** oleh manager, bukan tersembunyi di log.

---

## 6. Yang Harus Diuji

Ini yang membuat NFR "100% toleransi offline" dapat dibuktikan, bukan sekadar diklaim:

- [ ] Matikan jaringan di tengah checkout
- [ ] Matikan jaringan di tengah sinkronisasi batch
- [ ] Dua perangkat menjual stok terakhir yang sama
- [ ] Jam perangkat dimundurkan 3 jam
- [ ] Sinkronisasi setelah shift ditutup
- [ ] Isi IndexedDB sampai 10.000 transaksi
- [ ] Muat ulang browser dengan antrean masih berisi
- [ ] Perangkat offline selama 7 hari lalu kembali online

Rinciannya masuk ke [60-quality/TESTING-STRATEGY.md](../60-quality/TESTING-STRATEGY.md).
