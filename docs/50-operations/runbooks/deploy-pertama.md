# Deploy Produksi Pertama

> **Status:** 🟡 Draft · **Belum pernah dijalankan sampai selesai.**
>
> Runbook ini menutup jarak antara "DNS sudah menunjuk VPS" dan "kasir bisa login dari APK".
> Setiap langkah punya cara memverifikasinya; kalau verifikasinya gagal, **berhenti** — jangan
> lanjut ke langkah berikutnya.
>
> Acuan yang tidak diulang di sini: [DOKPLOY](../DOKPLOY.md) §2 (bentuk dua proyek),
> [DEPLOYMENT](../DEPLOYMENT.md) §4 (urutan rilis), [MIGRATIONS](../../30-data/MIGRATIONS.md)
> §7 (expand–contract), [GO-LIVE](../GO-LIVE.md) §4 (uji asap).

---

## 0. Prasyarat

| Butir | Cara memastikan | Status 2026-09-16 |
|---|---|---|
| DNS API | `dig +short A api.sweet.ionowu.com` → `76.13.16.85` | ✅ terverifikasi |
| DNS web | `dig +short A sweet.ionowu.com` → `76.13.16.85` | ✅ terverifikasi |
| Traefik hidup | `curl -sI http://api.sweet.ionowu.com/` → `404` dari Traefik | ✅ (404 = normal sebelum ada aplikasi terdaftar) |
| Rahasia siap | lihat §2 dan §4 | ❌ belum |
| `PUBLIC_API_URL` | `gh variable list` → `https://api.sweet.ionowu.com` | ✅ |

**Rahasia yang harus sudah ada sebelum mulai** (disimpan di panel Environment Dokploy, tidak
pernah di repo — [CONFIGURATION](../CONFIGURATION.md)):

| Variabel | Dipakai | Catatan |
|---|---|---|
| `POSTGRES_SUPERUSER_PASSWORD` | proyek data | |
| `SWEET_APP_PASSWORD` | proyek data **dan** aplikasi | Harus **sama persis** di dua proyek — PgBouncer dan pos-engine memakai kredensial yang sama |
| `REDIS_PASSWORD` | proyek data | |
| `JWT_PUBLIC_KEY` / `JWT_PRIVATE_KEY` | aplikasi | Ed25519, base64. Publik 32 byte, privat 64 byte — pos-engine menolak start bila ukurannya salah (`internal/config/config.go`) |

Membuat pasangan kunci Ed25519 (jalankan di mesin Anda, simpan di pengelola kata sandi):

```bash
docker run --rm golang:1.26-alpine sh -c 'cat <<EOF > /tmp/k.go
package main
import ("crypto/ed25519";"encoding/base64";"fmt")
func main(){ pub,priv,_ := ed25519.GenerateKey(nil)
fmt.Println("PUBLIC :", base64.StdEncoding.EncodeToString(pub))
fmt.Println("PRIVATE:", base64.StdEncoding.EncodeToString(priv)) }
EOF
go run /tmp/k.go'
```

> Kunci privat ini menandatangani seluruh token login. Bocor = siapa pun bisa menerbitkan
> sesi atas nama tenant mana pun. Jangan pernah menaruhnya di repo, tiket, atau chat.

---

## 1. Catat digest image yang akan dirilis

Deploy memakai **digest**, bukan tag (DEP-01/DEP-08) — tag `:main` bergerak, digest tidak.

```bash
gh run list --workflow=build.yml --limit 1
gh run view <RUN_ID> --log | grep -E "→ sha256:"
```

Catat keduanya:

```
pos-engine → sha256:....
web        → sha256:....
```

Verifikasi **isi image web**, jangan hanya percaya build hijau — URL API dibakar saat build:

```bash
docker run --rm ghcr.io/endabean3/ionowu-sweet/web@sha256:<WEB_DIGEST> \
  sh -c 'grep -rl "api.sweet.ionowu.com" .next/static | head -3'
```

Nol hasil = **berhenti**. Image itu memuat URL yang salah dan tidak boleh dirilis
([GO-LIVE](../GO-LIVE.md) §2.G).

---

## 2. Proyek 1 — `ionowu-sweet-data` (tipe **Compose**)

Isi `docker-compose.data.yml`. Tipe **Compose**, bukan Application — Postgres/PgBouncer butuh
`depends_on` yang benar-benar dihormati, dan itu hanya ada di Compose asli (ADR-0009).

1. Buat project → tipe Compose → arahkan ke `docker-compose.data.yml`.
2. Isi environment: `POSTGRES_SUPERUSER_PASSWORD`, `SWEET_APP_PASSWORD`, `REDIS_PASSWORD`.
3. Deploy.

