# FDR: Functional Design & Architecture Specification

> **Sistem:** ionowu sweet (POS Core & UMKM Intelligence Engine)  
> **Versi:** 1.1 (dirampingkan 21 Agustus 2026)  
> **Target Performa:** Latensi Transaksi <5ms, 100% Toleransi Offline, Zero Memory Leaks  
> **Urutan baca:** dokumen **ke-1** dari 10-architecture. Lihat [README.md](./README.md).

---

## 0. Ruang Lingkup Dokumen Ini

FDR menjelaskan **bentuk sistem**: komponen apa yang ada, siapa berbicara dengan siapa, dan
bagaimana data mengalir. Ia **tidak** lagi memuat skema tabel, berkas orkestrasi, atau aturan
keamanan — ketiganya sempat berada di sini dan menyebabkan satu dokumen menjawab empat
pertanyaan berbeda sekaligus.

| Yang dulu ada di sini | Sekarang di |
|---|---|
| §2 Skema relasional PostgreSQL | [30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md) §3 |
| §4 `docker-compose.prod.yml` | [50-operations/DOCKER.md](../50-operations/DOCKER.md) §6 |
| §5 Auto-lock PIN kasir | [40-security/SECURITY.md](../40-security/SECURITY.md) §4C |
| §5 Tenant scoping & webhook HMAC | [40-security/SECURITY.md](../40-security/SECURITY.md) §2 & §5 |

---

## 1. Arsitektur Tingkat Tinggi: "The Citadel Hybrid"

Sistem mengisolasi proses transaksional kritis (Go) dari orkestrasi bisnis/antarmuka
(TypeScript) dan komputasi analitik (Python). Aturan untuk memutuskan kode baru masuk ke
lapisan mana ada di [SERVICE-BOUNDARIES.md](./SERVICE-BOUNDARIES.md).

```
                      ┌───────────────────────────────────────────────┐
                      │             PWA CLIENT (BROWSER)              │
                      │  • UI: Next.js 15 + Tailwind CSS              │
                      │  • Local Storage: Dexie.js (IndexedDB)        │
                      │  • Audio: Web Audio API (0ms latency synth)   │
                      └───────────────────────┬───────────────────────┘
                                              │ (HTTPS / WebSockets)
                                              ▼
                      ┌───────────────────────────────────────────────┐
                      │        TRAEFIK  (dikelola Dokploy)            │
                      │        TLS otomatis · satu-satunya pintu      │
                      └───────────────┬───────────────────────┬───────┘
                                      │                       │
                 /api/v1/pos/*        │                       │ /api/v1/web/*
                                      ▼                       ▼
      ┌──────────────────────────────────────────┐  ┌───────────────────────────────────┐
      │     👑 CORE POS ENGINE (GOLANG)          │  │     🔷 WEB & BFF (TYPESCRIPT)     │
      │     Binary ~15MB · RAM ~25MB             │  │     Next.js Standalone / Bun      │
      │  • Validasi Transaksi (<5ms)             │  │  • Owner Intelligence Dashboard   │
      │  • In-Memory Mutex Stock Decrement       │  │  • WhatsApp Notifier Gateway      │
      │  • Webhook QRIS Payment Callback         │  │  • Product Bulk Importer          │
      │  • Idempotent Offline Sync Ingestor      │  │  • Role & User Management         │
      └─────────────────────┬────────────────────┘  └─────────────────┬─────────────────┘
                            │                                         │
                            │ (Events — lihat EVENT-ARCHITECTURE.md)  │
                            └────────────────────┬────────────────────┘
                                                 │
                                                 ▼
                                ┌───────────────────────────────────┐
                                │     🐍 INTELLIGENCE WORKER        │
                                │     (Python / Scikit-learn)       │
                                │  • Prediksi Restock Harian        │
                                │  • Segmentasi Pelanggan (CRM)     │
                                │  • Agregasi Business Intelligence  │
                                └─────────────────┬─────────────────┘
                                                  │
                                                  ▼
                        ┌───────────────────────────────────────────────────┐
                        │              INFRASTRUCTURE LAYER                 │
                        │  • Primary Database: PostgreSQL 16 (Multi-tenant) │
                        │  • Redis 7 — lihat REDIS-STRATEGY.md              │
                        │  • Storage: Docker Volumes / S3-compatible        │
                        └───────────────────────────────────────────────────┘
```

**Perubahan sejak v1.0:** pilihan reverse proxy tidak lagi menggantung. Diagram semula
menulis "Traefik / Caddy / Nginx"; [ADR-0003](./adr/0003-dokploy-self-hosted-paas.md)
menetapkan **Traefik**, karena itulah yang dibawa Dokploy.

---

## 2. Komponen & Kepemilikan

