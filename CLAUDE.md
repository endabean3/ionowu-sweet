# Konteks Proyek untuk Claude

> **Baca ini lebih dulu.** Berkas ini dimuat otomatis saat bekerja di folder ini dan ikut
> berpindah bersama repositori — jadi ia tetap berlaku meski ganti perangkat atau akun.
> Isinya adalah **keputusan yang sudah diambil** dan **kesalahan yang harus dihindari**,
> bukan ringkasan dokumentasi. Peta lengkap ada di [DOCS-MAP.md](./docs/DOCS-MAP.md).

---

## 1. Ini Proyek Apa

**ionowu sweet** — sistem kasir PWA *offline-first* untuk UMKM Indonesia, berkembang menjadi
**mini ERP** dengan CRM, Business Intelligence, dan modul SOP.

Repositori ini berisi **dokumentasi + skema database + kueri SQL + fondasi backend Go (`services/pos-engine`) + skeleton frontend PWA (`apps/web`)**.

**Tesis produk:** UMKM gagal naik kelas bukan karena kurang pelanggan, melainkan karena
operasionalnya hanya ada di kepala pemilik. Pembeda utama produk bukan fiturnya, melainkan
**offline-first** (toko tetap jualan saat semua gagal) dan **SOP yang diturunkan dari data**.

**Bahasa dokumen: Indonesia.** Istilah teknis boleh tetap Inggris.

---

## 2. Dua Pelanggan yang Sudah Pasti

| Usaha | Bidang | Kebutuhan khusus |
|---|---|---|
| **Warung Wangi** | Parfum refill | Jual per **ml**, stok bibit per liter, BOM (bibit + botol + alkohol) |
| **Media Boga** | Toko bahan kue | Jual per **gram** dari karung 25 kg, konversi satuan |

Keduanya **arketipe B (curah/timbang)**. Karena itu stok wajib `DECIMAL`, bukan `INT` —
kesalahan ini pernah ada di skema awal dan sudah diperbaiki.

---

## 3. Sumber Kebenaran — yang Menang Saat Bertentangan

| Topik | Sumber |
|---|---|
| **Skema database** | `30-data/migrations/` — **bukan** blok SQL di `DATA-MODEL.md` (itu penjelasan rancangan, sebagian sengaja menampilkan bentuk lama) |
| Hak akses / RBAC | `40-security/RBAC-MODEL.md` |
| Kontrak API | `20-api/openapi.yaml` |
| Batas layanan | `10-architecture/SERVICE-BOUNDARIES.md` |
| Tooling | `10-architecture/TECH-STACK.md` |
| Non-Goals | `00-product/VISION-SCOPE.md` §6 |
| Token desain | `70-design-system/MASTER.md` |

---

## 4. ⛔ Sudah Diputuskan — Jangan Ditawarkan Ulang

Semuanya punya ADR atau dokumen keputusan. Membahasnya ulang tanpa alasan baru hanya
membuang waktu.

| Keputusan | Rujukan |
|---|---|
| **Dokploy + Traefik** di VPS Hostinger (**8 GB minimum**) | ADR-0003 · TECH-STACK §2 |
| **Build di GitHub Actions → `ghcr.io`**, bukan di VPS | ADR-0004 |
| **Telemetri eksternal** (Grafana Cloud + Sentry); data transaksi tetap di VPS | ADR-0005 |
| **CRM & BI masuk lingkup; layanan Python aktif Fase 1** | ADR-0006 |
| **Tiga kelas principal** (platform / staf tenant / eksternal) | ADR-0007 |
| **Go:** `chi` + `pgx/v5` + **`sqlc`** + `goose` | TECH-STACK §3 |
| **Frontend:** Next.js 15 · Dexie · **Serwist** · pnpm · Biome · zod | TECH-STACK §4 |
| **Redis Streams + transactional outbox**, bukan Pub/Sub | EVENT-ARCHITECTURE §1, §5 |
| **Mutex stok = kunci baris Postgres**, bukan Redis | REDIS-STRATEGY §5 |
| **Backup: Cloudflare R2** (penyedia berbeda dari VPS) | TECH-STACK §8 |
| **Analytics produk: tabel Postgres sendiri**, bukan PostHog | TECH-STACK §7 |
| **Monorepo** (usulan, menunggu konfirmasi user) | REPOSITORY.md §1 |
| **Seluruh toolchain di Dev Container** — Mac tidak perlu Go/Node/Python | `.devcontainer/` · LOCAL-SETUP §1 |

> **Status host per 2026-08-28.** Mac ini sengaja dibersihkan agar seluruh proses
> pengembangan berjalan di Docker. Yang dihapus: cache `~/.npm`, `~/Library/pnpm/store`,
> `~/go`, artefak `.pnpm-store/` + `node_modules/` di dalam repo, serta paket brew yatim
> (`openjdk`, `android-commandlinetools`, `python@3.12`, `uv`, `librsvg`, `optipng`,
> `pngquant`, `potrace`).
>
> `go`, `node@24`, `sqlc`, dan `golangci-lint` **masih terpasang di host atas permintaan
> pemilik**, tetapi **bukan jalur yang didukung**. Setiap target `Makefile` menjalankan
> perintahnya di dalam container (`$(RUN)`), jadi versi host tidak pernah menentukan hasil
> build — dan perbedaan versi host↔container tidak akan terlihat sampai ia menyebabkan bug.
> Jalankan pekerjaan lewat `make`, bukan lewat `go`/`pnpm` langsung di terminal Mac.

