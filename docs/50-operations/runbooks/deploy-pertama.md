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
| Image di ghcr.io **publik** | `curl` anonim ke manifest → `200` | ✅ — Dokploy tidak butuh kredensial registry |
| Repo **publik** | `gh repo view --json visibility` | ✅ — Dokploy bisa clone tanpa akses GitHub |
| Memori | `free -m` → tersedia ±5 GB | ✅ — batas maksimum ionowu-sweet ±1,7 GB (data 896 MB + app 768 MB) |

> ⚠️ **Server ini DIPAKAI BERSAMA**, tidak seperti asumsi di header `docker-compose.data.yml`
> ("VPS khusus aplikasi ini"). Per 2026-09-16 ia juga menjalankan jalintani, warungwangi
> (katalog online), ionowu-web, stack data bersama `ionowu-*`, dan stack pemantauan — 2 vCPU
> untuk semuanya. Ambil **snapshot VPS di panel Hostinger** sebelum deploy pertama: kesalahan
> di sini ikut mengenai proyek lain.

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
  sh -c 'd=/app/apps/web/.next/static; [ -d "$d" ] || { echo "JALUR SALAH: $d tidak ada di image"; exit 2; }; grep -rhoE "https://api\.sweet\.ionowu\.com|localhost:[0-9]+" "$d" | sort | uniq -c'
```

Hasil yang benar **satu baris saja**, berisi URL produksi (diuji 2026-09-17 pada digest
`a0ac35f5…`: `14 https://api.sweet.ionowu.com`). Tafsirkan keluarannya begini:

| Keluaran | Artinya | Tindakan |
|---|---|---|
| Satu baris `https://api.sweet.ionowu.com` | Image benar | Lanjut |
| Ada baris `localhost:…` | URL dev ikut terbakar | **Berhenti** — image tidak boleh dirilis ([GO-LIVE](../GO-LIVE.md) §2.G) |
| Kosong | Bundle tidak memuat URL API sama sekali | **Berhenti** — image tidak boleh dirilis |
| `JALUR SALAH …` (exit 2) | Layout image berubah, **bukan** image yang salah | Cari ulang: `docker run --rm <image> sh -c 'find / -type d -path "*.next/static" 2>/dev/null'`, perbaiki jalur di sini |

> **Kenapa jalurnya absolut dan diperiksa lebih dulu.** Versi sebelumnya mencari di
> `.next/static` relatif terhadap direktori kerja `/app`, padahal image ini berlayout
> monorepo (`CMD node apps/web/server.js`) sehingga build-nya ada di
> `/app/apps/web/.next/static`. `grep` gagal dengan *No such file or directory*, tetapi
> pipeline tetap keluar **0** karena `head` berhasil — jadi hasilnya "nol baris", persis
> gejala yang oleh runbook ini ditafsirkan sebagai *image salah, berhenti*. Siapa pun yang
> mengikutinya apa adanya akan menolak image yang sebenarnya benar. Pemeriksaan `[ -d ]`
> memisahkan dua kegagalan yang tadinya tak bisa dibedakan.

---

## 2. Proyek 1 — `ionowu-sweet-data` (tipe **Compose**)

Isi `docker-compose.data.yml`. Tipe **Compose**, bukan Application — Postgres/PgBouncer butuh
`depends_on` yang benar-benar dihormati, dan itu hanya ada di Compose asli (ADR-0009).

**Sebelumnya, buat jaringannya** (SSH, sekali saja). `docker-compose.data.yml` menandai
`sweet-internal` sebagai `external: true` — ia tidak dibuat otomatis, dan deploy gagal bila
belum ada:

```bash
docker network create --driver overlay --attachable sweet-internal
docker network inspect sweet-internal --format '{{.Driver}} attachable={{.Attachable}}'
# harus: overlay attachable=true
```

**Harus `overlay` + `attachable`.** Layanan `api` di §4 berjalan di Swarm, dan layanan Swarm
hanya bisa bergabung ke jaringan overlay; kontainer Compose di proyek ini baru bisa ikut
bergabung bila jaringannya `attachable`. Pola yang sama sudah dipakai `ionowu-data` di server
ini dan terbukti jalan. Jaringan `bridge` biasa akan membuat `api` tidak pernah bisa
menjangkau PgBouncer.

1. Buat project → tipe Compose → sumber **Git**:
   `https://github.com/endabean3/ionowu-sweet.git`, branch `main`, compose path
   `docker-compose.data.yml`. Sumber **harus Git**, bukan YAML yang ditempel: berkas ini
   me-mount `./infra/initdb` (pembuat role `sweet_app` dan database `ionowu_sweet`), dan
   folder itu hanya ada bila repo di-clone.
