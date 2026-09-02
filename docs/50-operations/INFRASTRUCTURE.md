# Infrastruktur — Topologi Server & Batas Jaringan

> **Status:** 🟡 Draft — beberapa nilai perlu dikonfirmasi dengan kondisi VPS sebenarnya
> **Dokumen Terkait:** [DOKPLOY.md](./DOKPLOY.md), [DOCKER.md](./DOCKER.md), [NETWORK-HARDENING.md](./NETWORK-HARDENING.md), [FDR.md](../10-architecture/FDR.md)

---

## 1. Di Mana Segala Sesuatu Berada

`FDR.md` menjelaskan sistem sebagai **kotak-kotak logis** (Go engine, TS BFF, Postgres, Redis).
Dokumen ini menjelaskan **mesin fisik** tempat kotak-kotak itu benar-benar berjalan, dan
siapa yang boleh menyentuhnya dari luar.

```
                        INTERNET
                            │
                            ▼
                 ┌─────────────────────┐
                 │   DNS (A record)    │   api.ionowu.com, app.ionowu.com
                 └──────────┬──────────┘   dokploy.ionowu.com (dibatasi)
                            │
        ══════════ BATAS FIREWALL (UFW) ══════════
                            │   hanya 22 / 80 / 443
                            ▼
   ┌──────────────────────────────────────────────────────────┐
   │                    VPS (Linux, Docker)                   │
   │                                                          │
   │   ┌──────────────────────────────────────────────────┐   │
   │   │  TRAEFIK  (dikelola Dokploy)                     │   │
   │   │  :80 → redirect :443 · TLS Let's Encrypt         │   │
   │   └───────┬──────────────────────┬───────────────────┘   │
   │           │                      │                       │
   │           ▼                      ▼                       │
   │   ┌───────────────┐      ┌───────────────┐               │
   │   │  pos-engine   │      │   web-app     │  ← TIDAK ada  │
   │   │  (Go) :8080   │      │ (Next.js):3000│    port publish│
   │   └───────┬───────┘      └───────┬───────┘    ke host    │
   │           │                      │                       │
   │           └──────────┬───────────┘                       │
   │                      ▼                                   │
   │        ┌─────────────────────────────┐                   │
   │        │  Jaringan Docker internal   │  ← tidak pernah   │
   │        │  postgres:5432 redis:6379   │    keluar host    │
   │        │  intelligence-worker        │                   │
   │        └─────────────────────────────┘                   │
   │                                                          │
   │   ┌──────────────────────────────────────────────────┐   │
   │   │  DOKPLOY UI :3000  ← JANGAN dibuka ke publik     │   │
   │   └──────────────────────────────────────────────────┘   │
   └──────────────────────────────────────────────────────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │  Object Storage S3  │  backup DB & aset
                 └─────────────────────┘
```

---

## 2. ⚠️ Tabrakan Port yang Harus Diselesaikan

`FDR.md` §4 mem-*publish* `web-app` ke host:

```yaml
web-app:
  ports:
    - "3000:3000"     # ← masalah
```

Dua hal salah di sini setelah memakai Dokploy:

1. **Port 3000 adalah port default UI Dokploy.** Keduanya akan berebut port yang sama di host.
2. **Tidak ada layanan aplikasi yang boleh mem-publish port ke host sama sekali.** Traefik
   menjangkau kontainer lewat jaringan Docker internal, bukan lewat port host. Mem-publish
   port justru membuat aplikasi bisa diakses langsung **melewati** Traefik — artinya tanpa
   TLS, tanpa rate limiting, dan (lihat [NETWORK-HARDENING.md](./NETWORK-HARDENING.md) §3)
   **tanpa terhalang firewall**.

**Perbaikan:** hapus seluruh blok `ports:` dari `web-app` dan `pos-engine`. Ganti dengan
`expose:` (atau tanpa apa pun — layanan dalam satu jaringan Docker sudah saling menjangkau),
lalu biarkan Dokploy yang memasang label routing Traefik.

