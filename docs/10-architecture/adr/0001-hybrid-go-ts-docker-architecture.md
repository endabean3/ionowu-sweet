# ADR-0001: Arsitektur Pragmatis — Hybrid Go Core + TS BFF dalam Container Docker

| Parameter | Nilai |
|---|---|
| **Status** | Diterima & Direvisi |
| **Tanggal Revisi** | 21 Agustus 2026 |
| **Pengambil Keputusan** | ionowu.com |
| **Arsitektur Utama** | **Pragmatic Hybrid Service (Go + TypeScript + Docker)** |
| **Fokus Utama** | Kecepatan Transaksi Roket (<5ms), Offline-First PWA, Containerized Simplicity |

---

## 1. Konteks & Masalah

Sistem kasir dan intelijen UMKM **ionowu** membutuhkan dua hal yang sering bertolak belakang:
1. **Kecepatan & Keandalan Transaksi Ekstrem:** Kasir POS harus bekerja instan (<50ms di UI, <5ms di backend), tahan banting saat jam sibuk (*rush hour*), dan tetap berjalan 100% saat internet padam (*offline-first*).
2. **Iterasi UI & Intelijen Bisnis Cepat:** Dashboard analitik, visualisasi data, integrasi WhatsApp, dan AI recommendation membutuhkan ekosistem yang fleksibel dan kaya pustaka (TypeScript / Python).

### Jebakan yang Dihindari:
* ❌ **Jebakan 1: Over-Engineered Microservices (7+ layanan terpisah sejak awal).** Membuat koordinasi transaksi checkout menjadi lambat (*network hop lag*), debugging rumit, dan biaya cloud membengkak untuk tim ramping.
* ❌ **Jebakan 2: Monolith Tunggal Raksasa Kuno.** Menyatukan komputasi AI/ML yang berat ke dalam satu proses transaksi kasir, yang berisiko membuat sistem POS *freeze* saat AI sedang memproses data besar.

---

## 2. Keputusan Arsitektur: "The Pragmatic Hybrid Trio"

Kami menetapkan arsitektur **Hybrid 3-Layanan Terkontainerisasi (Docker Compose)** dengan pembagian peran yang tegas dan efisien:

```
[ PWA Kasir / Client ] ── (IndexedDB: 0ms Local Cache)
          │
          ├──► [ 1. Golang POS Core Engine ] ──► (PostgreSQL + Redis In-Memory)
          │      • Checkout Kasir <5ms
          │      • Atomic Stock Lock
          │      • Webhook QRIS Instan
          │
          ├──► [ 2. TypeScript Web & BFF ] ────► (Dashboard & Operasional)
          │      • PWA Frontend & SSR
          │      • WhatsApp Notifier Gateway
          │      • User & Role Management
          │
          └──► [ 3. Python AI Worker ] ────────► (Batch Processing)
                 • Prediksi Restock (ML)
                 • Customer Churn & Basket Analysis
```

### Rincian Peran Layanan:

#### 🐹 1. Core POS Engine (`services/pos-engine` — Golang)
* **Tugas:** Menghandle transaksi checkout kasir, kalkulasi harga, pemotongan stok atomik (*in-memory lock* via Redis/Go Mutex), dan penerimaan callback QRIS Payment Gateway.
* **Keunggulan:** Kompilasi langsung ke *native binary*, penggunaan RAM minimal (~15-30MB), latency <5ms, dan mampu menangani ribuan transaksi per detik tanpa lag.

#### 🔷 2. Web & BFF Service (`apps/web` — TypeScript / Next.js / Bun)
* **Tugas:** Menyajikan antarmuka PWA kasir, dashboard analitik owner, manajemen katalog produk, integrasi WhatsApp notification, dan orkestrasi data.
* **Keunggulan:** Ekosistem UI terlengkap, type-safety end-to-end, dan kecepatan iterasi fitur bisnis.

#### 🐍 3. Intelligence Worker (`services/intelligence` — Python)
* **Tugas:** Background worker untuk analisis data berkala (clustering pelanggan, prediksi tren cuaca belanja, rekomendasi bundling menu).
* **Isolasi:** Berjalan di proses/container terpisah sehingga proses komputasi berat tidak akan pernah mengganggu kelancaran kasir.

---

## 3. Strategi Containerization (Docker)

Semua layanan dibungkus dalam multi-stage Docker build yang ramping dan diorkestrasi via `docker-compose`:

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Core POS Engine (Golang Binary ~15MB)
  pos-engine:
    build:
      context: ./services/pos-engine
      dockerfile: Dockerfile
    ports: ["8080:8080"]
    environment:
      - DB_URL=postgres://user:pass@postgres:5432/ionowu
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    restart: always

  # Web App & BFF (Next.js Standalone / Bun)
  web-app:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    ports: ["3000:3000"]
    environment:
      - POS_API_URL=http://pos-engine:8080
    depends_on:
      - pos-engine
    restart: always

  # In-Memory Cache & Lock
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    restart: always

  # Primary Database
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ionowu
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: always

volumes:
  pgdata:
```

---

## 4. Konsekuensi & Keuntungan

### ✅ Keuntungan Langsung:
1. **Kecepatan Kasir Maksimal:** Alur kasir tidak terbebani oleh proses analitik atau render halaman yang lambat.
2. **Kemandirian Deployment:** Bug pada dashboard analitik atau modul AI tidak akan pernah mematikan mesin kasir di toko.
3. **Kemudahan Setup Developer:** Cukup jalankan `docker compose up -d`, seluruh ekosistem (Go + TS + DB + Redis) langsung aktif dalam hitungan detik.
4. **Biaya Server Rendah:** Resource RAM keseluruhan sangat efisien (<512MB RAM untuk seluruh stack dasar), bisa berjalan lancar di VPS murah.

### ⚠️ Trade-Off yang Dikelola:
* Mengelola dua bahasa utama (Go untuk core transaksional, TS untuk web/BFF). Dimitigasi dengan kontrak API yang jelas (OpenAPI / gRPC / JSON-RPC).

---

## 5. Referensi Terkait
* **Fondasi UI Resmi:** [fondasi-UI-v0.1.md](../../70-design-system/fondasi-UI-v0.1.md)
* **Dokumentasi Halaman Kasir:** [kasir.md](../../70-design-system/pages/kasir.md)
