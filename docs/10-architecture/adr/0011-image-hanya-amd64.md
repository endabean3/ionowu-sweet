# ADR-0011: Image Hanya `linux/amd64` — Arm64 Dihentikan

| Metadata | Nilai |
|---|---|
| **Status** | **Diterima** (14 September 2026) |
| **Mengubah** | `.github/workflows/build.yml` · `services/pos-engine/Dockerfile` (komentar) |
| **Dokumen Acuan** | `fondasi-server-ionowu.md` — butir `IMG-10` · [ADR-0004](./0004-ci-build-and-registry.md) · [ADR-0008](./0008-penyimpangan-standar-server-ionowu.md) (pola pencatatan penyimpangan) |

## Konteks

`IMG-10` meminta image multi-arsitektur. Sebagaimana tertulis di `build.yml` sebelum
keputusan ini: **amd64 WAJIB** (host produksi), **arm64 SEBAIKNYA** (mesin dev Apple
Silicon). CI membangun keduanya di runner GitHub `ubuntu-latest` yang ber-arsitektur x86,
sehingga arm64 dibangun lewat **emulasi QEMU**.

Build image `web` di bawah emulasi itu terbukti macet, bukan sekadar lambat:

| Run | amd64 | arm64 — langkah `pnpm install --frozen-lockfile` |
|---|---|---|
| `997aab8` | selesai dalam hitungan menit | **358,8 menit tanpa satu baris log**, dibatalkan timeout 6 jam |
| `f3fa10f` | selesai dalam hitungan menit | **30,8 menit tanpa log**, dibatalkan manual |

Build `web` yang normal selesai 8–11,5 menit. Karena seluruh matrix menunggu, satu platform
yang macet menahan digest yang dibutuhkan Dokploy untuk men-deploy.

Pada 14 September 2026 pemilik mengonfirmasi server produksi `srv1882569.hstgr.cloud`
ber-arsitektur **x86_64** (`uname -m`). Sebelumnya arsitektur server tidak tercatat di
dokumen mana pun — `SERVER-PROVISIONING.md` hanya menyebut jumlah vCPU.

## Alternatif yang Dipertimbangkan

**Tetap multi-arch, arm64 dibangun di runner ARM native (`ubuntu-24.04-arm`).** Ditolak
*untuk sekarang*: menghilangkan QEMU, tetapi menggandakan menit CI dan menambah langkah
penggabungan manifest demi image yang tidak dipakai host mana pun. Ini jalur yang benar
**bila** suatu hari ada host produksi ARM.

**Tetap QEMU, naikkan timeout atau tambah retry.** Ditolak: masalahnya macet tanpa log,
bukan lambat. Timeout lebih panjang hanya membuat kegagalan datang lebih lambat, dan retry
mengulang langkah yang sama di bawah emulasi yang sama.

**Tetap QEMU, perbaiki cache GHA agar `pnpm install` jarang berjalan.** Ditolak: cache
hilang setiap lockfile berubah — justru saat rilis paling perlu cepat — sehingga macet akan
kembali tepat di momen terburuk.

## Keputusan

**CI membangun image hanya untuk `linux/amd64`.** `docker/setup-qemu-action` dihapus dari
`build.yml` karena tanpa target arm64 ia hanya memperlambat job dan menyiratkan emulasi yang
tidak lagi dipakai.

Butir WAJIB dari `IMG-10` (amd64 untuk host produksi) **tetap dipenuhi**. Yang dihentikan
hanya bagian SEBAIKNYA (arm64). Dicatat sebagai ADR mengikuti prinsip P7 yang sama dengan
ADR-0008: penyimpangan ditulis terbuka, bukan disembunyikan di balik konfigurasi yang
terlihat patuh.

`TARGETOS/TARGETARCH` di Dockerfile `pos-engine` **tetap dipakai**, tidak di-hardcode
`amd64`, supaya build manual dengan `--platform` selalu jujur tentang hasilnya.

## Konsekuensi

**Positif:**
- Build `web` kembali ke ±8–11 menit; sumber macet 6 jam hilang.
- Digest untuk Dokploy tidak lagi tertahan oleh platform yang tidak dipakai.
- Arsitektur server kini tercatat di `SERVER-PROVISIONING.md` §1.

**Negatif / biaya yang kami terima:**
- `docker pull` image dari `ghcr.io` di Mac Apple Silicon berjalan lewat emulasi Rosetta/QEMU
  lokal — lambat. Pengembangan harian tidak terdampak karena berjalan di dev container yang
  dibangun lokal, bukan dari image registry.
- **Build manual di Mac wajib `--platform linux/amd64`.** Tanpanya image arm64 lolos uji lokal
  lalu gagal di server dengan `exec format error`. Panduannya di
  [DOCKER.md](../../50-operations/DOCKER.md) §5.

**Yang akan kami tinjau ulang bila:**
- Ada host produksi atau staging ber-arsitektur ARM — bangun arm64 di runner ARM native,
  **jangan** kembali ke QEMU.
- Runner `ubuntu-latest` GitHub berganti arsitektur default.
