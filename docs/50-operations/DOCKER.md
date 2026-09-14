# Standar Docker — Image, Compose & Registry

> **Status:** 🟡 Draft
> **Dokumen Terkait:** [DOKPLOY.md](./DOKPLOY.md), [ADR-0001](../10-architecture/adr/0001-hybrid-go-ts-docker-architecture.md)

---

## 1. Ruang Lingkup

`ADR-0001` memutuskan **kenapa** memakai Docker. Dokumen ini menetapkan **bagaimana** —
standar yang berlaku untuk setiap image di repositori ini.

### ⚠️ "Docker" adalah dua hal yang berbeda

Sejak [ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md), keduanya berjalan di
tempat yang berbeda. Membedakannya penting agar tidak salah paham:

| | **Docker BUILD** | **Docker RUNTIME** |
|---|---|---|
| Perintah | `docker build` / `buildx` | `docker run`, `compose up` |
| **Berjalan di** | **GitHub Actions** | **VPS Hostinger** |
| Menghasilkan | Image → `ghcr.io` | Kontainer yang melayani kasir |
| Siapa memicu | Merge ke `main` | Dokploy |

```
GitHub Actions                        VPS Hostinger
──────────────                        ─────────────
Dockerfile ──► docker build           docker pull ghcr.io/...:<sha>
                    │                        │
                    └──► push ghcr.io ───────┘
                                             ▼
                                      compose up (Traefik, pos-engine,
                                      web, postgres, redis)
```

**Docker tetap terpasang di VPS** ([SERVER-PROVISIONING](./SERVER-PROVISIONING.md) C4) —
ia hanya berhenti **membangun**, dan kini hanya **menarik & menjalankan**.

Konsekuensinya untuk dokumen ini: aturan §2 (standar image & Dockerfile) berlaku saat
**menulis** Dockerfile di repo dan dieksekusi di CI; aturan §4 (compose) berlaku di VPS.

> `docker-compose.prod.yml` versi lengkap yang siap dipakai Dokploy ada di
> [15-development/CI-PIPELINE.md](../15-development/CI-PIPELINE.md) §4. Versi asli dari
> FDR §4 dipertahankan di §6 di bawah sebagai rujukan sejarah — **jangan dipakai apa adanya**.

---

## 1b. Pelajaran dari Empat Kegagalan Build

Dicatat 22 Agustus 2026 saat membangun Dev Container. Keempatnya berlaku umum,
bukan khusus proyek ini.

| # | Gejala | Akar masalah | Perbaikan |
|---|---|---|---|
| 1 | `checksum did not verify` | `curl \| sh` dari branch `master` — isinya bisa berubah kapan saja | Ambil rilis bertag, verifikasi sendiri |
| 2 | Image **8,45 GB** | `chown -R dev:dev /go` menyalin ULANG seluruh direktori (+1,98 GB); cache modul ikut tersimpan | Jangan `chown` direktori besar. Hapus cache **di layer yang sama** — menghapusnya di `RUN` berikutnya tidak mengecilkan apa pun |
| 3 | `unexpected EOF` dari `proxy.golang.org` | Mengompilasi `sqlc` menarik ~200 modul; jaringan tidak sanggup | **Pakai biner rilis siap pakai**, bukan `go install`. Satu berkas 13–40 MB vs ratusan modul |
| 4 | Tool yang tadinya sukses gagal lagi | Menyisipkan layer Python **sebelum** tool Go membatalkan cache-nya | **Urutkan layer dari yang paling rapuh & mahal ke yang paling sering berubah** |

### Tiga aturan yang lahir dari itu

1. **Layer rapuh diletakkan lebih awal.** Unduhan besar dari jaringan diletakkan sebelum
   hal-hal yang sering diedit (versi Python, paket npm). Mengubah yang sering berubah
   tidak boleh memaksa mengunduh ulang yang rapuh.
2. **Biner siap pakai mengalahkan kompilasi** untuk perkakas. Lebih cepat, lebih kecil,
   dan jauh lebih tahan jaringan buruk.
