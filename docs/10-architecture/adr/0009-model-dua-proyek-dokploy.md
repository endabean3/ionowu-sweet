# ADR-0009: Model Dua-Proyek Dokploy — Membalik Sebagian ADR-0003

| Metadata | Nilai |
|---|---|
| **Status** | **Diterima** (3 September 2026) |
| **Membalik sebagian** | [ADR-0003](./0003-dokploy-self-hosted-paas.md) §Keputusan ("seluruh stack didaftarkan sebagai satu aplikasi bertipe Compose") |
| **Mengubah** | `docker-compose.data.yml` (baru), `docker-compose.prod.yml`, [DOKPLOY.md](../../50-operations/DOKPLOY.md) §2 |
| **Dokumen Acuan** | `fondasi-server-ionowu.md` §2.9 (`DEP-13`), §3.5 |
| **Terkait** | [ADR-0008](./0008-penyimpangan-standar-server-ionowu.md) |

## Konteks

ADR-0003 memutuskan "seluruh stack didaftarkan sebagai satu aplikasi bertipe **Compose**" di
Dokploy — `pos-engine`, `web`, `postgres`, `redis`, `intelligence-worker` semua dalam satu
`docker-compose.prod.yml`. Alasannya waktu itu: kelimanya perlu berbagi jaringan dan urutan
start bergantung pada healthcheck, dan Application terpisah "memaksa membuat jaringan bersama
secara manual — kompleksitas tanpa manfaat."

`fondasi-server-ionowu.md` §3.5 (`DEP-13`) menuntut sebaliknya: setiap aplikasi **wajib**
dipecah jadi proyek Compose (data) + proyek Application/Swarm (stateless), dengan alasan
teknis yang diverifikasi lewat pengujian nyata (Docker 29.7.2, bukan asumsi):

> Dokploy tipe Compose menjalankan `docker compose`, bukan `docker stack`. Di bawah Swarm,
> `depends_on` bentuk panjang dengan `condition:` **ditolak saat parse**; bentuk pendek
> diterima tapi **tanpa jaminan urutan** saat runtime. Karena itu `update_config`,
> `rollback_config`, dan `deploy.replicas` **diabaikan diam-diam** bila layanan stateless
> dijalankan sebagai Compose — `DEP-07` (rolling update tanpa downtime) gagal tanpa
> peringatan apa pun.

Ini bukan preferensi gaya konfigurasi. Ini kegagalan `DEP-07` yang **tidak terlihat sampai
insiden** — persis kelas masalah yang standar ini dirancang untuk dicegah (§0.4: "aturan yang
hanya bergantung pada kedisiplinan manusia akan dilanggar").

## Alternatif yang Dipertimbangkan

**Mempertahankan satu Compose besar, menerima downtime saat deploy.** Ditolak: kasir POS
adalah beban kerja yang eksplisit tidak boleh berhenti saat jam operasional
(`DOKPLOY.md` §6 sudah mencatat "jangan deploy saat jam sibuk toko" sebagai mitigasi manual —
tapi itu menunda masalah, bukan menyelesaikannya. `DEP-07` ada persis supaya jendela rilis
tidak perlu dihindari secara manual).

**Application untuk semua, termasuk Postgres/Redis.** Ditolak eksplisit oleh
`fondasi-server-ionowu.md` §3.5 sendiri: "Memakai Application untuk semuanya berarti urutan
start tidak lagi terjamin" — persis masalah yang sedang dihindari, hanya berpindah dari
lapisan aplikasi ke lapisan data (lebih berbahaya, karena korupsi urutan start Postgres jauh
lebih mahal daripada API yang telat 10 detik).

## Keputusan

Dipecah menjadi dua proyek Dokploy, persis pola §3.5/§4.5:

1. **`ionowu-sweet-data`** (tipe Compose) — `postgres`, `pgbouncer`, `redis`.
   `depends_on: condition: service_healthy` tetap dihormati karena ini Compose asli.
2. **`ionowu-sweet`** (tipe Application/Swarm) — `api` (pos-engine) dan `web`, masing-masing
   `replicas: 2` dengan `update_config.order: start-first`.

Migrasi skema (`goose`) pindah dari "bagian mana pun compose" menjadi job pre-deploy di CI
(`DAT-05`) — konsisten dengan `depends_on` yang tidak bisa diandalkan untuk mengurutkannya di
bawah Swarm.

`intelligence-worker` (ADR-0006) belum termasuk — belum punya Dockerfile. Ditambahkan sebagai
`worker` di proyek Application saat digarap, mengikuti pola §4.5b (`replicas: 1`,
`update_config.order: stop-first`, tanpa `dokploy-network`).

## Konsekuensi

**Positif:**
* `DEP-07` (zero-downtime) benar-benar tercapai untuk `api`/`web`, bukan cuma tertulis di
  compose lalu diam-diam diabaikan Dokploy.
* `depends_on` Postgres→PgBouncer tetap bekerja seperti dimaksud, karena tetap di bawah
  Compose asli.
* Kegagalan `DEP-13` (kalau ada) terlihat jelas — dua proyek terpisah tidak bisa "sengaja
  digabung tanpa disadari".

**Negatif / biaya yang kami terima:**
* Dua proyek untuk dipelihara di panel Dokploy, bukan satu — sedikit lebih banyak klik saat
  setup awal.
* `DOKPLOY.md` yang sudah ditulis sebelumnya (§2 lama) perlu koreksi eksplisit alih-alih
  cukup dihapus — dicatat di §2 revisi sebagai peringatan, bukan disunting seolah tidak
  pernah salah.
* Jaringan `sweet-internal` harus dibuat manual sekali saat provisioning (`external: true`
  di kedua compose) — bukan lagi otomatis lewat satu `docker compose up`.

**Yang akan kami tinjau ulang bila:**
* Dokploy merilis dukungan native untuk urutan start di bawah tipe Application, meniadakan
  kebutuhan proyek Compose terpisah untuk lapisan data.
* `intelligence-worker` ternyata butuh berbagi siklus deploy yang sangat erat dengan `api`
  sehingga dua proyek Application justru menyulitkan koordinasi rilis.
