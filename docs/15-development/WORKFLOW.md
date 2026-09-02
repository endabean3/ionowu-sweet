# Alur Kerja Pengembangan

> **Status:** 🟡 Draft · **Urutan baca:** dokumen **ke-3**

---

## 1. Branching

Model sederhana, cocok untuk tim kecil:

```
main            selalu dapat dirilis · dilindungi · setiap commit menghasilkan image
 └─ feat/...    branch pendek (< 3 hari)
 └─ fix/...
 └─ chore/...
```

**`main` selalu dapat dirilis.** Bukan berarti selalu dirilis — fitur yang belum siap
disembunyikan di balik flag, bukan ditahan di branch panjang. Branch yang hidup berminggu-minggu
menghasilkan konflik merge besar, dan pada kode yang menyentuh uang, konflik besar berbahaya.

---

## 2. Commit

[Conventional Commits](https://www.conventionalcommits.org/) — dipakai untuk menghasilkan
CHANGELOG dan menandai perubahan yang merusak.

```
feat(pos): tambah pembayaran gabungan tunai + QRIS
fix(sync): cegah duplikasi saat batch diulang
chore(ci): naikkan versi Playwright
docs(data): tambahkan tabel event_outbox
```

Cakupan yang dipakai: `pos` · `web` · `sync` · `data` · `ci` · `docs` · `ops`

---

## 3. Pull Request

Setiap perubahan lewat PR. Tanpa push langsung ke `main`.

### Yang wajib lulus otomatis

| Gerbang | Sumber |
|---|---|
| Lint (golangci-lint + Biome) | |
| Uji unit & integrasi | [TESTING-STRATEGY](../60-quality/TESTING-STRATEGY.md) |
| **Paritas rumus uang Go ↔ TS** | idem §3A |
| **Isolasi tenant seluruh endpoint** | idem §3B |
| Uji kontrak vs `openapi.yaml` | idem |
| Budget performa & ukuran bundle | [PERFORMANCE-BUDGET](../60-quality/PERFORMANCE-BUDGET.md) |
| Tidak ada rahasia di log uji | [OBSERVABILITY](../50-operations/OBSERVABILITY.md) §4 |

### Yang butuh peninjau kedua

| Perubahan | Kenapa |
|---|---|
| **Migrasi skema** | Tidak bisa dibalik di produksi ([MIGRATIONS](../30-data/MIGRATIONS.md) §3) |
| **Rumus uang** | Salah hitung tidak dapat dipulihkan dengan patch |
| **Middleware tenant / auth** | Jalur kebocoran antar-tenant |
| **Antrean sinkronisasi** | Bug di sini menghilangkan penjualan |
| Menghapus kolom/tabel | Bertahap, minimal satu rilis jeda |

Sisanya cukup satu peninjau.

---

## 4. Definition of Done

Sebuah tugas selesai bila **seluruh** poin terpenuhi — bukan sebagian:

- [ ] Kode + uji, gerbang CI hijau
- [ ] **Jalur offline diuji** bila fitur menyentuh transaksi
- [ ] **Diuji dengan dua tenant** bila fitur menyentuh data tenant
- [ ] Migrasi kompatibel mundur, sudah dijalankan di lokal
- [ ] Kode error baru terdaftar di [ERROR-CATALOG](../20-api/ERROR-CATALOG.md) beserta kelasnya
- [ ] Event baru terdaftar di [ANALYTICS-EVENTS](../00-product/ANALYTICS-EVENTS.md)
- [ ] Variabel environment baru masuk [CONFIGURATION](../50-operations/CONFIGURATION.md) **dan** panel Dokploy
- [ ] Dokumen terkait diperbarui
- [ ] Diverifikasi di staging

> **Tiga poin yang paling sering dilewati** adalah kode error, event, dan variabel environment.
> Ketiganya terlihat sepele saat menulis fitur, tetapi masing-masing punya konsekuensi:
> kode error yang tidak terdaftar membuat klien offline tidak tahu harus mengulang atau
> menyerah; event yang hilang tidak bisa diisi mundur; variabel yang lupa dimasukkan ke
> Dokploy membuat deploy produksi gagal start.

---

## 5. Feature Flag

Fitur besar dirilis di balik flag agar `main` tetap dapat dirilis.

| Aturan | |
|---|---|
| Flag punya pemilik & tanggal kedaluwarsa | Flag yang menumpuk menjadi utang teknis |
| Default **mati** di produksi | |
| **Jangan pakai flag di jalur checkout** | Percabangan di jalur uang menggandakan kemungkinan kondisi yang harus diuji |

---

## 6. Menangani Perubahan yang Merusak Kontrak

Perangkat kasir menyimpan versi PWA lama dan bisa offline berhari-hari. Karena itu:

```
❌ Mengubah arti field di /v1/
❌ Menghapus field yang masih dipakai klien lama
❌ Menambah field wajib pada request

✅ Menambah field opsional
✅ Menambah endpoint baru
✅ /v2/ untuk perubahan yang merusak, /v1/ tetap dilayani
```

Aturan yang sama berlaku untuk skema Dexie di sisi klien
([MIGRATIONS](../30-data/MIGRATIONS.md) §6): migrasi klien **wajib mempertahankan transaksi
yang belum tersinkron.**

---

## 7. Ritme

| Kegiatan | Frekuensi |
|---|---|
| Merge ke `main` | Harian |
| Deploy staging | Otomatis setiap merge |
| Deploy produksi | Mingguan, di luar jam sibuk ([DEPLOYMENT](../50-operations/DEPLOYMENT.md) §3) |
| Uji restore backup | **Bulanan** ([BACKUP-DR](../50-operations/BACKUP-DR.md) §4) |
| Tinjau ADR & DOCS-MAP | Tiap akhir fase |