---

## 3. Matriks Paparan Port (*Port Exposure Matrix*)

Ini adalah rujukan tunggal untuk aturan firewall. Kolom "Terbuka ke publik" harus dibaca
sebagai kontrak: apa pun di luar tabel ini yang terbuka adalah insiden.

| Port | Layanan | Terbuka ke publik | Cara akses yang benar |
|---:|---|:---:|---|
| 22 | SSH | ⚠️ Terbatas | Hanya kunci publik, dibatasi IP admin bila memungkinkan |
| 80 | Traefik HTTP | ✅ Ya | Selalu redirect ke 443 |
| 443 | Traefik HTTPS | ✅ Ya | Satu-satunya pintu masuk aplikasi |
| 3000 | Dokploy UI | ❌ **Tidak** | SSH tunnel, atau domain terpisah + IP allowlist |
| 8080 | pos-engine (Go) | ❌ Tidak | Jaringan Docker internal saja |
| 3000 | web-app (Next.js) | ❌ Tidak | Jaringan Docker internal saja |
| 5432 | PostgreSQL | ❌ **Tidak pernah** | `docker exec`, atau SSH tunnel untuk debugging |
| 6379 | Redis | ❌ **Tidak pernah** | Jaringan Docker internal saja |
| 2377/7946/4789 | Docker Swarm | ❌ Tidak | Hanya relevan bila multi-node |

---

## 4. Spesifikasi Server

`ADR-0001` §4 mengklaim seluruh stack dasar berjalan di bawah **512MB RAM**. Klaim itu
menentukan ukuran VPS, jadi harus diverifikasi, bukan diasumsikan.

| Komponen | Batas memori (FDR §4) | Catatan |
|---|---:|---|
| pos-engine (Go) | 128 MB | |
| web-app (Next.js) | 256 MB | Build Next.js butuh **jauh** lebih besar dari runtime |
| postgres | — | ❌ belum ditetapkan |
| redis | — | ❌ belum ditetapkan |
| intelligence-worker (Python) | **512 MB** + ~512 MB ruang kerja agregasi | ✅ Ditetapkan ([ANALYTICS-BI](../10-architecture/ANALYTICS-BI.md) §5) |
| Traefik + Dokploy agent | — | ❌ belum diperhitungkan |

> ✅ **Sudah diputuskan:** build dijalankan di **GitHub Actions**, VPS hanya menarik image
> dari `ghcr.io`. Lihat [ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md).
> Ini menghapus risiko OOM saat build dan membuat rollback deterministik.

---

## 5. Penyedia VPS — Ditetapkan

**Hostinger (KVM VPS)** — keputusan 21 Agustus 2026.

| Hal | Ketentuan |
|---|---|
| Region | Terdekat dengan Indonesia — **Singapura** bila tersedia |
| RAM | ⚠️ **Minimum 8 GB** sejak [ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md) — worker Python + agregasi BI menaikkan budget runtime ke ~3 GB. 4 GB kini terlalu ketat. |
| OS | Ubuntu LTS |
| Backup panel Hostinger | ⚠️ **Bukan pengganti** backup eksternal — berada di infrastruktur yang sama |
| Firewall panel Hostinger | ⚠️ **Bukan pengganti** UFW; tidak melindungi dari jebakan Docker↔UFW (§3 [NETWORK-HARDENING](./NETWORK-HARDENING.md)) |

Beban build **tidak lagi berada di VPS ini** sejak [ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md).

### Masih Harus Ditetapkan

- [ ] Verifikasi region & RAM plan yang aktif di akun
- [ ] Nama domain final & struktur subdomain
- [x] ~~Provider object storage~~ → **Cloudflare R2** ([TECH-STACK](../10-architecture/TECH-STACK.md) §8) ([BACKUP-DR.md](./BACKUP-DR.md))
- [ ] Apakah staging berbagi VPS dengan produksi (murah, tapi berisiko) atau terpisah
- [ ] Batas memori untuk Postgres, Redis, dan worker Python