2. Isi environment: `POSTGRES_SUPERUSER_PASSWORD`, `SWEET_APP_PASSWORD`, `REDIS_PASSWORD`.
3. Deploy.

**Verifikasi** (SSH ke VPS):

```bash
docker ps --filter name=sweet- --format '{{.Names}}\t{{.Status}}'
docker exec sweet-pgbouncer psql "postgres://sweet_app:$SWEET_APP_PASSWORD@localhost:5432/ionowu_sweet" -c 'select 1;'
```

Ketiganya harus `healthy`, dan query lewat PgBouncer harus menjawab `1` (image PgBouncer
memang membawa `psql` — diverifikasi 2026-09-16). Kalau autentikasi
gagal dengan "wrong password type", periksa `AUTH_TYPE: scram-sha-256` — Postgres 16 tidak
memakai md5.

---

## 3. Migrasi skema — **sebelum** aplikasi dideploy

Urutannya wajib: migrasi dulu, kode belakangan ([DEPLOYMENT](../DEPLOYMENT.md) §4). Migrasi
*expand* aman untuk kode lama; kalau gagal, kode lama tetap jalan dan **tidak ada dampak**.

**Backup dulu** — lihat [BACKUP-DR](../BACKUP-DR.md).

> ⚠️ **Sambung LANGSUNG ke `sweet-postgres:5432`, bukan lewat PgBouncer.** PgBouncer berjalan
> `POOL_MODE: transaction`, sementara goose memegang *session advisory lock* selama migrasi.
> Lewat transaction pooling, lock itu bisa jatuh ke koneksi backend yang berbeda dan migrasi
> gagal dengan cara yang membingungkan. Ini pengecualian khusus pemeliharaan terhadap DAT-09
> ("aplikasi selalu lewat PgBouncer") — **aplikasi** tetap wajib lewat PgBouncer.

Di VPS. Repo publik, jadi berkas migrasinya diambil langsung — dikunci ke commit yang sama
dengan image yang akan dirilis:

```bash
git clone https://github.com/endabean3/ionowu-sweet.git /opt/ionowu-sweet-src
git -C /opt/ionowu-sweet-src checkout <SHA_RILIS>

read -rsp "SWEET_APP_PASSWORD: " SWEET_APP_PASSWORD; echo   # tidak tercatat di history shell
docker run --rm --network sweet-internal \
  -v /opt/ionowu-sweet-src/30-data/migrations:/migrations:ro \
  -e GOOSE_DRIVER=postgres \
  -e GOOSE_DBSTRING="postgres://sweet_app:$SWEET_APP_PASSWORD@sweet-postgres:5432/ionowu_sweet?sslmode=disable" \
  golang:1.26-alpine \
  sh -c 'go install github.com/pressly/goose/v3/cmd/goose@v3.27.3 && goose -dir /migrations up'
```

Nama host-nya `sweet-postgres` — `container_name` di `docker-compose.data.yml`. Bentuk perintah
ini (goose v3.27.3 lewat `GOOSE_DRIVER`/`GOOSE_DBSTRING`) diuji terhadap database lokal pada
2026-09-16.

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
| Health check | **bawaan image** (`/api healthcheck` → `/health/ready`) — jangan ditimpa di panel | **bawaan image** (`wget /`) |

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

**`api` wajib bergabung ke jaringan `sweet-internal`** (Advanced → Swarm Settings → Network),
di samping `dokploy-network`. Tanpa itu `api` tidak bisa menjangkau `sweet-pgbouncer`, dan
`/health/ready` tidak akan pernah 200. Pastikan dari SSH:

```bash
docker service inspect <nama-layanan-api> \
  --format '{{range .Spec.TaskTemplate.Networks}}{{.Target}} {{end}}'
# harus memuat ID jaringan sweet-internal:
docker network inspect sweet-internal --format '{{.Id}}'
```

**Health check sudah dibawa image** sejak 2026-09-16 (ADR-0008 §2): Swarm tidak mengalihkan
trafik ke replika baru sampai `/health/ready` menjawab 200, dan versi yang tidak bisa
menjangkau database otomatis ditolak. Jangan menimpanya dengan health check di panel —
image distroless tidak punya `curl`, sehingga perintah apa pun selain `/api healthcheck`
selalu gagal.

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
- [ ] Di APK dengan printer sungguhan: header → **Pilih printer** → pilih printer → **Cetak uji**.
      Penggaris angka harus muat **tepat satu baris**; bila patah, lebar kertasnya salah
- [ ] Matikan printer lalu ketuk **Cetak** di bar struk terakhir → muncul "Gagal mencetak" dengan
      **Coba lagi**; nyalakan printer, ketuk Coba lagi → struk keluar **satu kali**

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