**Verifikasi** (SSH ke VPS):

```bash
docker ps --filter name=sweet- --format '{{.Names}}\t{{.Status}}'
docker exec sweet-pgbouncer psql "postgres://sweet_app:$SWEET_APP_PASSWORD@localhost:5432/ionowu_sweet" -c 'select 1;'
```

Ketiganya harus `healthy`, dan query lewat PgBouncer harus menjawab `1`. Kalau autentikasi
gagal dengan "wrong password type", periksa `AUTH_TYPE: scram-sha-256` — Postgres 16 tidak
memakai md5.

---

## 3. Migrasi skema — **sebelum** aplikasi dideploy

Urutannya wajib: migrasi dulu, kode belakangan ([DEPLOYMENT](../DEPLOYMENT.md) §4). Migrasi
*expand* aman untuk kode lama; kalau gagal, kode lama tetap jalan dan **tidak ada dampak**.

**Backup dulu** — lihat [BACKUP-DR](../BACKUP-DR.md).

> ⚠️ **Sambung LANGSUNG ke `postgres:5432`, bukan lewat PgBouncer.** PgBouncer berjalan
> `POOL_MODE: transaction`, sementara goose memegang *session advisory lock* selama migrasi.
> Lewat transaction pooling, lock itu bisa jatuh ke koneksi backend yang berbeda dan migrasi
> gagal dengan cara yang membingungkan. Ini pengecualian khusus pemeliharaan terhadap DAT-09
> ("aplikasi selalu lewat PgBouncer") — **aplikasi** tetap wajib lewat PgBouncer.

Di VPS, dengan salinan repo (atau hanya folder `30-data/migrations/`):

```bash
export SWEET_APP_PASSWORD='...'    # jangan ketik inline; ambil dari pengelola kata sandi
docker run --rm --network sweet-internal \
  -v "$PWD/30-data/migrations:/migrations:ro" \
  -e GOOSE_DRIVER=postgres \
  -e GOOSE_DBSTRING="postgres://sweet_app:$SWEET_APP_PASSWORD@postgres:5432/ionowu_sweet?sslmode=disable" \
  golang:1.26-alpine \
  sh -c 'go install github.com/pressly/goose/v3/cmd/goose@v3.27.3 && goose -dir /migrations up'
```

`sslmode=disable` aman di sini karena jaringan `sweet-internal` tidak pernah keluar dari host;
Postgres memang tidak mem-publish port apa pun.

**Verifikasi:**

```bash
... goose -dir /migrations status     # semua migrasi "Applied", tidak ada "Pending"
```

> **Kesenjangan yang diketahui:** [DOKPLOY](../DOKPLOY.md) §2 menyebut migrasi "pindah ke CI
> sebagai job pre-deploy (DAT-05)" — job itu **belum ada** di `.github/workflows/`. Sampai
> dibuat, langkah ini manual dan harus dicatat siapa menjalankannya dan kapan.

---

## 4. Proyek 2 — `ionowu-sweet` (tipe **Application**)

`docker-compose.prod.yml` adalah **acuan nilai**, bukan berkas yang dijalankan. Tipe
Application (Swarm) diperlukan untuk rolling update tanpa downtime (DEP-07).

Buat dua layanan:

| | `api` | `web` |
|---|---|---|
| Image | `ghcr.io/endabean3/ionowu-sweet/pos-engine@sha256:<API_DIGEST>` | `ghcr.io/endabean3/ionowu-sweet/web@sha256:<WEB_DIGEST>` |
| Port kontainer | `8080` | `3000` |
| Domain | `api.sweet.ionowu.com` | `sweet.ionowu.com` |
| Replicas | 2 | 2 |
| Jaringan | `sweet-internal` + `dokploy-network` | `dokploy-network` saja |
| Probe kesiapan | `GET /health/ready` | `GET /` |
| Probe hidup | `GET /health/live` | — |

Environment `api`:

```
IONOWU_SWEET_DATABASE_URL   = postgres://sweet_app:<SWEET_APP_PASSWORD>@sweet-pgbouncer:5432/ionowu_sweet
IONOWU_SWEET_JWT_PUBLIC_KEY = <base64 32 byte>
IONOWU_SWEET_JWT_PRIVATE_KEY= <base64 64 byte>
IONOWU_SWEET_CORS_ORIGINS   = https://sweet.ionowu.com,https://localhost
PORT                        = 8080
```

