# Katalog Kode Error

> **Status:** 🟡 Draft · **Prioritas:** 🔴 P0
> **Dokumen Terkait:** [API-GUIDELINES.md](./API-GUIDELINES.md) §4, [openapi.yaml](./openapi.yaml)

---

## 1. Kenapa Katalog Ini Wajib Ada

[API-GUIDELINES.md](./API-GUIDELINES.md) §4 menetapkan **format** error, tetapi tidak pernah
mendaftar **kode**-nya. Untuk klien offline-first, ini bukan sekadar kerapian dokumentasi —
ia menentukan perilaku antrean sinkronisasi:

> Saat sebuah transaksi gagal dikirim, klien harus tahu: **coba lagi nanti**, atau
> **jangan pernah coba lagi**?

Tanpa jawaban itu, hanya ada dua kemungkinan, dan keduanya buruk:

* Klien mengulang selamanya → antrean tersumbat, IndexedDB penuh, **kasir berhenti berjualan**
  (satu-satunya jalur menuju kegagalan total — lihat [SCALABILITY-RELIABILITY.md](../10-architecture/SCALABILITY-RELIABILITY.md) §3)
* Klien menyerah terlalu cepat → **transaksi hilang permanen**, uang tidak tercatat

---

## 2. Kelas Error

Setiap kode wajib punya satu kelas. Kelas menentukan perilaku klien, bukan pesan yang ditampilkan.

| Kelas | Arti | Perilaku klien |
|---|---|---|
| 🔁 **RETRY** | Kegagalan sementara | Coba lagi dengan backoff |
| ⛔ **PERMANENT** | Tidak akan pernah berhasil | Tandai gagal, hentikan, laporkan ke pengguna |
| ✅ **ACCEPTED** | Sebenarnya sukses | Perlakukan sebagai berhasil (lihat §4) |
| 👤 **USER** | Butuh tindakan manusia | Tampilkan ke kasir, jangan ulangi otomatis |

---

## 3. Katalog

### A. Autentikasi & Otorisasi

| Kode | HTTP | Kelas | Kapan terjadi |
|---|:---:|:---:|---|
| `UNAUTHORIZED` | 401 | 👤 | Token tidak valid/tidak ada |
| `TOKEN_EXPIRED` | 401 | 🔁 | Access token kedaluwarsa → refresh lalu ulangi |
| `TOKEN_REVOKED` | 401 | ⛔ | Perangkat dicabut aksesnya. **Jangan refresh** — hapus sesi lokal |
| `REFRESH_TOKEN_REUSED` | 401 | ⛔ | Indikasi pencurian token; seluruh sesi user dicabut |
| `FORBIDDEN_ROLE` | 403 | 👤 | Peran tidak berwenang |
| `MANAGER_PIN_REQUIRED` | 403 | 👤 | Aksi butuh persetujuan manager (void, diskon >20%) |
| `INVALID_PIN` | 401 | 👤 | PIN salah |
| `PIN_LOCKED_OUT` | 423 | 👤 | Terlalu banyak percobaan PIN |

### B. Transaksi & Sinkronisasi — paling menentukan

| Kode | HTTP | Kelas | Kapan terjadi |
|---|:---:|:---:|---|
| `DUPLICATE_TRANSACTION` | 200 | ✅ | ULID sudah pernah masuk. **Bukan error** — tandai `synced` |
| `IDEMPOTENCY_KEY_REUSED` | 409 | ⛔ | Key sama, body berbeda. Bug klien, jangan ulangi |
| `INSUFFICIENT_STOCK` | 422 | ⛔ | Stok kurang. **Untuk sync offline: lihat §5** |
| `SHIFT_NOT_FOUND` | 404 | ⛔ | Shift ID tidak ditemukan saat tutup shift |
| `SHIFT_CLOSED` | 422 | ⛔ | Transaksi milik shift yang sudah ditutup → bucket *late arrival* |
| `SHIFT_NOT_OPEN` | 422 | 👤 | Kasir belum membuka shift |
| `TRANSACTION_ALREADY_VOIDED` | 422 | ⛔ | Sudah pernah di-void |
| `REFUND_EXCEEDS_TOTAL` | 422 | ⛔ | Nominal refund melebihi transaksi |
| `INVALID_TRANSACTION_TOTAL` | 422 | ⛔ | Total klien ≠ hitung ulang server. **Selalu alarm** |
| `SYNC_BATCH_TOO_LARGE` | 413 | 👤 | Klien harus memecah batch, lalu ulangi |
| `SYNC_PARTIAL_FAILURE` | 207 | 🔁 | Sebagian sukses. Ulangi **hanya** yang gagal |

> **`INVALID_TRANSACTION_TOTAL` adalah kode terpenting di seluruh katalog.** Ia menangkap
> perbedaan hasil antara rumus di klien dan di server — duplikasi yang sengaja diterima di
> [SERVICE-BOUNDARIES.md](../10-architecture/SERVICE-BOUNDARIES.md) §4. Bila kode ini pernah
> muncul di produksi, artinya struk yang dipegang pelanggan tidak cocok dengan catatan server.
> Ini insiden, bukan sekadar error.

