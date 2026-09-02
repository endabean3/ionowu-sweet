# Dokploy — Platform Deployment

> **Status:** 🟡 Draft — perlu diverifikasi terhadap versi Dokploy yang benar-benar terpasang
> **Dokumen Terkait:** [INFRASTRUCTURE.md](./INFRASTRUCTURE.md), [DOCKER.md](./DOCKER.md), [ADR-0003](../10-architecture/adr/0003-dokploy-self-hosted-paas.md)

---

## 1. Peran Dokploy dalam Sistem

Dokploy adalah **PaaS yang di-host sendiri** — pengganti Vercel/Heroku yang berjalan di VPS
milik sendiri. Dalam sistem ini Dokploy bertanggung jawab atas:

| Tanggung jawab | Sebelumnya di FDR |
|---|---|
| Reverse proxy & TLS | "Traefik / Caddy / Nginx" — kini **ditetapkan: Traefik**, dikelola Dokploy |
| Build image dari Git | Manual `docker compose build` |
| Menjalankan & me-restart layanan | `restart: always` di compose |
| Menyimpan environment variable | Nilai literal di dalam compose ⚠️ |
| Backup database terjadwal | Belum ada |
| Log & metrik dasar per aplikasi | Belum ada |

> **Konsekuensi penting:** karena Dokploy sudah menyediakan Traefik, **jangan** menambahkan
> layanan reverse proxy sendiri ke dalam compose. Dua proxy yang sama-sama merebut port
> 80/443 akan gagal start dengan pesan yang membingungkan.

---

## 2. Bentuk Aplikasi di Dokploy

Stack ini terdiri dari 5 layanan yang saling bergantung, jadi bentuk yang paling cocok
adalah **Compose** (bukan mendaftarkan tiap layanan sebagai Application terpisah):

```
Project: ionowu-sweet
└── Compose: ionowu-stack
    ├── pos-engine           (Go)         → api.ionowu.com
    ├── web-app              (Next.js)    → app.ionowu.com
    ├── postgres             (internal)
    ├── redis                (internal)
    └── intelligence-worker  (Python, internal)
```

**Alasan memilih Compose:** `pos-engine` dan `web-app` harus berbagi jaringan dengan Postgres
dan Redis yang sama, dan urutan start-nya bergantung pada healthcheck. Memecahnya menjadi
Application terpisah memaksa membuat jaringan bersama secara manual — kompleksitas tanpa manfaat.

**Kapan meninjau ulang:** bila `web-app` perlu diskalakan terpisah dari `pos-engine`,
atau bila deploy dashboard mulai mengganggu ketersediaan mesin kasir.

---

## 3. Perubahan Wajib pada `docker-compose.prod.yml`

Compose di [FDR.md](../10-architecture/FDR.md) §4 tidak bisa dipakai apa adanya di Dokploy.
Empat perubahan wajib:

```yaml
# ❌ SEBELUM (FDR §4)                    # ✅ SESUDAH (siap Dokploy)

version: '3.8'                           # 1. hapus — usang di Compose V2

web-app:
  ports:
    - "3000:3000"                        # 2. hapus seluruh blok ports:
                                         #    (tabrakan dgn UI Dokploy + melewati Traefik)
environment:
  - POSTGRES_PASSWORD=secret_pass        # 3. ganti → ${POSTGRES_PASSWORD}
  - JWT_SECRET=your_ultra_secure...      #    nilai diisi di panel Environment Dokploy

                                         # 4. tambahkan label Traefik pada layanan
                                         #    yang menghadap publik (atau set via UI Dokploy)
```

Untuk perlakuan lengkap soal rahasia, lihat [CONFIGURATION.md](./CONFIGURATION.md).

---

## 4. Domain & TLS

| Domain | Menunjuk ke | Catatan |
|---|---|---|
| `api.ionowu.com` | `pos-engine:8080` | Dipakai PWA kasir; harus paling stabil |
| `app.ionowu.com` | `web-app:3000` | Dashboard owner & PWA |
| `dokploy.ionowu.com` | UI Dokploy | **Batasi IP** atau jangan diberi domain sama sekali |

Sertifikat diterbitkan otomatis via Let's Encrypt oleh Traefik. Dua hal yang perlu diingat:

* **PWA wajib HTTPS.** Service Worker dan IndexedDB tidak berfungsi tanpa origin yang aman —
  ini bukan sekadar praktik baik, melainkan syarat teknis agar mode offline (FR-40…FR-45) hidup.
* **Rate limit Let's Encrypt** membatasi penerbitan sertifikat per domain per minggu. Jangan
  menghapus-buat ulang aplikasi berkali-kali saat menguji domain produksi.

---

## 5. Backup

Dokploy menyediakan backup database terjadwal ke penyimpanan S3-compatible. Ini menutup
sebagian kebutuhan `BACKUP-DR.md`, tetapi **tidak seluruhnya**:

| Kebutuhan | Ditangani Dokploy? |
|---|---|
| Dump Postgres terjadwal | ✅ Ya |
| Backup volume (aset, upload) | ⚠️ Perlu diverifikasi |
| **Backup konfigurasi Dokploy sendiri** | ❌ Perlu ditangani sendiri |
| **Bukti restore pernah diuji** | ❌ Selalu tanggung jawab manusia |

> **Risiko yang sering terlewat:** bila VPS hilang total, yang ikut hilang bukan hanya
> database, tetapi juga seluruh konfigurasi Dokploy — daftar aplikasi, environment variable,
> dan setelan domain. Backup database saja tidak membuat sistem bisa dibangun ulang.
> Karena itu `CONFIGURATION.md` harus mencatat setiap env var di luar Dokploy.

---

## 6. Alur Deploy

```
git push (branch main)
        │
        ▼
Dokploy menerima webhook / polling
        │
        ▼
Build image  ──────────────► ⚠️ berjalan DI VPS produksi
        │                      Build Next.js dapat menghabiskan RAM
        │                      selagi kasir sedang bertransaksi
        ▼
Health check
        │
        ├─ lulus ──► Traefik mengalihkan trafik ke kontainer baru
        └─ gagal ──► ⚠️ perilaku rollback perlu diverifikasi & didokumentasikan
```

**Yang masih harus ditetapkan** (masuk ke `DEPLOYMENT.md`):

- [ ] Apakah deploy otomatis dari `main`, atau manual dengan persetujuan?
- [ ] Jendela rilis — **jangan deploy saat jam sibuk toko** (11.00–13.00 & 17.00–20.00 WIB)
- [ ] Prosedur rollback yang sudah diuji, bukan diasumsikan
- [ ] Bagaimana migrasi DB dijalankan relatif terhadap deploy (lihat `30-data/MIGRATIONS.md`, **P0**)
- [ ] Perilaku kasir offline saat deploy berlangsung — idealnya tidak terasa sama sekali

---

## 7. Keputusan Terbuka

1. ~~**Build di VPS atau di CI?**~~ ✅ **Ditutup** oleh
   [ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md): build di GitHub Actions,
   Dokploy hanya menarik image dari `ghcr.io`.
2. **Staging.** Apakah instans Dokploy terpisah, atau project terpisah di VPS yang sama?
3. **Akses UI Dokploy.** SSH tunnel (paling aman) atau subdomain + IP allowlist (paling praktis)?
4. **Single point of failure.** Satu VPS berarti satu titik kegagalan untuk seluruh tenant.
   Dapat diterima di tahap awal — tetapi harus dinyatakan eksplisit di `BACKUP-DR.md`
   sebagai risiko yang **diterima secara sadar**, lengkap dengan target RTO-nya.