> **`https://localhost` di CORS bukan salah tulis.** Itu origin WebView APK Capacitor
> (ADR-0010), bukan alamat server. Tanpa baris itu, APK terpasang normal lalu setiap panggilan
> API ditolak CORS — gejalanya identik dengan "server mati", dan tidak ada browser yang bisa
> mengujinya.

`web` tidak butuh environment runtime: `NEXT_PUBLIC_API_URL` sudah dibakar saat build.

**Wajib:** matikan toggle **Auto Deploy**. Deploy produksi ditetapkan manual
([DOKPLOY](../DOKPLOY.md) §6) — toggle itu satu-satunya jalur yang bisa melanggarnya tanpa
terlihat di repo.

---

## 5. Daftar periksa setelah deploy

Jalankan berurutan. Gagal di satu baris = berhenti dan perbaiki sebelum lanjut.

### A. TLS terbit

```bash
echo | openssl s_client -connect api.sweet.ionowu.com:443 -servername api.sweet.ionowu.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

- [ ] Subject memuat `api.sweet.ionowu.com`, issuer Let's Encrypt, tanggal masih berlaku
- [ ] Sama untuk `sweet.ionowu.com`

> Sertifikat gagal terbit? **Jangan hapus-buat ulang aplikasi berkali-kali** — Let's Encrypt
> membatasi penerbitan per domain per minggu, dan kuota yang habis menunda go-live berhari-hari.
> Baca log Traefik dulu.

### B. Layanan sehat

```bash
curl -s -o /dev/null -w "live=%{http_code}\n"  https://api.sweet.ionowu.com/health/live
curl -s -o /dev/null -w "ready=%{http_code}\n" https://api.sweet.ionowu.com/health/ready
curl -s -o /dev/null -w "web=%{http_code}\n"   https://sweet.ionowu.com/
```

- [ ] `live=200` — proses hidup
- [ ] `ready=200` — **database terjangkau lewat PgBouncer**; ini yang membuktikan §2 dan §4 nyambung
- [ ] `web=200`

### C. CORS untuk APK — pemeriksaan yang tidak bisa dilakukan browser mana pun

```bash
curl -si -X OPTIONS https://api.sweet.ionowu.com/auth/login \
  -H "Origin: https://localhost" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" | grep -i "^access-control-allow"
```

- [ ] Muncul `access-control-allow-origin: https://localhost`

Tidak muncul = APK akan gagal login meski web berfungsi sempurna. Perbaiki
`IONOWU_SWEET_CORS_ORIGINS`, jangan lanjut.

Ulangi untuk origin web:

- [ ] `Origin: https://sweet.ionowu.com` juga dipantulkan

### D. Dari aplikasi sungguhan

- [ ] Buka `https://sweet.ionowu.com` di browser → halaman login tampil
- [ ] Daftar tenant uji lewat `/daftar` → berhasil
- [ ] **Login dari APK di ponsel sungguhan** (bukan hanya browser) — inilah satu-satunya bukti CORS APK benar
- [ ] Tambah **dua** produk (produk kedua membuktikan perbaikan barcode NULL)
- [ ] Untuk toko curah: buat produk **Pecahan**, jual 30 ml, pastikan struk berbunyi `30 ml`

### E. Uji asap lengkap

- [ ] Jalankan seluruh [GO-LIVE](../GO-LIVE.md) §4 pada tenant uji — termasuk mematikan Wi-Fi
      di tengah transaksi dan memastikan tidak ada duplikat saat online kembali
- [ ] Hapus tenant uji

---

## 6. Bila gagal

| Gejala | Tindakan |
|---|---|
| Migrasi gagal (§3) | Berhenti. Skema dan kode lama utuh, tidak ada dampak. Perbaiki migrasi, ulangi |
| `ready` selalu bukan 200 | Periksa `IONOWU_SWEET_DATABASE_URL`, dan apakah layanan `api` benar-benar tersambung ke jaringan `sweet-internal` |
| pos-engine mati saat start | Ia fail-fast: cek log untuk `wajib diisi` — biasanya kunci JWT salah ukuran atau CORS kosong |
| Sertifikat tidak terbit | Baca log Traefik. Jangan buat ulang aplikasi berulang kali (rate limit) |
| Sudah rilis lalu muncul bug | Deploy ulang digest sebelumnya. **Jangan pernah membalik migrasi** ([MIGRATIONS](../../30-data/MIGRATIONS.md) §3) |

> Rollback otomatis Dokploy saat probe gagal **belum pernah diuji** ([DOKPLOY](../DOKPLOY.md) §6).
> Jangan mengandalkannya sebagai jaring pengaman sampai terbukti di staging.
