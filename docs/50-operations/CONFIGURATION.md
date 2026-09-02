# Konfigurasi & Manajemen Rahasia

> **Status:** 🟡 Draft · **Prioritas:** 🔴 **P0**
> **Dokumen Terkait:** [DOKPLOY.md](./DOKPLOY.md), [DOCKER.md](./DOCKER.md)

---

## 1. Kenapa P0

`FDR.md` §4 (kini di [DOCKER.md](./DOCKER.md) §6) memuat rahasia sebagai nilai literal:

```yaml
POSTGRES_PASSWORD: secret_pass
JWT_SECRET=your_ultra_secure_jwt_secret_key
```

Contoh seperti ini **akan tersalin ke produksi**. Bukan karena orang ceroboh, melainkan
karena ia terlihat seperti konfigurasi yang siap pakai. Dokumen ini menggantikannya dengan
daftar tunggal yang jelas.

---

## 2. Aturan

1. **Tidak ada rahasia di dalam repositori.** Tidak di compose, tidak di dokumen, tidak di
   berkas contoh yang berisi nilai sungguhan.
2. **Rahasia disimpan di panel Environment Dokploy**, bukan di berkas `.env` pada VPS.
3. **`.env` wajib masuk `.gitignore` dan `.dockerignore`.** Tanpa `.dockerignore`, `COPY . .`
   akan menanam rahasia secara permanen di layer image ([DOCKER.md](./DOCKER.md) §2).
4. **Setiap lingkungan punya rahasia berbeda.** Staging tidak pernah memakai kredensial produksi.
5. **Aplikasi gagal start bila variabel wajib kosong** — jangan pernah memakai nilai default
   diam-diam untuk rahasia.
6. **Rahasia tidak pernah masuk log** ([SECURITY.md](../40-security/SECURITY.md) §7).

> Aturan 5 penting dan sering dilanggar: `JWT_SECRET` dengan nilai default berarti sistem
> berjalan normal dengan kunci yang dapat ditebak siapa pun. Lebih baik gagal start dengan
> pesan jelas daripada berjalan tanpa keamanan.

---

## 3. Daftar Variabel

### pos-engine (Go)

| Variabel | Wajib | Rahasia | Keterangan |
|---|:---:|:---:|---|
| `PORT` | ✅ | | Default 8080 |
| `DATABASE_URL` | ✅ | 🔐 | Termasuk kredensial |
| `REDIS_URL` | ✅ | | Jaringan internal |
| `JWT_PRIVATE_KEY` | ✅ | 🔐 | Ed25519/RS256 (SECURITY §4B) |
| `JWT_PUBLIC_KEY` | ✅ | | Boleh dibagikan |
| `ACCESS_TOKEN_TTL` | | | Default 15m |
| `REFRESH_TOKEN_TTL` | | | Default 720h |
| `QRIS_API_KEY` | ✅ | 🔐 | Setelah vendor dipilih (menunggu penawaran) |
| `QRIS_WEBHOOK_SECRET` | ✅ | 🔐 | HMAC (SECURITY §5) |
| `ARGON2_MEMORY_KB` | | | Default 65536 |
| `LOG_LEVEL` | | | info di produksi |
| `ENVIRONMENT` | ✅ | | development / staging / production |

### web-app (Next.js)

| Variabel | Wajib | Rahasia | Keterangan |
|---|:---:|:---:|---|
| `POS_API_INTERNAL_URL` | ✅ | | `http://pos-engine:8080` |
| `NEXT_PUBLIC_POS_API_URL` | ✅ | | ⚠️ **Terlihat di browser** |
| `DATABASE_URL` | ✅ | 🔐 | Pengguna **read-only** — lihat §4 |
| `WHATSAPP_API_TOKEN` | ✅ | 🔐 | |
| `SESSION_SECRET` | ✅ | 🔐 | |

> **Setiap `NEXT_PUBLIC_*` dikirim ke browser dan dapat dibaca siapa pun.** Awalan ini tidak
> boleh dipakai untuk apa pun yang bersifat rahasia. Kesalahan ini mudah terjadi dan sulit
> disadari karena aplikasi tetap berjalan normal.

### Registry & Telemetri (baru — akibat ADR-0004 & ADR-0005)

| Variabel | Wajib | Rahasia | Keterangan |
|---|:---:|:---:|---|
| `GHCR_TOKEN` | ✅ | 🔐 | Kredensial Dokploy menarik image dari `ghcr.io` |
| `GRAFANA_CLOUD_API_KEY` | ✅ | 🔐 | Pengiriman metrik & log |
| `SENTRY_DSN` | ✅ | 🔐 | Error tracking |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | ✅ | 🔐 | Backup ke Cloudflare R2 |
| `R2_BUCKET` / `R2_ENDPOINT` | ✅ | | |

### postgres / redis

| Variabel | Wajib | Rahasia |
|---|:---:|:---:|
| `POSTGRES_DB`, `POSTGRES_USER` | ✅ | |
| `POSTGRES_PASSWORD` | ✅ | 🔐 |
| `REDIS_MAXMEMORY` | | |

---

## 4. Pemisahan Hak Akses Basis Data

Aturan #2 di [SERVICE-BOUNDARIES.md](../10-architecture/SERVICE-BOUNDARIES.md) §4 menyatakan
TypeScript tidak boleh menulis ke tabel transaksional. **Aturan itu harus dipaksakan oleh
basis data, bukan oleh disiplin engineer.**

```sql
CREATE USER app_readonly WITH PASSWORD '...';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
-- web-app memakai pengguna ini untuk pelaporan
```

Dengan begini, bug di `web-app` tidak mungkin merusak catatan transaksi — batasnya menjadi
nyata, bukan sekadar konvensi tertulis.

---

## 5. Rotasi Rahasia

| Rahasia | Frekuensi | Cara |
|---|---|---|
| `JWT_PRIVATE_KEY` | 6 bulan / saat insiden | Dukung dua kunci selama masa transisi |
| `POSTGRES_PASSWORD` | 12 bulan / saat insiden | Perlu restart layanan |
| `QRIS_WEBHOOK_SECRET` | Sesuai kebijakan vendor | Koordinasi dengan gateway |
| `WHATSAPP_API_TOKEN` | 12 bulan | |

> **Rotasi kunci JWT butuh dukungan dua kunci sekaligus.** Mengganti kunci secara mendadak
> akan membatalkan token setiap kasir yang sedang bekerja — termasuk yang sedang offline dan
> tidak bisa login ulang. Verifikasi harus menerima kunci lama dan baru selama satu masa TTL penuh.

---

## 6. Pemulihan Bencana Konfigurasi

Bila VPS hilang, yang ikut hilang bukan hanya database, tetapi seluruh konfigurasi Dokploy
([DOKPLOY.md](./DOKPLOY.md) §5).

**Wajib ada catatan rahasia di luar VPS** — pengelola kata sandi tim atau brankas terenkripsi
yang berisi setiap variabel di §3 beserta nilainya. Backup database tanpa ini tidak cukup
untuk membangun ulang sistem.

- [ ] Tetapkan tempat penyimpanan rahasia di luar VPS
- [ ] Tetapkan siapa yang memegang akses
- [ ] Uji: bisakah sistem dibangun ulang dari nol memakai catatan itu?
