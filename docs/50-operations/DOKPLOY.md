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

> **⚠️ Keputusan di bawah DIBALIK 3 September 2026 — lihat
> [ADR-0009](../10-architecture/adr/0009-model-dua-proyek-dokploy.md).**
> Versi sebelumnya (satu Compose besar untuk semua layanan) tetap didokumentasikan di
> riwayat git untuk konteks, tapi **tidak lagi berlaku** — jangan diikuti.

`fondasi-server-ionowu.md` §3.5 (DEP-13) mewajibkan **dua proyek Dokploy terpisah**, bukan
satu Compose besar seperti rancangan awal repo ini:

```
Project: ionowu-sweet
├── ionowu-sweet-data     tipe: Compose        (docker-compose.data.yml)
│   ├── postgres          (internal)
│   ├── pgbouncer         (internal — DAT-09, satu-satunya jalur akses DB)
│   └── redis             (internal)
│
└── ionowu-sweet          tipe: Application     (docker-compose.prod.yml — REFERENSI, bukan
    ├── api  (pos-engine) replicas 2             yang dijalankan `docker compose up`)
    └── web                replicas 2             → api.ionowu.com, app.ionowu.com
```

`intelligence-worker` (Python, ADR-0006) belum ada di sini — belum punya Dockerfile.

**Kenapa dipisah** (alasan lama "satu Compose lebih sederhana" salah, dan salahnya baru
ketahuan saat benar-benar diuji): Dokploy tipe Compose menjalankan `docker compose` polos,
bukan `docker stack`. `pos-engine`/`web-app` butuh rolling update tanpa downtime
(`DEP-07`), yang **hanya** tersedia di tipe Application (Docker Swarm) — tapi di bawah
Swarm, `depends_on` tidak bisa diandalkan (diverifikasi Docker 29.7.2, fondasi-server-ionowu
§3.5): bentuk panjang dengan `condition:` ditolak saat parse; bentuk pendek diterima tapi
tanpa jaminan urutan runtime. Postgres/Redis/PgBouncer sebaliknya BUTUH `depends_on` yang
benar-benar dihormati — itu hanya bekerja di bawah Compose asli.

Migrasi skema pindah ke CI sebagai job pre-deploy (`DAT-05`) — bukan lagi bagian dari
compose data maupun aplikasi.

**Kapan meninjau ulang lagi:** bila Dokploy mengubah cara tipe Compose menangani rolling
update, atau bila standar `fondasi-server-ionowu.md` merevisi §3.5.

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
merge ke main
        │
        ▼
GitHub Actions build → ghcr.io        (ADR-0004 — BUKAN di VPS)
        │
        ▼
Backup DB → migrasi (expand) → verifikasi skema
        │
        ▼
Dokploy tarik image @digest
        │
        ▼
Probe /health/ready
        │
        ├─ lulus ──► Traefik mengalihkan trafik ke kontainer baru
        └─ gagal ──► kontainer lama dipertahankan (⚠️ belum diuji, lihat bawah)
```

Bagian ini sebelumnya berisi lima pertanyaan terbuka dan diagram yang masih
menggambar build **di VPS** — padahal §7 berkas yang sama sudah menutupnya lewat
ADR-0004. Empat dari lima pertanyaan itu ternyata sudah dijawab di dokumen lain;
yang tertinggal di sini hanyalah penanda basi.

| Pertanyaan | Status | Jawaban |
|---|---|---|
| Migrasi relatif terhadap deploy (**P0**) | ✅ Ditetapkan | [MIGRATIONS](../30-data/MIGRATIONS.md) §7 · [DEPLOYMENT](./DEPLOYMENT.md) §4 — migrasi *expand* **terpisah dan lebih dulu**; gagal = berhenti, kode lama tetap jalan |
| Jendela rilis | ✅ Ditetapkan | [DEPLOYMENT](./DEPLOYMENT.md) §3 — bukan 11–13, 17–20 WIB, bukan Jumat sore |
| Perilaku kasir offline saat deploy | ✅ Ditetapkan | [DEPLOYMENT](./DEPLOYMENT.md) §6 — tidak pernah memaksa reload saat transaksi berjalan |
| Prosedur rollback | 🟡 Tertulis, **belum diuji** | [DEPLOYMENT](./DEPLOYMENT.md) §5 — rollback otomatis Dokploy saat probe gagal harus dibuktikan di staging |
| Deploy otomatis dari `main` atau manual | ❌ **Masih terbuka** | Usulan: **manual** sampai rollback terbukti — daftar periksa [DEPLOYMENT](./DEPLOYMENT.md) §7 mensyaratkan orang berjaga, yang tidak cocok dengan auto-deploy |

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
