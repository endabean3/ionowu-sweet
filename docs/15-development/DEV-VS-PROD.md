# Batas Development vs Production

> **Status:** ✅ Rujukan · **Urutan baca:** dokumen **ke-5** dari 15-development
> **Tujuan:** satu halaman untuk tahu **apa yang berlaku di mana**. Sebagian besar insiden
> pada sistem kecil berasal dari kebiasaan development yang terbawa ke produksi.

---

## 1. Tiga Lingkungan

| | 💻 **Development** | 🧪 **Staging** | 🔴 **Production** |
|---|---|---|---|
| Berjalan di | Laptop | VPS Hostinger (project terpisah) | VPS Hostinger |
| Data | Seed, boleh dihapus | Salinan produksi **dianonimkan** | **Nyata — uang UMKM** |
| Siapa boleh masuk | Semua engineer | Semua engineer | Break-glass + audit |
| Boleh rusak? | ✅ Ya, sering | ✅ Ya | ❌ **Tidak** |
| Kecepatan iterasi | Detik | Menit | Mingguan, terjadwal |

> **Staging bukan formalitas.** Ia satu-satunya tempat prosedur berbahaya — migrasi, restore,
> rollback — boleh dijalankan **untuk pertama kalinya**. Setiap prosedur yang belum pernah
> dicoba di staging akan dicoba pertama kali di produksi, dengan uang pelanggan di dalamnya.

---

## 2. Yang Berbeda, Baris per Baris

| Aspek | 💻 Development | 🔴 Production | Rujukan |
|---|---|---|---|
| **Toolchain** | **Dev Container** — Go, Node, Python, goose, sqlc semua di dalam Docker | Image `ghcr.io` hasil CI | `.devcontainer/` |
| **Docker `build`** | Lokal, hot reload | **GitHub Actions** | [ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md) |
| **Docker runtime** | `docker-compose.dev.yml` | Dokploy tarik `ghcr.io:<sha>` | [DOCKER](../50-operations/DOCKER.md) §1 |
| **Berkas compose** | `docker-compose.dev.yml` | `docker-compose.prod.yml` | [CI-PIPELINE](./CI-PIPELINE.md) §4 |
| **`ports:` di-publish** | ❌ Tidak (opt-in via `docker-compose.expose.yml`) | ❌ **Tidak pernah** kecuali Traefik | [NETWORK-HARDENING](../50-operations/NETWORK-HARDENING.md) §3 |
| **Rahasia** | `.env` lokal, nilai dev | Panel Environment Dokploy | [CONFIGURATION](../50-operations/CONFIGURATION.md) |
| **TLS** | ❌ `localhost` | ✅ Traefik + Let's Encrypt | [DOKPLOY](../50-operations/DOKPLOY.md) §4 |
| **Migrasi** | `make reset` bebas | Expand–contract, tak bisa dibalik | [MIGRATIONS](../30-data/MIGRATIONS.md) §3 |
| **`goose down`** | ✅ Dipakai | ❌ **Dilarang** | idem |
| **Redis persistensi** | Tidak perlu | `appendonly no` (murni cache) | [REDIS-STRATEGY](../10-architecture/REDIS-STRATEGY.md) §3 |
| **Log level** | `debug` | `info` | [CONFIGURATION](../50-operations/CONFIGURATION.md) |
| **Telemetri** | Konsol | Grafana Cloud + Sentry | [ADR-0005](../10-architecture/adr/0005-telemetry-external-data-internal.md) |
| **Backup** | Tidak ada | Tiap jam → Cloudflare R2 | [BACKUP-DR](../50-operations/BACKUP-DR.md) |
| **Pengguna DB `web-app`** | Boleh penuh | **`app_readonly`** | [CONFIGURATION](../50-operations/CONFIGURATION.md) §4 |
| **Data sandbox** | Bebas | `is_sandbox` dikecualikan laporan | [ONBOARDING](../00-product/ONBOARDING-ACTIVATION.md) §6 |
| **Jendela rilis** | Kapan saja | ⛔ Hindari 11–13 & 17–20 WIB | [DEPLOYMENT](../50-operations/DEPLOYMENT.md) §3 |

---

## 3. 🔴 Lima Kebiasaan Dev yang Berbahaya di Produksi

Semuanya wajar saat pengembangan, dan semuanya merusak bila terbawa.

