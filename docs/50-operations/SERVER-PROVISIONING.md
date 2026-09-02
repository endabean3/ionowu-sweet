# Provisioning Server — Hostinger dari Nol sampai Siap Deploy

> **Status:** 🟡 Draft · **Fase C** dari [15-development/README.md](../15-development/README.md)
> **Tujuan:** dari VPS kosong sampai Dokploy siap menerima deploy — **sekali kerja, tercatat penuh.**

---

## 1. Ketentuan Server

| Hal | Ketentuan | Alasan |
|---|---|---|
| Penyedia | **Hostinger KVM VPS** | Keputusan 21 Agustus 2026 |
| Region | **Singapura** (atau terdekat Indonesia) | Latensi kasir |
| RAM | ⚠️ **Minimum 8 GB** | Budget runtime ~3 GB (termasuk worker Python & agregasi BI) + OS + Dokploy + Traefik + lonjakan |
| vCPU | Minimum 2 | Postgres + Go + Node |
| Disk | Minimum 50 GB SSD | DB + volume; **build tidak lagi di sini** ([ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md)) |
| OS | **Ubuntu LTS** | |
| IPv4 | Publik statis | DNS |

### Anggaran memori (menentukan pilihan plan)

```
pos-engine             128 MB
web                    256 MB
postgres               512 MB
redis                  256 MB
intelligence-worker    512 MB   ← ADR-0006
ruang kerja agregasi  ~512 MB   ← puncak saat job malam
──────────────────────────────
subtotal              ~2,2 GB
+ Traefik & Dokploy    ~300 MB
+ OS                   ~500 MB
──────────────────────────────
≈ 3 GB terpakai · 4 GB TERLALU KETAT · 8 GB disarankan
```

> ⚠️ **Naik dari perkiraan awal.** Sebelum [ADR-0006](../10-architecture/adr/0006-crm-bi-and-python-service.md),
> 4 GB dinilai cukup. Dengan worker Python dan agregasi BI, job malam berisiko meng-OOM
> di 4 GB — dan bila itu terjadi, ia dapat menyeret `pos-engine` ikut mati.

---

## 2. Urutan Provisioning

Jalankan berurutan. Setiap langkah punya verifikasi — **jangan lanjut sebelum lulus.**

### C1 — Sistem dasar

```bash
apt update && apt upgrade -y
adduser deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
timedatectl set-timezone Asia/Jakarta
```

> **Zona waktu server** memengaruhi jendela migrasi dan jadwal job. Waktu **disimpan UTC**
> di database ([DATA-MODEL](../30-data/DATA-MODEL.md) §2); ini hanya untuk log dan cron.

### C2 — SSH

```bash
# /etc/ssh/sshd_config
PasswordAuthentication no
PermitRootLogin prohibit-password
```
```bash
systemctl restart ssh
```

**Verifikasi:** buka terminal **kedua** dan pastikan bisa login sebagai `deploy` sebelum
menutup sesi pertama. Salah konfigurasi SSH tanpa sesi cadangan = terkunci dari server sendiri.

### C3 — Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

⚠️ **Ini belum cukup.** Lihat langkah C7 — Docker dapat menembus UFW.

### C4 — Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

> **Docker di sini hanya untuk menjalankan, bukan membangun.** VPS menarik image jadi dari
> `ghcr.io`; `docker build` berjalan di GitHub Actions
> ([ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md)). Lihat pembagiannya di
> [DOCKER.md](./DOCKER.md) §1.

### C5 — Dokploy

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Dokploy memasang Traefik dan menyajikan UI di port **3000**.

> ⚠️ **Port 3000 tidak dibuka di UFW dan memang tidak boleh.** Akses UI lewat SSH tunnel:
> ```bash
> ssh -L 3000:localhost:3000 deploy@<IP>
> ```
> Siapa pun yang masuk ke UI Dokploy **efektif memiliki root di VPS ini** (ia memegang
> `docker.sock`) — lihat [NETWORK-HARDENING](./NETWORK-HARDENING.md) §5.

### C6 — fail2ban & pembaruan otomatis

```bash
apt install -y fail2ban unattended-upgrades
systemctl enable --now fail2ban
dpkg-reconfigure -plow unattended-upgrades
```