3. **Bersihkan cache di layer yang sama.** `RUN a && rm -rf cache` mengecilkan image;
   `RUN a` lalu `RUN rm -rf cache` tidak — layer sebelumnya tetap tersimpan.

---

## 2. Aturan Image

| Aturan | Alasan |
|---|---|
| **Multi-stage build wajib** | Toolchain build tidak boleh ikut terkirim ke produksi |
| **Go → base `scratch` atau `distroless`** | Menegakkan target <25MB di PRD §4 |
| **Node → `node:22-alpine`, `output: standalone`** | Next.js standalone memangkas image secara drastis |
| **Tag versi eksplisit, bukan `latest`** | `postgres:16-alpine`, bukan `postgres:alpine` |
| **Jalan sebagai non-root** | `USER` non-root di setiap Dockerfile |
| **`HEALTHCHECK` di setiap layanan** | Dokploy & Traefik bergantung padanya untuk routing |
| **`.dockerignore` wajib** | Mencegah `.env`, `.git`, dan `node_modules` masuk ke image |
| **Batas memori eksplisit** | Satu layanan bocor memori tidak boleh mematikan mesin kasir |

> **Peringatan `.dockerignore`:** tanpa berkas ini, `COPY . .` akan menyalin berkas `.env`
> ke dalam image. Rahasia lalu tersimpan permanen di layer image — tetap terbaca meski
> berkasnya dihapus di layer berikutnya.

---

## 3. Anggaran Ukuran Image

PRD §4 menargetkan <25MB untuk container Go. Target untuk layanan lain belum ditetapkan:

| Layanan | Target | Status |
|---|---:|:---:|
| pos-engine (Go, scratch) | < 25 MB | Ditetapkan di PRD |
| web-app (Next.js standalone) | ❌ belum ditetapkan | Realistis ~150–250 MB |
| intelligence-worker (Python + scikit-learn) | ❌ belum ditetapkan | Realistis ~400MB+ |

Angka-angka ini harus diperiksa di CI, bukan sekadar dicita-citakan — lihat
[60-quality/PERFORMANCE-BUDGET.md](../60-quality/PERFORMANCE-BUDGET.md).

---

## 4. Aturan Compose

1. **Tanpa `version:`** — usang di Compose V2 dan memicu peringatan.
2. **Tanpa `ports:`** kecuali Traefik. Lihat [NETWORK-HARDENING.md](./NETWORK-HARDENING.md) §3
   untuk alasan yang sangat penting.
3. **Tanpa rahasia literal.** Selalu `${VAR}`, nilainya disimpan di panel Environment Dokploy.
4. **`depends_on` dengan `condition: service_healthy`**, bukan `depends_on` polos —
   yang terakhir hanya menunggu kontainer *start*, bukan *siap*.
5. **Volume bernama untuk data persisten.** Data Postgres tidak boleh berada di layer kontainer.
6. **`restart: unless-stopped`** lebih baik daripada `always` — `always` akan menghidupkan
   ulang kontainer yang sengaja dihentikan saat menangani insiden.

---

## 5. Registry & Lokasi Build

✅ **Ditetapkan 21 Agustus 2026** — [ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md):

| Hal | Keputusan |
|---|---|
| Build | **GitHub Actions**, bukan di VPS |
| Registry | **GitHub Container Registry (`ghcr.io`)** |
| Tag image | **SHA commit**, bukan `latest` |
| Peran Dokploy | Hanya **menarik** image, tidak membangun |
| Arsitektur | **`linux/amd64` saja** — server produksi x86_64 ([ADR-0011](../10-architecture/adr/0011-image-hanya-amd64.md)) |

Dua manfaat utama: beban build lepas dari VPS produksi, dan **rollback menjadi deterministik**
— tarik tag SHA lama, bukan build ulang dari commit lama yang tidak dijamin identik.

### Build manual di Mac Apple Silicon