### Aturan Dev Container yang mahal dipelajari (2026-08-28)

Enam cacat berikut membuat container **tampak** sehat padahal rusak. Semuanya sudah
diperbaiki di `.devcontainer/Dockerfile` + `docker-compose.dev.yml`; jangan dibalik.

| Aturan | Kalau dilanggar |
|---|---|
| **Titik pasang named volume harus sudah ada di image, milik `dev`** | Docker membuat induk yang belum ada sebagai **root** → corepack gagal `mkdir /home/dev/.cache/node` → **pnpm mati total** |
| **Jalur volume cache harus sama dengan jalur yang benar-benar dipakai** | `go-mod` sempat dipasang di `/go/pkg/mod` padahal `GOPATH=/home/dev/go` → cache tak pernah bertahan, tiap perintah mengunduh ulang semua modul |
| **`node_modules` root DAN paket harus sama-sama volume** | Status pnpm (`.modules.yaml`, `.pnpm/`) ada di root. Bila hanya `apps/web` yang volume, `down -v` mengosongkan isi tapi status selamat → pnpm bilang *"Already up to date"* dengan `node_modules` **kosong** |
| **`git config --global --add safe.directory /workspace`** | uid bind mount ≠ uid `dev` → `git rev-parse` menolak → `go build` gagal `exit 1` dengan pesan VCS yang menyesatkan |
| **Percepat store pnpm dengan MENUTUPI jalur bawaannya pakai volume — jangan mengubah konfigurasi pnpm** | Bawaan pnpm menaruh store di `/workspace/.pnpm-store`, di dalam bind mount: lambat dan mengotori repo (pernah 452 MB). Memaksanya lewat `storeDir` di `pnpm-workspace.yaml` **merusak CI**: berkas itu ikut ter-checkout di GitHub Actions dan `actions/setup-node` gagal karena jalur container tidak ada di runner. (Sejak pnpm 10, `store-dir` di `.npmrc` dan `npm_config_store_dir` juga diabaikan diam-diam.) |
| **Seeder wajib satu transaksi** | Tanpa itu, `make seed` di database terisi gagal *setelah* menulis tenant/outlet/produk → tenant yatim menumpuk. Sempat ada **tiga** "Kopi Senja", dan kueri yang lupa memfilter `tenant_id` tetap terlihat benar |

---

## 5. ⛔ Sudah Ditolak — Jangan Disarankan

| Jangan sarankan | Alasan |
|---|---|
| `docker compose up` manual / reverse proxy kedua | Dokploy sudah membawa Traefik |
| Build image di VPS produksi | Bisa OOM saat kasir bertransaksi; rollback jadi tak deterministik |
| Prometheus/Grafana/Sentry **self-hosted di VPS produksi** | Bersaing memori dengan kasir; pemantau yang ikut mati tak berguna |
| **ORM (gorm) untuk `pos-engine`** | Menyembunyikan SQL → aturan `tenant_id` tak bisa ditinjau; refleksi melanggar anggaran <5ms |
| **`float` untuk uang atau stok** | Galat pecahan biner menumpuk → selisih kas tak terjelaskan |
| Redis Pub/Sub untuk event | Fire-and-forget: konsumen restart = event hilang permanen tanpa error |
| **Pustaka WhatsApp tidak resmi** | Risiko blokir nomor → FR-50 & FR-51 mati untuk **semua tenant sekaligus** |
| Buku besar, payroll, e-faktur, marketplace pemasok | Non-Goals — produk tersendiri |
| Memaksa input pelanggan di checkout | Melanggar prinsip #1 "kasir tidak boleh menunggu" |
| **Menyuruh install Go/Node/goose/sqlc di host** | Semua sudah di Dev Container; host dipakai proyek lain |
| **`go install` untuk perkakas di Dockerfile** | Menarik ratusan modul; gagal di jaringan tidak stabil. Pakai biner rilis ([DOCKER](./docs/50-operations/DOCKER.md) §1b) |
| **`chown -R` direktori besar di Dockerfile** | Menyalin ulang seluruh direktori jadi layer baru — pernah membengkakkan image jadi 8,45 GB |
| Menyebut arsitektur ini "microservices" | Hanya 2–3 layanan; istilah itu mengundang over-engineering |

---

## 6. 🔒 Invarian — Jangan Pernah Dilanggar

1. **Setiap kueri memfilter `tenant_id`.** Kebocoran antar-tenant adalah kegagalan paling
   fatal; SLO-nya nol selamanya. Ditegakkan otomatis oleh `sqlc vet`.
2. **Kasir tetap bisa berjualan** meski VPS, Redis, internet, atau gateway mati.
   Satu-satunya pengecualian: IndexedDB penuh.