### C7 — ⚠️ Verifikasi Firewall dari LUAR

**Langkah yang tidak boleh dilewati.** Docker menulis aturan iptables pada chain `DOCKER`
yang dievaluasi **sebelum** UFW — sehingga port yang di-publish tetap terbuka meski
`ufw status` terlihat benar ([NETWORK-HARDENING](./NETWORK-HARDENING.md) §3).

Dari mesin lain:

```bash
nmap -Pn -p 22,80,443,2375,3000,5432,6379,8080 <IP-SERVER>
```

Hasil yang benar: **hanya 22, 80, 443 terbuka.** Bila 5432 atau 3000 terbuka, hentikan
seluruh proses dan perbaiki sebelum melanjutkan.

Dari dalam server:
```bash
ss -tulpn | grep -v '127.0.0.1'
```

### C8 — DNS

| Record | Nilai |
|---|---|
| `api.ionowu.com` | A → IP VPS |
| `app.ionowu.com` | A → IP VPS |
| `staging.ionowu.com` | A → IP VPS |

**Jangan** buat record untuk UI Dokploy.

### C9 — Project Dokploy

```
Project: ionowu-sweet
├── Compose: production   → docker-compose.prod.yml
└── Compose: staging      → docker-compose.prod.yml (env berbeda)
```

Domain diatur per layanan di UI Dokploy; Traefik menerbitkan TLS otomatis.

### C10 — Kredensial registry

Dokploy perlu menarik image privat dari `ghcr.io`:

```bash
docker login ghcr.io -u <username> -p <GHCR_TOKEN>
```

Token: Personal Access Token dengan scope `read:packages` saja.

### C11 — Rahasia

Masukkan seluruh variabel dari [CONFIGURATION.md](./CONFIGURATION.md) §3 ke panel
Environment Dokploy.

> **Simpan salinannya di luar VPS** — pengelola kata sandi tim. Bila VPS hilang, rahasia
> hilang bersamanya dan pemulihan menjadi mustahil ([BACKUP-DR](./BACKUP-DR.md) §5B langkah 3).

### C12 — Backup

1. Buat bucket **Cloudflare R2** (region berbeda dari VPS)
2. Konfigurasikan backup terjadwal Dokploy → R2, setiap jam
3. **Jalankan backup manual sekali dan verifikasi berkasnya ada di R2**

Backup yang belum pernah diverifikasi bukan backup.

### C13 — Telemetri

Pasang agen Grafana Cloud dan `SENTRY_DSN` ([ADR-0005](../10-architecture/adr/0005-telemetry-external-data-internal.md)).
Uptime monitor dipasang **di luar VPS ini**.

---

## 3. Gerbang Fase C

Jangan lanjut ke staging sebelum seluruhnya ✅:

- [ ] Login SSH dengan kata sandi **gagal**; kunci berhasil
- [ ] `nmap` dari luar: hanya 22, 80, 443
- [ ] UI Dokploy **tidak** terjangkau dari internet
- [ ] `ufw status` aktif; `fail2ban` berjalan
- [ ] Docker & Dokploy berjalan
- [ ] DNS teresolusi
- [ ] Sertifikat TLS terbit (uji `https://api.ionowu.com`)
- [ ] `docker login ghcr.io` berhasil
- [ ] Seluruh rahasia ada di Dokploy **dan** tersalin di luar VPS
- [ ] Backup manual pertama terverifikasi ada di R2
- [ ] Telemetri mengalir ke Grafana Cloud & Sentry

---

## 4. Apa yang Tidak Dilakukan di Server Ini

| Tidak dilakukan | Alasan |
|---|---|
| Build image | Dipindahkan ke CI ([ADR-0004](../10-architecture/adr/0004-ci-build-and-registry.md)) |
| Menjalankan Prometheus/Grafana/Sentry | Bersaing memori dengan kasir ([ADR-0005](../10-architecture/adr/0005-telemetry-external-data-internal.md)) |
| Menyimpan satu-satunya salinan rahasia | Hilang bersama VPS |
| Menyimpan satu-satunya backup | Backup panel Hostinger ada di infrastruktur yang sama |
| Mem-publish port layanan | Hanya Traefik |