Jalur resmi tetap CI. Bila image terpaksa dibangun di Mac (uji lokal, darurat), **selalu**
sebutkan platform server:

```bash
docker buildx build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=https://api-produksi.contoh \
  -f apps/web/Dockerfile -t web:uji .
```

Tanpa `--platform`, Docker di Mac menghasilkan image **arm64**. Image itu berjalan normal di
Mac — sehingga uji lokal lolos — lalu gagal di server dengan `exec format error`. Image
arm64 hasil uji lokal **tidak boleh** di-push ke `ghcr.io`.

`NEXT_PUBLIC_API_URL` **wajib** dan tidak punya nilai default: nilainya dibakar ke bundle klien
saat build, sehingga image yang dibangun tanpanya menyala normal tetapi memanggil domain yang
salah. Di CI nilainya berasal dari repository variable `PUBLIC_API_URL`, dan build web ditolak
bila kosong, masih berisi `example`, menunjuk `localhost`, atau bukan `https://`.

---

## 6. Compose Produksi — Rujukan

Dipindahkan dari `FDR.md` §4 pada 21 Agustus 2026. **Versi di bawah adalah versi asli yang
belum diperbaiki** — ia dipertahankan sebagai rujukan sejarah, dan tidak boleh dipakai apa
adanya. Empat pelanggaran terhadap aturan §4 di atas ditandai di dalamnya.

<details>
<summary>Versi asli dari FDR §4 (jangan dipakai)</summary>

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  # 1. Golang POS Core Service
  pos-engine:
    build:
      context: ./services/pos-engine
      dockerfile: Dockerfile
    environment:
      - PORT=8080
      - DB_URL=postgres://ionowu_user:secret_pass@postgres:5432/ionowu_db?sslmode=disable
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your_ultra_secure_jwt_secret_key
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: always
    deploy:
      resources:
        limits:
          memory: 128M

  # 2. Next.js PWA & BFF
  web-app:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - POS_API_INTERNAL_URL=http://pos-engine:8080
      - NEXT_PUBLIC_POS_API_URL=https://api.sweet.ionowu.com
      - WHATSAPP_API_TOKEN=your_wa_gateway_token
    depends_on:
      - pos-engine
    restart: always
    deploy:
      resources:
        limits:
          memory: 256M

  # 3. PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ionowu_db
      POSTGRES_USER: ionowu_user
      POSTGRES_PASSWORD: secret_pass
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ionowu_user -d ionowu_db"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: always

  # 4. Redis Cache & Mutex
  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: always

volumes:
  pgdata:
```

</details>

### Yang harus diperbaiki sebelum dipakai

| # | Masalah | Perbaikan |
|---|---|---|
| 1 | `version: '3.8'` | Hapus — usang di Compose V2 |
| 2 | `web-app` mem-publish `3000:3000` | Hapus blok `ports:`; bertabrakan dgn UI Dokploy & melewati Traefik |
| 3 | `POSTGRES_PASSWORD: secret_pass` | `${POSTGRES_PASSWORD}`, nilai di panel Dokploy |
| 4 | `JWT_SECRET=your_ultra_secure_jwt_secret_key` | `${JWT_SECRET}` |
| 5 | `restart: always` | `restart: unless-stopped` (lihat §4 aturan 6) |
| 6 | Tidak ada batas memori untuk postgres/redis | Tetapkan; lihat [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) §4 |
| 7 | `intelligence-worker` tidak ada di compose asli | ⚠️ **Harus ditambahkan** — layanan Python aktif sejak Fase 1 ([ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md)), batas memori 512 MB |

> Temuan #7 masih terbuka: [ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md)
> mengaktifkan layanan Python sejak Fase 1 (restock · segmentasi CRM · agregasi BI), sehingga
> ia **wajib ditambahkan** ke compose produksi dengan batas memori 512 MB. Lihat
> [INTELLIGENCE-WORKER.md](../10-architecture/INTELLIGENCE-WORKER.md).
