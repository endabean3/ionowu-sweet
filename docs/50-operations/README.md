# 50-operations — Menjalankan Sistem di Produksi

Semua yang dibutuhkan agar sistem tetap hidup, terukur, aman di level mesin, dan bisa dipulihkan.

## Menyiapkan Server (sekali kerja)

| Berkas | Status | Isi |
|---|:---:|---|
| [SERVER-PROVISIONING.md](./SERVER-PROVISIONING.md) | 🟡 Draft | Hostinger dari nol s/d siap deploy + ketentuan server |
| [GO-LIVE.md](./GO-LIVE.md) | 🟡 Draft | Checklist rilis produksi pertama |

## Infrastruktur & Platform

| Berkas | Status | Isi |
|---|:---:|---|
| [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) | 🟡 Draft | Topologi VPS, matriks paparan port, spesifikasi server |
| [DOKPLOY.md](./DOKPLOY.md) | 🟡 Draft | Platform deploy, domain & TLS, alur rilis, backup |
| [DOCKER.md](./DOCKER.md) | 🟡 Draft | Standar image & compose, anggaran ukuran, registry |
| [NETWORK-HARDENING.md](./NETWORK-HARDENING.md) | 🟡 Draft | Firewall UFW, SSH, fail2ban, jebakan Docker↔UFW |

## Konfigurasi, Rilis & Keandalan

| Berkas | Status | Isi |
|---|:---:|---|
| [CONFIGURATION.md](./CONFIGURATION.md) | 🟡 Draft | Daftar env var, rahasia, rotasi |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | 🟡 Draft | Lingkungan, jendela rilis, rollback |
| [OBSERVABILITY.md](./OBSERVABILITY.md) | 🟡 Draft | SLO, metrik, log, alarm |
| [BACKUP-DR.md](./BACKUP-DR.md) | 🟡 Draft | RPO/RTO, cakupan, uji restore |
| [runbooks/](./runbooks/) | 🟡 Draft | 6 prosedur insiden |

---

## Tiga Hal Paling Mendesak di Folder Ini

1. **Hapus `ports:` dari layanan aplikasi** — `FDR.md` §4 mem-publish `web-app` di port 3000,
   yang bertabrakan dengan UI Dokploy *dan* melewati Traefik. Lihat [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) §2.
2. **Pahami jebakan Docker↔UFW** — port yang di-publish menembus firewall tanpa jejak di
   `ufw status`. Lihat [NETWORK-HARDENING.md](./NETWORK-HARDENING.md) §3.
3. **Tulis `CONFIGURATION.md`** — rahasia literal (`secret_pass`, `your_ultra_secure_jwt_secret_key`)
   masih tertulis di FDR §4 dan berisiko tersalin ke produksi.
