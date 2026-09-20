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
| **Monorepo** (final, dikonfirmasi pemilik 2026-09-18) | REPOSITORY.md §1 |
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
95 dokumen .md di docs/ · 11 folder · 13 ADR diterima (0001–0013)
15 migrasi · 47 tabel · 65 indeks · 82 kueri SQL
```

> Angka dihitung ulang 2026-09-19 langsung dari repo. Audit dokumen menyeluruh
> (§seksi, yatim, kontradiksi, FK, tenant-scope) belum diulang sejak angka lama.

### Produksi sudah hidup (deploy pertama 2026-09-17)

* `https://sweet.ionowu.com` (web) dan `https://api.sweet.ionowu.com` (pos-engine), di
  Dokploy, image dari ghcr.io, `api` dan `web` masing-masing 2 replika.
* Runbook [deploy-pertama](./docs/50-operations/runbooks/deploy-pertama.md) §5 **A–C lolos**
  pada 2026-09-18 (TLS, `/health/ready` = 200, CORS APK + web). **§5 D–E belum**: login dari
  APK di ponsel sungguhan, jual curah 30 ml, uji Wi-Fi mati di tengah transaksi.
* [GO-LIVE](./docs/50-operations/GO-LIVE.md) masih hampir seluruhnya belum dicentang —
  terutama **restore backup belum pernah diuji**, alarm, uptime monitor, `app_readonly`.
* Sejak ada data nyata di produksi, invarian §6 #9 (migrasi hanya maju) berlaku sungguhan.

### Yang sudah ada

* **`pos-engine`**: auth (register/login/refresh/logout, JWT EdDSA), `/sync/pull` +
  `/sync/push`, checkout `/sales`, refund `/sales/{id}/refund`, shift (buka/tutup/kas
  masuk-keluar), katalog + impor CSV, outlet, stok (level, event, opname), `GET
  /analytics/dashboard`, health live/ready + subperintah `healthcheck`.
* **`apps/web`**: login/daftar, layar kasir offline-first (antrean IndexedDB + mesin sync),
  jual per ml/gram, dashboard, katalog (tambah, impor CSV), printer Bluetooth, halaman
  **Pengaturan** (profil toko & penutup struk, pratinjau struk, printer, akun), modul uang
  TS yang lulus uji paritas terhadap fixture Go.
* **Satuan jual ≠ satuan stok** (ADR-0012): bibit Warung Wangi dijual per **ml** tetapi
  stoknya **gram** lewat `uom_conversions` (faktor g/ml). Nota ml, ledger stok gram. Kode yang
  membaca stok **wajib** memakai `stock_uom`, bukan `variants.uom`.
* **Member pelanggan** (migrasi 00012): daftar di kasir (WA wajib + wajib follow TikTok toko),
  kode `M-XXXXXX` + barcode CODE128 di nota, bonus tester tiap beli & merchandise perdana.
  Bisa offline; `customers` diproses paling awal di `/sync/push`.
* **Garansi di nota** (migrasi 00011): "Garansi N hari s/d <tanggal>", diatur di Pengaturan.
* **Racikan parfum** (migrasi 00013): Pengaturan "% bibit" (Warung Wangi 65 → 65:35). Nota berisi
  bibit ml mencetak takaran botol 10–100 ml; keypad kasir menampilkan "Botol 30 ml → 19,5 ml".
* **Nota publik lewat QR** (ADR-0013, migrasi 00014): nota mencetak QR ke
  `<outlets.nota_web_url>/<tenant>/<nota>` (Warung Wangi: `warungwangi.ionowu.com/nota`, repo
  terpisah `endabean3/warungwangi`). Halaman itu membaca **endpoint publik TANPA login**
  `/public/v1/nota/...` dari server-nya untuk cek garansi & daftar member (1× per nota, ≤ 30 hari).
  Ini satu-satunya permukaan tanpa login di pos-engine — **ubahan di `public_nota.go`/`.sql`
  ditinjau sebagai perubahan keamanan**. Nomor di nota = id penjualan di server (dulu dua ULID
  berbeda — bug itu sudah diperbaiki; jangan dipisah lagi).
