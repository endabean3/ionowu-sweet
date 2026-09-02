# Deployment & Rilis

> **Status:** 🟡 Draft · **Prioritas:** 🟠 P1
> **Dokumen Terkait:** [DOKPLOY.md](./DOKPLOY.md), [MIGRATIONS.md](../30-data/MIGRATIONS.md)

---

## 1. Kendala yang Membedakan Sistem Ini

Deploy pada POS bukan seperti deploy aplikasi web biasa:

* **Toko sedang buka.** Setiap detik gangguan berarti antrean pelanggan mengular.
* **Perangkat kasir memegang salinan data lokal.** Versi lama masih beredar berhari-hari.
* **Offline-first menyerap sebagian besar gangguan** — tetapi hanya bila perangkat sudah
  terlanjur offline. Perangkat yang online saat deploy akan merasakannya.

---

## 2. Lingkungan

| Lingkungan | Tujuan | Data |
|---|---|---|
| **development** | Lokal | Data palsu |
| **staging** | Uji sebelum rilis | Salinan produksi yang dianonimkan |
| **production** | Toko sungguhan | Nyata |

Keputusan terbuka: staging berbagi VPS dengan produksi (murah, berisiko) atau terpisah?
Rekomendasi: **project Dokploy terpisah di VPS yang sama** untuk saat ini, dengan batas
memori ketat agar tidak mengganggu produksi.

---

## 3. Jendela Rilis

```
❌ JANGAN DEPLOY     11.00–13.00 WIB   (makan siang)
❌ JANGAN DEPLOY     17.00–20.00 WIB   (jam sibuk sore)
❌ JANGAN DEPLOY     Jumat sore        (tak ada yang berjaga)
✅ AMAN              02.00–06.00 WIB
✅ DAPAT DITERIMA    14.00–16.00 WIB   (dengan pemantauan)
```

Aturan ini akan makin ketat seiring bertambahnya tenant lintas zona waktu
([MULTI-OUTLET.md](../00-product/MULTI-OUTLET.md) §5).

---

## 4. Urutan Rilis

```
1. CI hijau: uji lulus, budget performa terpenuhi
2. Backup database + verifikasi
3. Migrasi (expand) — terpisah dari deploy kode
4. Deploy kode via Dokploy
5. Health check lulus → Traefik alihkan trafik
6. Pantau 30 menit
7. Rilis berikutnya: contract
```

Rincian aturan skema ada di [MIGRATIONS.md](../30-data/MIGRATIONS.md) §4 dan §7.

---

## 5. Rollback

| Situasi | Tindakan |
|---|---|
| Migrasi gagal (langkah 3) | Berhenti. Kode lama + skema lama masih berjalan. **Tidak ada dampak.** |
| Kode gagal health check | Dokploy pertahankan kontainer lama |
| Bug ditemukan setelah rilis | Deploy ulang commit sebelumnya |
| Migrasi merusak data | 🔴 Restore dari backup — **prosedur harus sudah pernah diuji** |

> **Rollback kode tidak pernah membalik migrasi.** Karena migrasi dibuat kompatibel mundur
> (expand–contract), kode lama tetap berjalan di atas skema baru. Inilah alasan aturan
> "hanya maju" di [MIGRATIONS.md](../30-data/MIGRATIONS.md) §3.

**Yang belum diverifikasi:** perilaku rollback otomatis Dokploy saat health check gagal.
Harus diuji di staging sebelum mengandalkannya.

---

## 6. Pembaruan Sisi Klien (PWA)

Sering terlupakan, padahal inilah yang dilihat kasir.

* Service Worker mengunduh versi baru di latar belakang.
* **Jangan pernah memaksa reload saat ada transaksi berjalan.** Tampilkan notifikasi halus;
  terapkan saat keranjang kosong atau saat pergantian shift.
* Perangkat yang offline berhari-hari akan melompati beberapa versi — jalur upgrade Dexie
  harus berurutan ([MIGRATIONS.md](../30-data/MIGRATIONS.md) §6).
* API `/v1/` harus tetap melayani klien lama. Perubahan yang merusak berarti `/v2/`.

---

## 7. Daftar Periksa Pra-Rilis

- [ ] CI hijau; uji offline lulus
- [ ] Migrasi diuji di staging dengan salinan data produksi
- [ ] Backup terverifikasi
- [ ] Di luar jendela terlarang §3
- [ ] Ada orang yang berjaga 30 menit setelah rilis
- [ ] Pemicu rollback disepakati sebelum mulai
- [ ] Variabel environment baru sudah ditambahkan ([CONFIGURATION.md](./CONFIGURATION.md))
