# ADR-0004: Build di CI + Registry Image, Bukan Build di VPS Produksi

| Metadata | Nilai |
|---|---|
| **Status** | **Diterima** (21 Agustus 2026) |
| **Tanggal** | 2026-08-21 |
| **Meninjau ulang** | [ADR-0003](./0003-dokploy-self-hosted-paas.md) — konsekuensi negatif #2 |
| **Dokumen Acuan** | [TECH-STACK.md](../TECH-STACK.md) §6 |

## Konteks

[ADR-0003](./0003-dokploy-self-hosted-paas.md) menerima "build berjalan di server produksi"
sebagai biaya, dengan catatan akan ditinjau ulang **bila build mulai menyebabkan gangguan
produksi**.

Sejak itu dua hal menjadi jelas:

1. VPS sudah ditetapkan: **Hostinger, satu instans, melayani seluruh tenant.** Tidak ada
   node lain yang menyerap beban build.
2. Rollback saat ini berarti **membangun ulang dari commit lama** — yang tidak dijamin
   menghasilkan image identik (dependensi transitif dapat bergeser). Artinya prosedur
   rollback di [DEPLOYMENT](../../50-operations/DEPLOYMENT.md) §5 belum benar-benar dapat diandalkan.

Menunggu gangguan benar-benar terjadi berarti menunggu kasir gagal bertransaksi saat jam sibuk.

## Alternatif yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Alasan |
|---|---|---|---|
| Tetap build di VPS | Tanpa perubahan, tanpa layanan baru | Build Next.js dapat meng-OOM VPS saat kasir bertransaksi; image menumpuk memakan disk; rollback tidak deterministik | Ditolak |
| **Build di GitHub Actions → ghcr.io** | VPS hanya menarik image jadi; rollback = tarik tag lama; uji & budget performa jadi gerbang nyata | Butuh akun GitHub; VPS harus autentikasi ke registry | **Dipilih** |
| Build di VPS terpisah | Tidak bergantung pihak ketiga | Biaya VPS kedua tanpa manfaat lain | Ditolak |

## Keputusan

Build dan uji dijalankan di **GitHub Actions**; image didorong ke **GitHub Container
Registry (`ghcr.io`)**; **Dokploy hanya menarik image**, tidak lagi membangun.

```
git push → Actions: uji + budget performa + build image
        → push ghcr.io/<org>/<svc>:<sha>
        → Dokploy tarik & jalankan
```

Image ditandai dengan **SHA commit**, bukan `latest`, agar setiap rilis dapat dirujuk kembali.

## Konsekuensi

**Positif:**
- Beban build lepas sepenuhnya dari VPS produksi
- **Rollback menjadi deterministik** — tarik tag SHA lama, bukan build ulang
- Gerbang CI di [TESTING-STRATEGY](../../60-quality/TESTING-STRATEGY.md) §6 dan
  [PERFORMANCE-BUDGET](../../60-quality/PERFORMANCE-BUDGET.md) §7 menjadi nyata,
  bukan teoretis — sebelumnya tidak ada platform yang menjalankannya
- Disk VPS tidak lagi menumpuk image build

**Negatif / biaya yang kami terima:**
- Ketergantungan pada GitHub; bila Actions bermasalah, rilis tertunda (kasir tidak terpengaruh)
- Batas menit gratis GitHub Actions perlu dipantau
- VPS perlu kredensial registry — satu rahasia lagi di [CONFIGURATION](../../50-operations/CONFIGURATION.md)
- Deploy sedikit lebih lambat karena menunggu CI

**Yang akan kami tinjau ulang bila:**
- Menit CI menjadi mahal → pertimbangkan runner sendiri
- Kebijakan mengharuskan seluruh rantai build di infrastruktur sendiri → registry privat di VPS
