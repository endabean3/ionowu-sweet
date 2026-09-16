# ADR-0008: Tiga Penyimpangan dari Standar Server Ionowu v3.9

| Metadata | Nilai |
|---|---|
| **Status** | **Diterima** (2 September 2026) |
| **Mengubah** | `services/pos-engine/Dockerfile` · `apps/web/Dockerfile` · `.github/workflows/build.yml` |
| **Dokumen Acuan** | `fondasi-server-ionowu.md` v3.9 §2.2, §2.3, §3.1 |

## Konteks

`fondasi-server-ionowu.md` adalah standar **mengikat** — pelanggaran butir WAJIB berarti
deployment ditolak (§0.2). Prinsip P7 menyediakan jalur resmi: penyimpangan **boleh**
terjadi asalkan ditulis sebagai ADR berisi konteks, alasan, dan pemicu peninjauan ulang.
Standar yang tidak menyediakan jalur ini akan dilanggar diam-diam.

Saat menyelaraskan `ionowu-sweet` dengan standar, tiga butir tidak dapat dipenuhi apa
adanya. Ketiganya didaftar terbuka di sini, bukan disembunyikan di balik konfigurasi yang
terlihat patuh.

## Alternatif yang Dipertimbangkan

**Menurunkan `go.mod` ke `go 1.23` agar `IMG-03` terpenuhi harfiah.** Ditolak: kode
memakai `math/rand/v2` (dipakai seeder) yang stabil sejak Go 1.22, dan menurunkan versi
bahasa demi mencocokkan tabel base image adalah menukar kemampuan bahasa dengan kecocokan
kosmetik. Tabel §3.1 menyebut keluarga image, bukan larangan atas versi minor.

**Memakai `GOTOOLCHAIN=auto` pada `golang:1.23-alpine`.** Ditolak: Go akan mengunduh
toolchain 1.26 saat build. Itu membuat hasil build bergantung pada jaringan dan pada
versi yang tidak terkunci digest — persis yang hendak dicegah `IMG-02`. Patuh di
permukaan, lebih rapuh di kenyataan.

**Menambahkan shell ke image distroless agar `HEALTHCHECK` bisa jalan.** Ditolak: itu
membatalkan alasan distroless dipilih (§5.3 — "tidak ada shell untuk disalahgunakan") demi
memuaskan satu baris Dockerfile, sementara kesiapan sudah dapat diperiksa lewat probe HTTP
platform.

## Keputusan

**1. `IMG-03` — base image build Go: `golang:1.26-alpine`, bukan `golang:1.23-alpine`.**

`services/pos-engine/go.mod` menyatakan `go 1.26`. Toolchain Go 1.23 **menolak**
membangun modul yang menuntut versi lebih tinggi — ini kegagalan keras, bukan peringatan.
Stage *runtime* tetap persis seperti §3.1: `gcr.io/distroless/static-debian12:nonroot`,
dikunci digest. Yang berubah hanya versi minor pada stage build, yang tidak ikut ke image
runtime sama sekali (`IMG-01`).

**2. `RUN-07` — `pos-engine` tidak memiliki `HEALTHCHECK` di Dockerfile.**

> ✅ **Diperbarui 2026-09-16 — penyimpangan ini ditutup.** Asumsi di bawah ("probe HTTP di panel
> Dokploy") ternyata tidak bisa diterapkan: health check aplikasi Swarm di Dokploy dijalankan
> **di dalam** kontainer, sama seperti `HEALTHCHECK` Docker — dan di image distroless tidak ada
> apa pun untuk menjalankannya. Akibatnya Swarm menganggap replika baru sehat begitu prosesnya
> hidup, dan rollback otomatis `DEP-07` tidak akan pernah terpicu.
>
> Solusinya **tidak** menambahkan shell (alternatif yang tetap ditolak di atas): biner `pos-engine`
> sendiri kini punya subperintah `healthcheck` yang memanggil `/health/ready`, dan Dockerfile
> memakainya dalam bentuk exec `HEALTHCHECK CMD ["/api", "healthcheck"]`. Diverifikasi pada image
> distroless sungguhan: `healthy` saat Postgres hidup, `unhealthy` (status 503) ±50 detik setelah
> Postgres dimatikan, pulih ±20 detik setelah dinyalakan. Teks asli dipertahankan di bawah
> sebagai riwayat.

Image distroless tidak memuat shell maupun `wget`/`curl`, sehingga `HEALTHCHECK CMD` tidak
dapat dieksekusi. Kesiapan diperiksa lewat probe HTTP yang dikonfigurasi di panel Dokploy
ke `/health/ready` — yang **benar-benar** menguji dependensi (mem-ping Postgres), sesuai
tuntutan `RUN-07` bahwa probe bukan "sekadar mengembalikan 200 OK statis". `RUN-08`
terpenuhi penuh: `/health/live` dan `/health/ready` terpisah dan berperilaku berbeda,
diverifikasi lewat percobaan nyata (database dimatikan → `live` 200, `ready` 503).

Image `web` tetap memiliki `HEALTHCHECK` karena `node:22-alpine` punya `wget`.

**3. `IMG-12` — SBOM aktif, penandatanganan cosign belum.**

`sbom: true` dan `provenance: true` sudah aktif di CI. Penandatanganan cosign **belum**,
karena ia menuntut keputusan yang belum diambil: identitas penandatangan (OIDC keyless
milik organisasi mana) dan kebijakan verifikasi di sisi Dokploy. Menandatangani dengan
identitas sembarang menghasilkan tanda tangan yang tidak ada yang memverifikasi — teater
kepatuhan, bukan keamanan.

## Konsekuensi

**Positif:**

* Build `pos-engine` deterministik dan terkunci digest, tanpa unduhan toolchain saat build.
* Permukaan serangan runtime tetap minimal — tidak ada shell di image jalur uang.
* Ketiga penyimpangan terlacak dan punya pemicu peninjauan, bukan menjadi utang senyap.

**Negatif / biaya yang kami terima:**

* Versi Go pada stage build berbeda dari tabel §3.1, sehingga audit otomatis terhadap
  daftar base image akan menandainya dan menuntut pengecualian eksplisit.
* ~~Tanpa `HEALTHCHECK` Docker, `docker ps` tidak menampilkan status sehat `pos-engine`~~ —
  ditutup 2026-09-16, lihat §2.
* Image belum bertanda tangan, sehingga verifikasi rantai pasok belum dapat ditegakkan di
  sisi deploy.

**Yang akan kami tinjau ulang bila:**

* Tabel §3.1 diperbarui memuat baris Go 1.26 — penyimpangan #1 gugur dengan sendirinya.
* Dokploy menyediakan cara menjalankan probe non-HTTP, atau standar menerima probe
  platform sebagai pemenuhan `RUN-07` secara eksplisit — penyimpangan #2 gugur.
* Identitas penandatangan dan kebijakan verifikasi image ditetapkan tim platform —
  penyimpangan #3 **wajib** ditutup pada rilis berikutnya setelah keputusan itu ada.