* **Layar Stok** (`/stok`): sisa stok per barang dalam SATUAN STOK, plus barang masuk, barang
  rusak/hilang, dan opname (hasil timbang menggantikan stok, selisih masuk ledger). Owner,
  manager, gudang saja; butuh online karena stok adalah angka bersama semua perangkat.
* **Riwayat transaksi** (`/riwayat`): cari nota lama, cetak ulang, **refund**, dan **void**.
  Dibaca dari server (`GET /sales`, `GET /sales/{id}`), bukan Dexie — transaksi perangkat lain
  ikut terlihat. Void hanya selama shift transaksi masih TERBUKA (invarian §6 #5); setelah itu
  hanya refund. Kasir butuh PIN manager (dipakai bersama refund lewat `verifikasiPinManager`);
  alur PIN belum ada di layar, jadi kasir diarahkan ke owner/manager.
* **Kode nota = barcode 1D** di setiap nota (CODE128, printer termal & browser): 6 karakter
  terakhir id transaksi — sama dengan akhiran `receipt_number`. Dipindai kasir di kolom cari
  **Riwayat** (yang kini mencocokkan `receipt_number` ATAU `id`). Bukan id penuh: 26 karakter
  memaksa modul 1 titik di kertas 58 mm, di bawah batas baca pemindai murah. Terbukti terbaca
  `zbarimg` dari nota yang dirender.
* **Laporan stok** (`/laporan-stok`): pergerakan dari ledger `stock_events` (terjual, masuk,
  rusak, koreksi, void) dalam satuan stok, ringkasan per jenis, dan unduh CSV.
* **Tanpa PPN.** Kasir memakai `taxRate: "0"` (Warung Wangi bukan PKP). Server tidak
  menghitung pajak sendiri; ia memakai `tax` dari payload penjualan.
* **APK Android** via Capacitor (ADR-0010) dengan jalur rilis Play Store.
* **CI**: build → ghcr.io (ADR-0004), gerbang keamanan, Playwright E2E offline
  (`apps/web/e2e/`, dijalankan di `ci.yml`).
* **Rate limit** hanya `/auth/login` + `/auth/register`, in-process per replika (PR #31, di-merge 2026-09-18; **429 di produksi belum diverifikasi** — perintahnya ada di deskripsi PR) —
  endpoint lain belum dibatasi. Lihat [API-GUIDELINES](./docs/20-api/API-GUIDELINES.md) §6.

### Belum digarap — jangan diasumsikan ada

Void transaksi (refund ada, void tidak), transfer stok antar-outlet, CRM lanjutan (segmentasi, poin, WA — member dasar SUDAH ada), SOP,
layanan Python (ADR-0006), rate limit berbasis Redis (pos-engine belum punya klien Redis),
jalur principal platform/distributor (RBAC-MODEL.md §5 — `TenantMiddleware` menolaknya
eksplisit), dan skenario uji [OFFLINE-SYNC-SPEC](./docs/30-data/OFFLINE-SYNC-SPEC.md) di luar
yang sudah ada di `e2e/` (mis. 10.000 transaksi, offline 7 hari, jam mundur).

**Aturan pembulatan uang belum resmi.** `internal/money` (Go) dan `src/lib/money/` (TS) memakai round-half-up sebagai ASUMSI implementasi — belum ada ADR atau keputusan produk yang menetapkannya. Kini ada transaksi produksi yang dihitung dengan aturan ini, jadi mengubahnya nanti lebih mahal.

### Langkah berikutnya yang paling masuk akal
1. Selesaikan runbook deploy §5 D–E di ponsel sungguhan (butuh pemilik, bukan kode)
2. Uji restore backup R2 sekali dan catat waktunya (GO-LIVE §3) — sebelum toko percontohan
3. Alarm kritis + uptime monitor eksternal (GO-LIVE §5)
4. ADR aturan pembulatan uang
5. Void transaksi dengan PIN manager (RBAC-MODEL §"Void transaksi")

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
