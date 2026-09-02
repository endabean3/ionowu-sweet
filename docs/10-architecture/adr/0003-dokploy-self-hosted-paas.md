# ADR-0003: Dokploy sebagai Platform Deployment Self-Hosted

| Metadata | Nilai |
|---|---|
| **Status** | Diterima |
| **Tanggal** | 2026-08-21 |
| **Menggantikan sebagian** | [ADR-0001](./0001-hybrid-go-ts-docker-architecture.md) §3 (orkestrasi manual `docker compose`) |
| **Dokumen Acuan** | [DOKPLOY.md](../../50-operations/DOKPLOY.md), [INFRASTRUCTURE.md](../../50-operations/INFRASTRUCTURE.md) |

## Konteks

`ADR-0001` menetapkan stack ter-kontainerisasi yang dijalankan lewat `docker compose` di VPS
murah, dengan reverse proxy yang belum dipastikan — [FDR.md](../FDR.md) menuliskannya sebagai
"Traefik / Caddy / Nginx", artinya keputusan itu memang belum diambil.

Menjalankan `docker compose` secara manual berarti masih harus menyelesaikan sendiri: penerbitan
dan perpanjangan TLS, build otomatis dari Git, backup database terjadwal, dan agregasi log.
Tim ini kecil dan tidak punya SRE khusus.

Kendala yang berlaku: biaya server harus tetap rendah (`ADR-0001` §4), dan sistem menangani
uang UMKM sungguhan sehingga waktu henti berdampak langsung pada pendapatan pelanggan.

## Alternatif yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| **`docker compose` manual + Caddy** | Paling sederhana, tanpa lapisan tambahan | Semua otomatisasi (TLS, deploy, backup) dikerjakan tangan | Beban operasional berulang terlalu besar untuk tim kecil |
| **Dokploy** | UI deploy, Traefik + TLS otomatis, backup DB terjadwal, tetap di VPS sendiri | Satu komponen tambahan yang harus dipahami; memegang akses `docker.sock` | — **dipilih** |
| **PaaS terkelola (Vercel + DB terkelola)** | Beban operasional mendekati nol | Biaya jauh lebih tinggi; Go engine tidak cocok dengan model serverless; latensi <5ms sulit dijamin | Bertentangan langsung dengan target biaya rendah |
| **Kubernetes (k3s)** | Skalabilitas & rollback matang | Kompleksitas jauh melebihi kebutuhan satu VPS | Terlalu berat untuk tahap saat ini |

## Keputusan

Kami memakai **Dokploy** di VPS sendiri, dengan seluruh stack didaftarkan sebagai satu
aplikasi bertipe **Compose**.

Konsekuensi turunannya: **Traefik ditetapkan sebagai reverse proxy** — mengakhiri pilihan
"Traefik / Caddy / Nginx" yang menggantung di FDR §1, karena Traefik adalah yang dibawa Dokploy.

## Konsekuensi

**Positif:**
- TLS otomatis; ini bukan sekadar kenyamanan — PWA butuh HTTPS agar Service Worker dan
  mode offline (FR-40…FR-45) berfungsi sama sekali.
- Deploy dari Git tanpa membangun pipeline CD sendiri.
- Backup database terjadwal langsung tersedia.
- Tetap di VPS sendiri: data transaksi UMKM tidak berpindah ke pihak ketiga.

**Negatif / biaya yang kami terima:**
- **UI Dokploy setara akses root.** Dokploy memegang `docker.sock`, jadi siapa pun yang masuk
  ke UI-nya menguasai VPS. Ini memaksa kedisiplinan di [NETWORK-HARDENING.md](../../50-operations/NETWORK-HARDENING.md).
- **Build berjalan di server produksi.** Build Next.js dapat menghabiskan memori saat kasir
  sedang bertransaksi.
- **Satu titik kegagalan.** Satu VPS melayani seluruh tenant.
- **Keterikatan pada konvensi Dokploy** untuk label Traefik dan environment variable.
- **Konfigurasi Dokploy sendiri menjadi state kritis** yang harus dicadangkan terpisah dari database.

**Yang akan kami tinjau ulang bila:**
- Build mulai menyebabkan gangguan produksi → pindahkan build ke CI + registry.
- Dibutuhkan node kedua atau target ketersediaan melampaui apa yang bisa diberikan satu VPS.
- Jumlah tenant membuat waktu henti terjadwal tidak lagi dapat diterima.
