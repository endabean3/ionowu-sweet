# Pipeline CI/CD

> **Status:** 🟡 Draft · **Urutan baca:** dokumen **ke-4**
> **Keputusan dasar:** [ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md) —
> build di GitHub Actions, image ke `ghcr.io`, Dokploy hanya menarik.

---

## 1. Alur

```
PR dibuka
   └─► ci.yml : lint · uji · paritas uang · isolasi tenant · budget
                (TIDAK membangun image — hemat menit CI)

Merge ke main
   └─► build.yml : bangun image → push ghcr.io:<sha> dan :main
                └─► deploy-staging.yml : Dokploy tarik & jalankan staging
                    └─► e2e.yml : Playwright terhadap staging

Rilis produksi (manual)
   └─► backup → migrasi → Dokploy tarik tag <sha> → verifikasi
```

**Deploy produksi sengaja manual.** Toko sedang buka; rilis harus terjadi pada waktu yang
dipilih manusia, bukan saat seseorang kebetulan merge ([DEPLOYMENT](../50-operations/DEPLOYMENT.md) §3).

---

### Di mana Docker berjalan

| Tahap | Docker? | Di mana |
|---|:-:|---|
| `ci.yml` (PR) | ⚠️ Ya, tetapi **hanya testcontainers** — Postgres & Redis untuk uji | GitHub Actions |
| `build.yml` (merge) | ✅ **`docker build` + push** | GitHub Actions |
| Deploy | ✅ **`docker pull` + `compose up`** | VPS Hostinger |

PR **tidak** membangun image aplikasi — hanya menjalankan uji. Itu menghemat menit CI dan
membuat umpan balik PR cepat. Image baru dibangun setelah merge, ketika sudah pasti dipakai.

---

## 2. `ci.yml` — Berjalan di Setiap PR

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.22' }
      - run: golangci-lint run ./services/...
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm biome ci .

  test-go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.22' }
      # testcontainers menyalakan Postgres & Redis sungguhan
      - run: go test ./... -race -coverprofile=cover.out
      - name: Coverage rumus uang harus 100%
        run: ./scripts/check-money-coverage.sh

  test-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm vitest run

  money-parity:
    # ⭐ gerbang paling penting di seluruh pipeline
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd services/pos-engine && go test ./internal/money/... -v
      - run: pnpm --filter web test

  tenant-isolation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: go test ./... -run TestTenantIsolation -v

  budget:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm build && ./scripts/check-bundle-size.sh
      - run: ./scripts/check-image-size.sh

  no-secrets-in-logs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/scan-test-logs-for-secrets.sh
```

### Kenapa `money-parity` dan `no-secrets-in-logs` layak jadi job tersendiri

**`money-parity`** menjaga duplikasi rumus yang sengaja diterima
([SERVICE-BOUNDARIES](../10-architecture/SERVICE-BOUNDARIES.md) §4). Bila menyimpang, struk
pelanggan tidak akan cocok dengan catatan server — dan itu baru ketahuan di produksi.

**`no-secrets-in-logs`** bukan sekadar kerapian: ia **menopang [ADR-0005](../10-architecture/adr/0005-telemetry-external-data-internal.md)**.
Keputusan mengirim log ke Grafana Cloud hanya aman selama Zero-Sensitive-Logging ditegakkan.
Satu `log.Info(user)` yang lolos akan mengalirkan data pribadi ke pihak ketiga.

---

## 3. `build.yml` — Setelah Merge ke `main`

```yaml
name: Build & Push
on:
  push: { branches: [main] }

permissions: { contents: read, packages: write }

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - { name: pos-engine, context: ./services/pos-engine }
          - { name: web,        context: ./apps/web }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: ${{ matrix.context }}
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/${{ matrix.name }}:${{ github.sha }}
            ghcr.io/${{ github.repository }}/${{ matrix.name }}:main
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

> **Tag SHA adalah yang membuat rollback deterministik.** Tag `main` hanya untuk kenyamanan;
> deploy produksi **selalu** menyebut SHA, sehingga rollback berarti menarik tag lama —
> bukan membangun ulang dari commit lama yang tidak dijamin identik.

---

## 3b. `apk-debug.yml` — APK Debug, Manual

Dijalankan dari **Actions → APK Debug → Run workflow**, atau:

```bash
gh workflow run apk-debug.yml --ref main
```