3. **Uang `DECIMAL(14,2)`, kuantitas `DECIMAL(14,3)`.** Tidak pernah `float`.
4. **Transaksi offline selalu diterima**, meski membuat stok negatif. Barang sudah keluar;
   menolak sync berarti menghapus penjualan nyata.
5. **Z-Report yang sudah dicetak tidak pernah berubah.** Transaksi terlambat masuk bucket
   `is_late_arrival`.
6. **Tidak ada rahasia/PII di log.** Ini menopang ADR-0005 — bila dilanggar, data pribadi
   mengalir ke pihak ketiga.
7. **Pipeline keamanan tidak boleh dilemahkan.** Menambah allowlist gitleaks atau
   mematikan gerbang CI harus ditinjau seperti perubahan keamanan
   ([SECURITY-PIPELINE](./docs/40-security/SECURITY-PIPELINE.md) §3).
8. **Hanya Traefik yang mem-publish port.** Docker menembus UFW; `ufw status` bisa terlihat
   benar sementara port terbuka.
9. **Migrasi hanya maju di produksi.** `goose down` hanya untuk lokal.

---

## 7. Kondisi Saat Ini

```
88 dokumen .md · 11 folder · 7 ADR diterima
9 migrasi · 47 tabel · 57 indeks · 32 kueri SQL
Audit: nol error (link · §seksi · penanda basi · yatim ·
        kontradiksi · heading · tabel · blok kode · FK · tenant-scope)
```

**Kode aplikasi bertumbuh nyata.** `services/pos-engine` (Go) memiliki backend chi + sqlc + JWT EdDSA + checkout/shift + seeder 2-tenant. `apps/web` (Next.js 15 + Dexie + Serwist + Tailwind) telah di-bootstrap dengan token *Sweet Creamy Spatial Luxe*, layar POS kasir offline-first, IndexedDB queue, dan modul uang TypeScript (`src/lib/money/`) yang **100% lulus uji paritas terhadap fixture JSON Go**.

**Belum digarap, jangan diasumsikan ada:** `/sync/pull`, `/sync/push`, refund HTTP endpoint, void, opname, transfer stok, CRM, analytics, SOP, jalur principal platform/distributor (RBAC-MODEL.md §5), dan test Playwright offline (§3C TESTING-STRATEGY.md).

**Aturan pembulatan uang belum resmi.** `internal/money` (Go) dan `src/lib/money/` (TS) memakai round-half-up sebagai ASUMSI implementasi — belum ada ADR atau keputusan produk yang menetapkannya.

### Langkah berikutnya yang paling masuk akal
1. Jalur `/sync/pull` + `/sync/push` (kontrak sudah lengkap di `openapi.yaml`)
2. Pengujian Playwright skenario offline (`make test-offline`)
3. Workflow GitHub Actions build → ghcr.io (ADR-0004)
4. ADR untuk aturan pembulatan uang

### Yang memblokir, dan bukan pekerjaan teknis
* **Vendor QRIS** (arah sub-merchant disetujui; Midtrans dievaluasi lebih dulu) — memblokir FR-23
* **BSP WhatsApp** (API resmi disetujui) — memblokir FR-50 & FR-51
* **Wawancara Warung Wangi & Media Boga** — seluruh persona masih hipotesis
* **T&C + DPA** — legalitas usaha tanggung jawab owner, tetapi kewajiban PDP sebagai
  pemroses data melekat pada kita

> Keempatnya **tidak memblokir Fase 0**, yang hanya butuh pembayaran tunai.

---

## 8. Cara Kerja di Repositori Ini

* **Perbarui `DOCS-MAP.md` dan `CHANGELOG.md`** setiap menambah atau menyelesaikan dokumen.
* **Keputusan yang sulit dibalik butuh ADR** (`10-architecture/adr/`, pakai `TEMPLATE.md`).
  Wajib mencantumkan alternatif yang ditolak beserta alasannya.
* **Jangan mengarang angka.** Bila belum diriset (harga pesaing, ketentuan hukum, biaya
  gateway), tandai ❌ atau "belum ditetapkan". Dokumen berisi tebakan yang terlihat seperti
  fakta lebih berbahaya daripada dokumen kosong.
* **Tandai status** di kepala dokumen: ✅ Baseline · 🟡 Draft · 🔴 Usulan/Kerangka.
* **Batas dev vs produksi** ada di `15-development/DEV-VS-PROD.md` — baca sebelum menyarankan
  apa pun yang menyentuh produksi.

### Validasi sebelum menutup pekerjaan

```bash
python3 -c "
import os,re
bad=[]
for root,d,f in os.walk('.'):
    d[:]=[x for x in d if x not in ('.git','node_modules')]
    for n in f:
        if not n.endswith('.md'): continue
        p=os.path.join(root,n)
        for i,l in enumerate(open(p,encoding='utf-8'),1):
            for m in re.finditer(r'\]\((\.[^)#]*)\)',l):
                if not os.path.exists(os.path.normpath(os.path.join(root,m.group(1)))):
                    bad.append(f'{p}:{i} -> {m.group(1)}')
print('LINK PUTUS:',len(bad)); [print(' ',b) for b in bad]
"
```
