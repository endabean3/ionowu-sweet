# Pipeline Keamanan Otomatis

> **Status:** ✅ Terpasang · **Urutan baca:** dokumen **ke-5** dari 40-security
> **Rujukan:** [.github/workflows/security.yml](../../.github/workflows/security.yml)

---

## 1. Kenapa Dokumen Ini Ada

Dokumen lain di folder ini menjelaskan **model** keamanan: siapa boleh apa
([RBAC-MODEL](./RBAC-MODEL.md)), bagaimana tenant diisolasi ([SECURITY.md](./SECURITY.md)),
siapa yang menyerang ([THREAT-MODEL](./THREAT-MODEL.md)).

Berkas ini menjelaskan **penegakannya** — dan menutup satu kelas ancaman yang tidak bisa
dijaga oleh desain sebaik apa pun:

> **Rantai pasok.** Satu paket npm, modul Go, atau wheel PyPI yang dikompromi masuk
> langsung ke jalur uang, tanpa melewati satu pun kontrol RBAC yang kita rancang.

---

## 2. Kontrol yang Berjalan Otomatis

| # | Kontrol | Kapan | Memblokir? | Menutup |
|---|---|---|:-:|---|
| 1 | **`sqlc vet` — tenant scope** | Tiap PR | ✅ Ya | Kebocoran antar-tenant |
| 2 | **gitleaks** (riwayat penuh) | Tiap PR + mingguan | ✅ Ya | Rahasia ter-commit |
| 3 | **CodeQL** (Go/TS/Python) | Tiap PR + mingguan | ✅ Ya | Injeksi, path traversal, kripto lemah |
| 4 | **govulncheck / pnpm audit** | Tiap PR + mingguan | ✅ Ya | CVE dependensi |
| 5 | **Trivy — konfigurasi IaC** | Tiap PR | ✅ Ya | Compose/Dockerfile tidak aman |
| 6 | **Trivy — base image** | Tiap PR + mingguan | ⚠️ Laporkan | CVE di `golang:1.26-bookworm` |
| 7 | **Rahasia di log uji** | Tiap PR | ✅ Ya | PII bocor ke Grafana/Sentry |
| 8 | **Izin workflow** | Tiap PR | ✅ Ya | Token CI berlebihan |
| 9 | **SBOM (CycloneDX)** | Tiap push `main` | — | Jejak audit rantai pasok |
| 10 | **Dependabot** (5 ekosistem) | Mingguan | — | Dependensi usang |

### Kenapa ada jadwal mingguan

Kontrol 2, 3, 4, dan 6 juga berjalan **tiap Senin 02:00 UTC** meski tidak ada perubahan kode.

> **CVE baru muncul pada kode yang tidak berubah.** Tanpa jadwal, kerentanan yang
> diumumkan setelah PR terakhir tidak akan pernah terdeteksi sampai ada yang kebetulan
> menyentuh berkas itu.

### Kenapa base image dilaporkan, bukan diblokir

`golang:1.26-bookworm` berada di luar kendali kita — memblokir merge karena CVE upstream
yang belum ada patch-nya hanya menghentikan pekerjaan tanpa membuat sistem lebih aman.
Sebaliknya, **konfigurasi IaC memblokir**, karena itu sepenuhnya kendali kita.

---

## 3. Allowlist gitleaks — dan kenapa itu berbahaya

[.gitleaks.toml](../../.gitleaks.toml) memuat pengecualian untuk `secret_pass` dan
`your_ultra_secure_jwt_secret_key`. Keduanya **placeholder yang sengaja kita dokumentasikan
sebagai contoh buruk** ([CONFIGURATION](../50-operations/CONFIGURATION.md) §1).

> ⚠️ **Setiap penambahan allowlist harus ditinjau seperti perubahan keamanan.**
> Allowlist yang tumbuh diam-diam adalah cara paling umum pemindaian rahasia menjadi
> teater keamanan: hijau terus, tetapi tidak lagi memeriksa apa pun.

---

## 4. Aturan Khusus Proyek Ini

Dua aturan gitleaks yang tidak ada di preset bawaan:

| Aturan | Menangkap |
|---|---|
| `pin-kasir-polos` | `pin_code` disamakan dengan 4–6 digit polos — PIN wajib Argon2id ([SECURITY](./SECURITY.md) §4A) |
| `webhook-secret-qris` | Rahasia gateway pembayaran |

---

## 5. 🔴 Yang Masih Harus Dilakukan Manusia

Otomasi tidak menutup semuanya. Empat hal ini **tidak ada gerbang CI-nya**:

| Tindakan | Kenapa manusia |
|---|---|
| **Branch protection di GitHub** | Harus dinyalakan di setelan repo: wajib review, wajib status check, larang force-push ke `main` |
| **2FA untuk seluruh kolaborator** | Setelan organisasi/akun |
| **Verifikasi `nmap` dari luar VPS** | Docker menembus UFW — hanya terlihat dari luar ([NETWORK-HARDENING](../50-operations/NETWORK-HARDENING.md) §3) |
| **Uji restore backup bulanan** | Backup yang belum pernah di-restore bukan backup |

Ditambah dua yang bersifat berkala:

* **Tinjau [THREAT-MODEL](./THREAT-MODEL.md)** tiap ada komponen baru yang menghadap internet
* **Uji penetrasi** sebelum tenant berbayar melewati ~50 outlet

---

## 6. Tiga Risiko yang Masih Terbuka

Diambil dari [THREAT-MODEL](./THREAT-MODEL.md) — **tidak ada satu pun yang tertutup oleh
pipeline ini**, karena semuanya masalah desain, bukan perkakas:

| Risiko | Perbaikan |
|---|---|
| 🔴 Kasir dapat mengakses seluruh cabang | Terapkan `user_outlet_assignments` (sudah ada di migrasi 00001) |
| 🔴 Revokasi token gagal saat Redis restart | Postgres jadi sumber kebenaran ([REDIS-STRATEGY](../10-architecture/REDIS-STRATEGY.md) §2) |
| 🟠 Kunci cache Redis tanpa `tenant_id` | **Tidak tertangkap `sqlc vet`** — hanya SQL yang diperiksa, bukan kunci Redis |

> Baris terakhir layak diperhatikan: pipeline ini kuat pada SQL, tetapi **buta terhadap
> Redis**. Kunci cache tanpa `tenant_id` adalah jalur kebocoran yang lolos dari semua
> gerbang otomatis di §2. Perlu uji integrasi khusus.