| Gerbang | Menolak bila |
|---|---|
| Branch | `GITHUB_REF` bukan `refs/heads/main` |
| URL API | `vars.PUBLIC_API_URL` kosong, berisi `example`/`localhost`, atau bukan `https://` |
| Isi APK | domain produksi tidak ada di `assets/`, atau `ionowu.example`/`localhost:8080` masih ada |

Hasilnya artefak `ionowu-sweet-debug-<sha7>.apk` + `.sha256`, disimpan 14 hari.

**Kenapa bukan `make apk`:** Gradle butuh JDK 21 + Android SDK di host, yang sengaja tidak
disiapkan (CLAUDE.md §4), dan build lokal membawa branch apa pun yang sedang aktif. `make apk`
tetap berguna untuk uji cepat di HP pengembang.

**Bukan untuk Play Store.** APK debug ditandatangani kunci debug. Build release butuh keystore
milik pemilik di GitHub Secrets — belum ada.

---

## 4. `docker-compose.prod.yml` — Dipakai Dokploy

Tanpa `build:`, tanpa `ports:`, tanpa rahasia literal.

```yaml
services:
  pos-engine:
    image: ghcr.io/OWNER/REPO/pos-engine:${IMAGE_TAG}
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379
      - JWT_PRIVATE_KEY=${JWT_PRIVATE_KEY}
      - ENVIRONMENT=production
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    restart: unless-stopped
    deploy:
      resources: { limits: { memory: 128M } }

  web:
    image: ghcr.io/OWNER/REPO/web:${IMAGE_TAG}
    environment:
      - POS_API_INTERNAL_URL=http://pos-engine:8080
      - NEXT_PUBLIC_POS_API_URL=https://api.sweet.ionowu.com
      - DATABASE_URL=${DATABASE_URL_READONLY}
    depends_on: [pos-engine]
    restart: unless-stopped
    deploy:
      resources: { limits: { memory: 256M } }

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      retries: 5
    restart: unless-stopped
    deploy:
      resources: { limits: { memory: 512M } }

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly no
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5
    restart: unless-stopped
    deploy:
      resources: { limits: { memory: 256M } }

volumes:
  pgdata:
```

Perhatikan tiga hal yang berbeda dari versi FDR asli:

* **Tidak ada `ports:`** — Traefik menjangkau lewat jaringan Docker internal
* **`web` memakai `DATABASE_URL_READONLY`** — memaksakan aturan bahwa TypeScript tidak
  menulis ke tabel transaksional ([CONFIGURATION](../50-operations/CONFIGURATION.md) §4)
* **Redis `--appendonly no`** — murni cache, sesuai [REDIS-STRATEGY](../10-architecture/REDIS-STRATEGY.md) §3

---

## 5. Migrasi dalam Pipeline

Migrasi **tidak** dijalankan otomatis oleh Dokploy saat deploy.

```
1. Backup DB + verifikasi
2. Jalankan migrasi (expand)   ← langkah terpisah, kode lama masih jalan
3. Verifikasi skema
4. Dokploy tarik image baru
```

Alasannya: bila langkah 2 gagal, kode lama masih berjalan di atas skema lama dan **kasir
tidak terganggu sama sekali**. Bila migrasi digabung ke deploy, kegagalan skema menjadi
kegagalan layanan ([MIGRATIONS](../30-data/MIGRATIONS.md) §7).

---

## 6. Rahasia CI

| Secret | Untuk |
|---|---|
| `GITHUB_TOKEN` | Push ke ghcr.io (otomatis) |
| `DOKPLOY_WEBHOOK_STAGING` | Memicu deploy staging |
| `DOKPLOY_WEBHOOK_PROD` | Memicu deploy produksi (manual) |

Rahasia **runtime** aplikasi tidak berada di GitHub — semuanya di panel Dokploy
([CONFIGURATION](../50-operations/CONFIGURATION.md)).

---

## 7. Skrip yang Harus Dibuat

- [ ] `check-money-coverage.sh` — gagal bila coverage `domain/` < 100%
- [ ] `check-bundle-size.sh` — ambang [PERFORMANCE-BUDGET](../60-quality/PERFORMANCE-BUDGET.md) §4
- [ ] `check-image-size.sh` — pos-engine < 25MB
- [ ] `scan-test-logs-for-secrets.sh` — pola password/PIN/token
