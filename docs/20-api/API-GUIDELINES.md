# 🔌 Pedoman Desain API ionowu sweet

> **Standar:** RESTful API v1.0 & OpenAPI 3.1  
> **Target:** Go Core Service, Next.js BFF, & Integrasi Pihak Ketiga  
> **Status:** Sumber Kebenaran Resmi (*Single Source of Truth*)  
> **Dokumen Terkait:** [openapi.yaml](./openapi.yaml), [FDR.md](../10-architecture/FDR.md)

---

## 1. Prinsip Desain Utama

1. **Pragmatis & Konsisten:** Semua endpoint menggunakan format JSON berstandar `snake_case` untuk request/response payload.
2. **Idempotensi Mutlak pada Mutasi Keuangan:** Setiap operasi yang memotong saldo/stok atau mencatat transaksi pembayaran wajib menyertakan header `Idempotency-Key` (ULID).
3. **Respon Cepat (<5ms untuk Transaksi POS):** Payload didesain ramping tanpa *deep nested objects* yang tidak perlu.

---

## 2. Struktur URI & Penamaan Endpoint

* Gunakan kata benda jamak (*plural nouns*) untuk koleksi resource:
  * ✅ `GET /v1/products`
  * ✅ `POST /v1/products/{id}/variants`
  * ✅ `POST /v1/sales/checkout`
  * ❌ `GET /v1/getProducts` (Jangan gunakan kata kerja di URI)
* Untuk aksi transaksional khusus, gunakan sub-resource berbasis kata kerja fungsional:
  * `POST /v1/shifts/{id}/close` (Tutup shift kasir)
  * `POST /v1/sync/transactions` (Batch push antrean offline)

---

## 3. Format Amplop Respon Standar (*Response Envelope*)

### A. Respon Sukses (200 OK / 201 Created)
Untuk data tunggal:
```json
{
  "data": {
    "id": "01JM6T9K8V7Z0X3Q9P5B1C2D3E",
    "name": "Matcha Latte",
    "price": 28000,
    "created_at": "2026-08-21T13:30:00Z"
  }
}
```

Untuk data koleksi dengan Paginasi Kursor:
```json
{
  "data": [
    { "id": "01JM6T9K8V7Z0X3Q9P5B1C2D3E", "name": "Matcha Latte" },
    { "id": "01JM6T9K8V7Z0X3Q9P5B1C2D3F", "name": "Berry Cake" }
  ],
  "meta": {
    "limit": 20,
    "next_cursor": "01JM6T9K8V7Z0X3Q9P5B1C2D3F",
    "has_more": true
  }
}
```

---

## 4. Standar Error Payload (RFC 7807 Problem Details)

Semua error menghasilkan format terpadu dengan kode error mesin yang jelas dan pesan ramah kasir:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Stok varian 'Matcha Latte (Large)' tidak mencukupi (tersisa: 2, diminta: 5)",
    "details": [
      {
        "field": "items[0].quantity",
        "issue": "Requested quantity exceeds available stock"
      }
    ],
    "request_id": "req_01JM6TAX90B2C3D4E5F6G7H8J9",
    "timestamp": "2026-08-21T13:30:00Z"
  }
}
```

### Daftar Kode HTTP Status:
| Status Code | Makna di ionowu |
|---|---|
| `200 OK` | Permintaan berhasil dibaca/diubah. |
| `201 Created` | Resource baru (Produk/Transaksi) berhasil dibuat. |
| `202 Accepted` | Permintaan diterima & sedang diproses async di background (misal: Bulk Import). |
| `400 Bad Request` | Validasi payload gagal (tipe data salah, format JSON rusak). |
| `401 Unauthorized` | JWT kadaluarsa atau tidak valid. |
| `403 Forbidden` | Role user tidak memiliki izin (misal: Kasir coba hapus produk). |
| `409 Conflict` | Barcode duplikat atau bentrok idempotensi transaksi. |
| `422 Unprocessable` | Logika bisnis gagal (misal: Transaksi sudah pernah di-void). |
| `429 Too Many Requests` | Rate limit terlampaui. |
| `500 Internal Error` | Masalah pada server backend. |

---

## 5. Header Wajib & Idempotensi Transaksi

| Header | Wajib / Opsional | Keterangan |
|---|---|---|
| `Authorization` | Wajib (kecuali register/login) | Format: `Bearer <jwt_access_token>` |
| `Idempotency-Key` | **Wajib pada Checkout & Sync** | String unik ULID untuk mencegah transaksi kasir ganda akibat double-click atau retry jaringan |
| `X-Outlet-ID` | Wajib pada transaksi POS | ID Outlet aktif yang sedang mengoperasikan kasir |
| `X-Request-ID` | Otomatis oleh Gateway | ID penelusuran log sistem |

---

## 6. Rate Limiting & Throttling (Redis Token Bucket)

Untuk menjaga kestabilan sistem kasir dari spam atau serangan DoS:
* **Kasir POS Endpoints (`/v1/sales/*`, `/v1/sync/*`):** `120 request / menit` per outlet (sangat lega untuk operasional kasir).
* **Autentikasi (`/v1/auth/login`, `/v1/auth/register`):** `10 request / menit` per IP (mencegah brute-force password/PIN).
* **Public & Reporting Endpoints:** `60 request / menit`.

### Status implementasi (2026-09-18)

| Kelompok | Status |
|---|---|
| Autentikasi (`/auth/login`, `/auth/register`) | ✅ 10/menit per IP — **in-process** (`internal/httpapi/ratelimit.go`), bukan Redis |
| Kasir POS, Public & Reporting | ❌ Belum dibatasi |

* **Batas efektif = 10 × jumlah replika `api`** (produksi: 2 → ±20/menit per IP), karena
  tiap replika menghitung sendiri. Tetap memangkas tebakan kata sandi dari tak terbatas.
  Versi Redis ([REDIS-STRATEGY](../10-architecture/REDIS-STRATEGY.md) §3) menyatukan
  hitungannya; `pos-engine` belum punya klien Redis.
* **IP klien = entri paling kanan `X-Forwarded-For`** (yang ditulis Traefik). Entri paling
  kiri dikirim klien dan bisa dipalsukan untuk mendapat kuota baru tiap permintaan.
* **Batasnya bisa diatur lewat `IONOWU_SWEET_AUTH_RATE_PER_MINUTE`** (bawaan 10). Nilai ini
  hanya dinaikkan di CI: uji E2E mendaftar dan login dari satu IP runner, dan 14 uji melewati
  10/menit. Nilai `0`, negatif, atau bukan angka **ditolak saat start**, jadi rate limit tidak
  bisa dimatikan diam-diam lewat salah ketik. **Jangan diisi di produksi.**
* **`/auth/refresh` sengaja tidak dibatasi.** Seluruh kasir satu toko berbagi satu IP NAT;
  refresh yang ditolak melempar kasir keluar saat jam ramai. Refresh butuh token sah, jadi
  bukan jalur menebak kata sandi.
* Klien web memperlakukan `429` sebagai error biasa, **bukan** penolakan auth — sesi
  perangkat tidak dihapus (`apps/web/src/lib/auth/api.test.ts`).