### C. Katalog Produk

| Kode | HTTP | Kelas | Kapan terjadi |
|---|:---:|:---:|---|
| `PRODUCT_NOT_FOUND` | 404 | ⛔ | |
| `VARIANT_NOT_FOUND` | 404 | ⛔ | |
| `BARCODE_ALREADY_EXISTS` | 409 | 👤 | Barcode dipakai varian lain dalam tenant |
| `CATEGORY_NOT_FOUND` | 404 | ⛔ | |
| `IMPORT_FILE_INVALID` | 400 | 👤 | Format berkas rusak |
| `IMPORT_ROW_ERRORS` | 422 | 👤 | Sebagian baris gagal; sertakan nomor baris |
| `PLAN_LIMIT_EXCEEDED` | 402 | 👤 | Melewati batas paket ([PRICING](../00-product/PRICING-PACKAGING.md)) |

### D. Pembayaran & QRIS

| Kode | HTTP | Kelas | Kapan terjadi |
|---|:---:|:---:|---|
| `PAYMENT_GATEWAY_UNAVAILABLE` | 503 | 🔁 | Gateway mati → **arahkan ke tunai** |
| `QRIS_GENERATION_FAILED` | 502 | 🔁 | |
| `QRIS_EXPIRED` | 422 | 👤 | QR kedaluwarsa, buat baru |
| `PAYMENT_AMOUNT_MISMATCH` | 422 | ⛔ | Nominal bayar ≠ nominal transaksi |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | ⛔ | HMAC gagal. **Selalu alarm keamanan** |
| `WEBHOOK_TIMESTAMP_EXPIRED` | 401 | ⛔ | Di luar jendela 300 detik (SECURITY §5B) |
| `WEBHOOK_DUPLICATE` | 200 | ✅ | Sudah diproses; balas 200 agar gateway berhenti mengulang |

### E. Sistem

| Kode | HTTP | Kelas | Kapan terjadi |
|---|:---:|:---:|---|
| `RATE_LIMITED` | 429 | 🔁 | Hormati header `Retry-After` |
| `INTERNAL_ERROR` | 500 | 🔁 | |
| `SERVICE_UNAVAILABLE` | 503 | 🔁 | Sedang deploy / degradasi |
| `DATABASE_UNAVAILABLE` | 503 | 🔁 | Klien tetap offline, antrean menunggu |
| `TENANT_SUSPENDED` | 402 | 👤 | Tunggakan. **Kasir tetap berfungsi** — lihat [PRICING](../00-product/PRICING-PACKAGING.md) §5 |

---

## 4. Kelas ACCEPTED — Kenapa Ada

`DUPLICATE_TRANSACTION` dan `WEBHOOK_DUPLICATE` **terlihat** seperti error tetapi sebenarnya
adalah hasil yang benar dari sistem idempoten.

Skenario yang lazim: klien mengirim batch, server menyimpannya, lalu jaringan putus sebelum
respons sampai. Klien mengulang. Server melihat ULID yang sama.

Bila klien memperlakukan ini sebagai kegagalan, transaksi akan **selamanya tersangkut**
di antrean lokal — padahal datanya sudah aman di server. Antrean tumbuh, IndexedDB penuh,
dan pada akhirnya kasir berhenti berjualan karena sesuatu yang sebenarnya sudah berhasil.

---

## 5. Kasus Tersulit: `INSUFFICIENT_STOCK` pada Sinkronisasi Offline

Transaksi offline **sudah terjadi secara fisik** — barang sudah keluar, pelanggan sudah pergi,
uang sudah diterima. Menolaknya berarti menghapus penjualan yang nyata.

| Konteks | Perilaku |
|---|---|
| Checkout **online** | ⛔ Tolak. Stok memang tidak ada, cegah penjualan. |
| Sinkronisasi **offline** | ✅ **Terima**, izinkan stok negatif, naikkan alert rekonsiliasi |

Ini berarti endpoint `/sync/push` **tidak boleh** memakai jalur validasi yang sama dengan
checkout online. Konsekuensinya menyentuh
[30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md) §6 pertanyaan #2 dan
[OFFLINE-SYNC-SPEC.md](../30-data/OFFLINE-SYNC-SPEC.md).

---

## 6. Aturan

1. **Kode tidak pernah diubah artinya.** Klien lama masih beredar di perangkat kasir.
2. **`message` untuk manusia, `code` untuk mesin.** Klien tidak boleh mencocokkan teks pesan.
3. **`request_id` wajib di setiap error** agar dapat ditelusuri di log.
4. **Kode baru wajib masuk katalog ini** sebelum dirilis, lengkap dengan kelasnya.
5. **Pesan berbahasa Indonesia, ramah kasir.** Bukan "constraint violation on variants.barcode".
