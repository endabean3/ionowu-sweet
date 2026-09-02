# Budget Performa

> **Status:** 🟡 Draft · **Prioritas:** 🟠 P1

---

## 1. Prinsip

Janji performa yang tidak diberlakukan otomatis akan memudar diam-diam. Setiap angka di
sini adalah **gerbang CI**, bukan cita-cita.

Perangkat acuan: **Android RAM 3GB, jaringan 3G** — bukan laptop pengembang.

---

## 2. Backend

| Metrik | Budget | Diukur |
|---|---|---|
| Checkout p99 | **< 5 ms** | k6 di CI + produksi |
| Checkout p99.9 | < 50 ms | |
| Lookup varian (barcode) p99 | < 3 ms | Jalur scan-to-cart FR-20 |
| Ingest sync (batch 50) p95 | < 500 ms | |
| Kueri dasbor p95 | < 500 ms | Boleh lambat |

> `<5ms` adalah anggaran **pemrosesan server**, tidak termasuk waktu jaringan. Membingungkan
> keduanya membuat target terlihat mustahil di jaringan 3G, padahal yang diukur berbeda.

## 3. Frontend

| Metrik | Budget |
|---|---|
| **INP p75** (jalur kasir) | **< 50 ms** |
| LCP p75 (layar kasir) | < 2,0 s |
| CLS | < 0,05 |
| Waktu interaktif, muat dingin, 3G | < 5 s |
| **Scan barcode → item di keranjang** | **< 100 ms** |

Baris terakhir adalah janji yang paling dirasakan kasir (FR-20). Ia harus diukur ujung ke
ujung, bukan sebagai rata-rata komponen.

## 4. Ukuran Bundle

| Aset | Budget |
|---|---|
| JS awal (gzip) | < 150 KB |
| CSS awal | < 30 KB |
| Total rute kasir | < 300 KB |
| Tiap ikon SVG | < 10 KB |
| Font per varian | < 40 KB |

**Rute kasir harus jadi bundle terkecil.** Kode dasbor pemilik tidak boleh ikut terkirim ke
perangkat kasir — ia dimuat terpisah.

## 5. Image Docker

| Image | Budget | Sumber |
|---|---|---|
| pos-engine | **< 25 MB** | PRD §4 |
| web-app | < 250 MB | Belum ditetapkan di PRD |
| intelligence-worker | < 500 MB | Aktif Fase 1 ([ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md)) |

## 6. Memori Runtime

| Layanan | Budget | Catatan |
|---|---|---|
| pos-engine | < 128 MB | |
| web-app | < 256 MB | |
| postgres | < 512 MB | |
| redis | < 256 MB | murni cache, `appendonly no` |
| intelligence-worker | < 512 MB | + ~512 MB ruang kerja saat agregasi malam |
| **Total** | **< 3 GB** | menentukan ukuran VPS — **8 GB** disarankan |

## 7. Penegakan

Dijalankan di **GitHub Actions** ([ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md)) —
sebelumnya gerbang ini bersifat teoretis karena belum ada platform yang menjalankannya.

```
CI: k6 → gagal bila p99 > budget
CI: bundle analyzer → gagal bila melewati batas
CI: docker images → gagal bila image melewati batas
CI: Lighthouse → gagal bila INP/LCP melewati batas
Produksi: RUM → alarm bila p75 INP > 50ms selama 24 jam
```

**Aturan:** budget yang dilanggar memblokir merge. Menaikkan budget butuh persetujuan
eksplisit dan alasan tertulis — bukan diam-diam diubah agar CI hijau.