### 1. Mem-publish port

```yaml
ports: ["5432:5432"]   # produksi: DATABASE TERBUKA KE INTERNET
```

Docker menulis aturan iptables pada chain `DOCKER` yang dievaluasi **sebelum** UFW.
`ufw status` akan terlihat benar sementara port tetap terbuka.
**Verifikasi wajib dari luar:** `nmap -Pn -p 22,80,443,3000,5432,6379,8080 <IP>`

### 2. `make reset` / `goose down`

Menghapus volume itu wajar di laptop. Di produksi ia menghapus catatan keuangan UMKM
yang tidak bisa dipulihkan selain dari backup. **Aturan hanya-maju berlaku mutlak.**

### 3. `CREATE INDEX` tanpa `CONCURRENTLY`

Tidak terasa pada tabel kosong. Pada `sales_transactions` yang sudah besar, ia **mengunci
tabel dan menghentikan seluruh kasir di semua tenant**.

### 4. Data produksi di laptop

Untuk debugging terasa masuk akal. Tetapi sejak CRM, data itu memuat **PII pelanggan**
([ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md)) — dan laptop tidak
tunduk pada kontrol keamanan mana pun. Selalu pakai salinan yang dianonimkan.

### 5. `log.Info(user)`

Sangat membantu saat debugging. Di produksi ia mengalirkan data pribadi ke **Grafana Cloud
dan Sentry** — yang menggugurkan seluruh dasar [ADR-0005](../10-architecture/adr/0005-telemetry-external-data-internal.md).
Karena itu gerbang CI `no-secrets-in-logs` bukan kerapian, melainkan penopang keputusan arsitektur.

---

## 4. Yang **Sama** di Kedua Sisi — dan Wajib Sama

Perbedaan di §2 disengaja. Yang di bawah ini **tidak boleh** berbeda, karena perbedaannya
menghasilkan bug "jalan di laptop saya" yang paling mahal:

| Hal | Alasan |
|---|---|
| **Versi Postgres 16 & Redis 7** | Perilaku pembulatan dan penguncian harus identik |
| **Versi toolchain** | Dipin di `.devcontainer/Dockerfile`; image yang sama dipakai CI |
| **Versi Go & Node** | Sama dengan image produksi |
| **Skema database** | Migrasi yang sama, urutan yang sama |
| **Rumus perhitungan uang** | Diikat uji paritas Go ↔ TS |
| **Aturan `sqlc vet`** | Tenant scope ditegakkan sejak lokal |
| **Minimal dua tenant di data seed** | Isolasi tenant tidak bisa diuji dengan satu tenant |

---

## 5. Perjalanan Satu Perubahan

```
💻 DEV
   tulis kode · make dev · make test
   make test-money      ← paritas rumus Go ↔ TS
   make test-offline    ← Playwright, matikan jaringan
        │
        ▼ push branch
🤖 CI  (GitHub Actions)
   lint · uji · sqlc vet · isolasi tenant · budget performa · rahasia di log
        │
        ▼ merge ke main
🤖 CI  build image → ghcr.io:<sha>
        │
        ▼ otomatis
🧪 STAGING
   deploy · uji migrasi · uji restore · uji rollback   ← PERTAMA KALI di sini
        │
        ▼ manual, terjadwal, di luar jam sibuk
🔴 PRODUCTION
   backup → migrasi (expand) → tarik image <sha> → pantau 30 menit
```

**Satu-satunya langkah manual adalah yang terakhir** — dan itu disengaja. Toko sedang buka;
rilis harus terjadi pada waktu yang dipilih manusia, bukan saat seseorang kebetulan merge.

---

## 6. Daftar Periksa Sebelum Menyentuh Produksi

- [ ] Sudah berjalan di dev
- [ ] Sudah berjalan di staging
- [ ] Migrasi diuji di staging dengan salinan data produksi
- [ ] **Rollback sudah pernah diuji**, bukan diasumsikan
- [ ] Backup terverifikasi ada di R2
- [ ] Variabel environment baru sudah ada di panel Dokploy
- [ ] Di luar jam sibuk toko
- [ ] Ada yang berjaga 30 menit setelah rilis

> Bila ada satu saja yang belum tercentang, yang Anda lakukan bukan rilis —
> melainkan percobaan di atas uang orang lain.
