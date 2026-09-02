# Strategi Redis — Lima Peran dalam Satu Instans

> **Status:** 🟡 Draft
> **Prioritas:** 🔴 **P0** — memuat konflik konfigurasi yang menyebabkan kehilangan data
> **Urutan baca:** dokumen **ke-4**

---

## 1. Redis Mengerjakan Lima Hal Berbeda

Peran Redis tersebar di empat dokumen tanpa ada satu pun yang memilikinya secara utuh:

| # | Peran | Disebut di | Bila hilang saat restart |
|---|---|---|---|
| 1 | **Mutex pemotongan stok** | [FDR.md](./FDR.md) §1, PRD FR-43 | 🟢 Aman — kunci memang berumur pendek |
| 2 | **Cache** (katalog, harga) | [FDR.md](./FDR.md) §2 | 🟢 Aman — dibangun ulang dari Postgres |
| 3 | **Rate limit token bucket** | [API-GUIDELINES.md](../20-api/API-GUIDELINES.md) §6 | 🟢 Aman — kuota sekadar ter-reset |
| 4 | **Revokasi token instan** | [SECURITY.md](../40-security/SECURITY.md) §4B | 🔴 **BAHAYA** |
| 5 | **Bus event** | [EVENT-ARCHITECTURE.md](./EVENT-ARCHITECTURE.md) | 🔴 **BAHAYA** |

Empat dari lima peran ini bersifat *boleh hilang*. Dua sisanya tidak — dan di situlah konfliknya.

---

## 2. ⚠️ Konflik: Revokasi Token Butuh Ketahanan yang Tidak Dimiliki Cache

[SECURITY.md](../40-security/SECURITY.md) §4B menjanjikan:

> Refresh Token disimpan di tabel database **dan Redis** untuk memungkinkan *Instant Token
> Revocation* (misal: jika perangkat kasir hilang atau kasir diberhentikan).

Skenario yang membuat janji itu gagal:

```
09.00  Kasir diberhentikan → tokennya dicabut → ditulis ke Redis
14.30  Kontainer Redis restart (deploy rutin)
       └─ konfigurasi default: data di memori hilang
14.31  Mantan kasir memakai token lama
       └─ Redis tidak lagi tahu token itu dicabut
       └─ ✅ akses diberikan
```

Janji "instant revocation" berubah menjadi "revocation sampai Redis restart" — tanpa ada
yang menyadarinya.

### Perbaikan

**Postgres adalah sumber kebenaran untuk pencabutan; Redis hanya percepatan.**

Tabel `refresh_tokens` di [30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md) §3E sudah punya
kolom `revoked_at`. Aturannya:

1. Pencabutan **selalu** ditulis ke Postgres lebih dulu.
2. Redis diperbarui setelahnya sebagai cache.
3. **Saat Redis tidak punya jawaban, periksa Postgres** — jangan pernah menganggap
   "tidak ada di Redis" berarti "tidak dicabut".

Aturan 3 adalah intinya. Ia mengubah kegagalan yang berbahaya (akses diberikan secara salah)
menjadi kegagalan yang aman (satu kueri tambahan ke database).

---

## 3. Konfigurasi Persistensi

Kelima peran punya kebutuhan yang berbeda, dan satu instans hanya bisa punya satu konfigurasi:

| Peran | Butuh persistensi? |
|---|---|
| Mutex stok | Tidak |
| Cache | Tidak |
| Rate limit | Tidak |
| Revokasi token | Ya — **tetapi §2 menghapus kebutuhan ini** |
| Bus event | Ya — **tetapi outbox di [EVENT-ARCHITECTURE.md](./EVENT-ARCHITECTURE.md) §5 menghapusnya** |

**Kesimpulan:** setelah kedua perbaikan itu diterapkan, Redis boleh diperlakukan sebagai
**murni cache yang boleh hilang kapan saja**.

Ini penyederhanaan yang berharga: satu instans, tanpa AOF, tanpa kecemasan soal backup Redis,
dan restart Redis menjadi peristiwa biasa alih-alih insiden.

```
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly no
```

> **Uji yang membuktikannya:** matikan Redis di staging saat kasir sedang bertransaksi.
> Sistem harus tetap melayani checkout — lebih lambat, tetapi benar. Bila ada transaksi
> gagal, salah satu asumsi di atas belum benar-benar terpenuhi.

---

## 4. Pemisahan Ruang Kunci

Satu instans dipakai lima peran, jadi penamaan harus mencegah tabrakan dan memudahkan
pengusutan:

```
lock:stock:{tenant_id}:{variant_id}      TTL 5s     mutex
cache:catalog:{tenant_id}:{outlet_id}    TTL 5m     cache
cache:price:{tenant_id}:{variant_id}     TTL 5m     cache
rate:{scope}:{identifier}                TTL 1m     rate limit
revoked:token:{token_hash}               TTL = sisa umur token
stream:events                            —          Redis Streams
```

Aturan: **setiap kunci wajib punya TTL**, kecuali stream. Kunci tanpa TTL adalah kebocoran
memori yang tumbuh diam-diam sampai Redis mulai mengusir data yang masih dibutuhkan.

> **Isolasi tenant berlaku juga di sini.** Setiap kunci mengandung `tenant_id`. Kunci cache
> tanpa `tenant_id` adalah jalur kebocoran data antar-toko yang sama berbahayanya dengan
> kueri SQL tanpa `WHERE tenant_id` — dan tidak akan tertangkap oleh tinjauan SQL mana pun.

---

## 5. Mutex Stok — Pertanyaan yang Belum Terjawab

[FDR.md](./FDR.md) §1 menyebut *"In-Memory Mutex Stock Decrement"*, sementara
[PRD](../00-product/PRD-01-POS-INTI.md) FR-43 menyebut *"atomic in-memory lock"*.
Keduanya ambigu dalam hal yang paling menentukan: **mutex di dalam proses Go, atau kunci
terdistribusi di Redis?**

| Pilihan | Berlaku bila | Risiko |
|---|---|---|
| Mutex dalam proses Go | Hanya ada **satu** instans pos-engine | Pecah total begitu instans kedua dijalankan |
| Kunci terdistribusi Redis | Berapa pun instansnya | Menambah latensi ke anggaran <5ms |
| Kunci baris Postgres (`SELECT … FOR UPDATE`) | Berapa pun instansnya | Paling sederhana; Postgres sudah di jalur transaksi |

**Rekomendasi: kunci baris Postgres.** Pemotongan stok sudah berada di dalam transaksi SQL
yang sama, sehingga Postgres sudah menjaminnya secara atomik tanpa komponen tambahan.
Menambahkan Redis ke jalur ini berarti menambah satu titik kegagalan pada bagian sistem
yang paling tidak boleh gagal.

> Perlu diingat bahwa pengunci apa pun **tidak menyelesaikan masalah stok minus dari
> transaksi offline** — barang sudah keluar secara fisik sebelum server tahu apa pun.
> Lihat pertanyaan terbuka #2 di [30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md) §6.

---

## 6. Keputusan Terbuka

1. **Mutex stok: Postgres atau Redis?** (rekomendasi: Postgres — lihat §5)
2. **Batas memori Redis** — 256MB adalah tebakan; perlu diukur terhadap ukuran katalog nyata.
3. **Apakah rate limit dibedakan per paket langganan?** Lihat
   [00-product/PRICING-PACKAGING.md](../00-product/PRICING-PACKAGING.md) §7.
4. **Apakah cache dihangatkan saat startup**, atau dibiarkan terisi sendiri? Cache dingin
   setelah deploy pagi hari bisa bertepatan dengan jam sibuk toko.