| Komponen | Bahasa | Tanggung jawab | Batas |
|---|---|---|---|
| **pos-engine** | Go | Checkout, stok, sync ingestion, webhook QRIS | Jalur uang. Tidak pernah memanggil layanan lain secara sinkron. |
| **web-app** | TypeScript | Dasbor, admin, impor, notifikasi WA | Boleh lambat. Tidak boleh menulis ke jalur transaksi. |
| **intelligence-worker** | Python | Restock · **segmentasi CRM** · **agregasi BI** | ✅ Aktif Fase 1 ([ADR-0006](./adr/0006-crm-bi-and-python-service.md)). Sepenuhnya asinkron — kematiannya tidak boleh terasa. |
| **PostgreSQL 16** | — | Sumber kebenaran | Multi-tenant, indeks berawalan `tenant_id` |
| **Redis 7** | — | Mutex, cache, rate limit, revokasi token, event | Lihat [REDIS-STRATEGY.md](./REDIS-STRATEGY.md) |
| **Traefik** | — | TLS, routing | Dikelola Dokploy |

**Aturan yang mengikat:** kegagalan `web-app` atau `intelligence-worker` **tidak boleh**
menghentikan `pos-engine`. Mesin kasir adalah bagian yang harus tetap hidup saat semua hal
lain gagal. Konsekuensinya dirinci di [SCALABILITY-RELIABILITY.md](./SCALABILITY-RELIABILITY.md).

---

## 3. Protokol Sinkronisasi Offline-First PWA

### A. Skema Dexie.js (IndexedDB di Browser Kasir)
```typescript
import Dexie, { Table } from 'dexie';

export interface LocalTransaction {
  id: string; // ULID
  receiptNumber: string;
  items: Array<{ variantId: string; qty: number; price: number; name: string }>;
  grandTotal: number;
  payments: Array<{ method: string; amount: number }>;
  createdAt: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export class IonowuLocalDB extends Dexie {
  transactions!: Table<LocalTransaction, string>;
  products!: Table<any, string>;
  variants!: Table<any, string>;

  constructor() {
    super('IonowuSweetPOS');
    this.version(1).stores({
      transactions: 'id, syncStatus, createdAt',
      products: 'id, categoryId, name',
      variants: 'id, productId, barcode'
    });
  }
}
```

### B. Siklus Sinkronisasi Antrean (FIFO Queue)
1. **Transaksi Offline:** Kasir klik *Bayar*, transaksi ditulis seketika ke `IonowuLocalDB.transactions` dengan `syncStatus = 'pending'`. Struk langsung dicetak via printer thermal.
2. **Deteksi Konektivitas:** Service Worker mendengarkan event `navigator.onLine` dan WebSocket heartbeat.
3. **Batch Push ke Go Engine:**
   * Klien mengirim paket `POST /v1/sync/transactions` berisi array transaksi pending.
4. **Idempotensi di Go Engine:**
   * Go Engine memeriksa `id` transaksi (ULID). Jika ID sudah ada, transaksi tidak diduplikasi (*upsert-safe*).
   * Stok dipotong secara aman via SQL Transaction atomik.
5. **Konfirmasi Klien:**
   * Server mengembalikan daftar ID yang sukses di-ingest.
   * Klien mengupdate status transaksi lokal menjadi `synced`.

> **Bagian di atas adalah alur normal (*happy path*).** Kasus tepi — dua perangkat menjual
> barang terakhir yang sama, jam perangkat yang salah, transaksi yang tiba setelah shift
> ditutup, batch yang gagal separuh, dan IndexedDB penuh — belum terjawab di sini dan
> merupakan celah **P0**. Lihat [30-data/OFFLINE-SYNC-SPEC.md](../30-data/OFFLINE-SYNC-SPEC.md) dan
> pertanyaan terbuka di [30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md) §6.

---

## 4. Referensi Terkait

**Dalam folder ini:**
* [README.md](./README.md) — peta & urutan baca 10-architecture
* [SERVICE-BOUNDARIES.md](./SERVICE-BOUNDARIES.md) — aturan pembagian Go / TS / Python
* [EVENT-ARCHITECTURE.md](./EVENT-ARCHITECTURE.md) — komunikasi antar-layanan
* [REDIS-STRATEGY.md](./REDIS-STRATEGY.md) — lima peran Redis
* [INTELLIGENCE-WORKER.md](./INTELLIGENCE-WORKER.md) — spesifikasi layanan Python
* [SCALABILITY-RELIABILITY.md](./SCALABILITY-RELIABILITY.md) — kapasitas & mode kegagalan
* [adr/](./adr/) — catatan keputusan arsitektur

**Di luar folder ini:**
* **Kebutuhan produk:** [00-product/PRD-01-POS-INTI.md](../00-product/PRD-01-POS-INTI.md)
* **Skema basis data:** [30-data/DATA-MODEL.md](../30-data/DATA-MODEL.md)
* **Kontrak REST API:** [20-api/openapi.yaml](../20-api/openapi.yaml)
* **Keamanan:** [40-security/SECURITY.md](../40-security/SECURITY.md)
* **Infrastruktur:** [50-operations/INFRASTRUCTURE.md](../50-operations/INFRASTRUCTURE.md)
* **Fondasi UI/UX:** [70-design-system/fondasi-UI-v0.1.md](../70-design-system/fondasi-UI-v0.1.md)
