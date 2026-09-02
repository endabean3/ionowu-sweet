# 20-api — Kontrak Antar-Komponen

Antarmuka yang menghubungkan PWA kasir, `pos-engine`, dan `web-app`. Kontrak di sini adalah
**janji**: klien lama tetap beredar di perangkat kasir, jadi perubahan yang merusak akan
mematikan toko yang belum sempat memperbarui aplikasinya.

| # | Dokumen | Isi | Status |
|:-:|---|---|:---:|
| 1 | [API-GUIDELINES.md](./API-GUIDELINES.md) | Prinsip, envelope, RFC 7807, idempotensi, rate limit | ✅ |
| 2 | [openapi.yaml](./openapi.yaml) | Spesifikasi 22 endpoint | ✅ |
| 3 | [ERROR-CATALOG.md](./ERROR-CATALOG.md) | Daftar kode error + kelas retry | 🟡 Draft |
| 4 | [INTEGRATION-QRIS.md](./INTEGRATION-QRIS.md) | Alur pembayaran & rekonsiliasi | 🔴 Vendor belum dipilih |

---

## Aturan Folder Ini

1. **Kode error tidak pernah berubah arti.** Lihat [ERROR-CATALOG.md](./ERROR-CATALOG.md) §6.
2. **Setiap endpoint yang menulis wajib idempoten.** Klien offline akan mengirim ulang.
3. **Setiap endpoint wajib punya tabel penyangga** di [30-data/](../30-data/). Ini pernah
   dilanggar: 22 endpoint dibangun di atas 8 tabel — lihat [DATA-MODEL.md](../30-data/DATA-MODEL.md) §1.
4. **Versi di URL (`/v1/`).** Perubahan yang merusak berarti `/v2/`, bukan mengubah `/v1/`.

## Yang Masih Kurang

* Kebijakan versi & masa dukungan versi lama — belum ada
* Uji kontrak yang memastikan `openapi.yaml` cocok dengan implementasi — lihat
  [60-quality/TESTING-STRATEGY.md](../60-quality/TESTING-STRATEGY.md)
* Endpoint untuk `settlement_reports` ([INTEGRATION-QRIS.md](./INTEGRATION-QRIS.md) §6)
