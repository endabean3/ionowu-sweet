# Skalabilitas & Keandalan

> **Status:** 🟡 Draft
> **Urutan baca:** dokumen **ke-6**

---

## 1. Estimasi Beban

Angka-angka ini adalah **model kasar untuk menguji apakah arsitektur masuk akal**, bukan
ramalan bisnis. Asumsi dasar: 1 outlet ≈ 200 transaksi/hari, terpusat pada jam sibuk.

| Skala | Outlet | Transaksi/hari | Puncak (tx/detik) | Penilaian |
|---|---:|---:|---:|---|
| Pilot | 1 | 200 | ~0.02 | Sepele |
| Fase 1 | 10 | 2.000 | ~0.2 | Sepele |
| Target 12 bulan | 100 | 20.000 | ~2 | Nyaman di satu VPS |
| Regangan | 1.000 | 200.000 | ~20 | Butuh peninjauan ulang |

**Kesimpulan yang penting:** pada target 12 bulan (100 outlet), beban tulis sekitar
**2 transaksi per detik**. Postgres di VPS sederhana menangani ini tanpa kesulitan.

> Target `<5ms` di [PRD](../00-product/PRD-01-POS-INTI.md) §4 **bukan** tuntutan throughput,
> melainkan tuntutan **latensi per permintaan**. Keduanya sering tertukar. Sistem ini tidak
> akan pernah kekurangan kapasitas pada skala yang direncanakan — yang harus dijaga adalah
> agar setiap permintaan tunggal tetap cepat.

### Beban baca vs tulis

Beban baca jauh lebih besar dari tulis: setiap perangkat kasir menarik katalog saat startup
dan menyinkronkannya berkala. **Namun karena PWA bersifat offline-first, sebagian besar baca
tidak pernah mencapai server sama sekali** — katalog sudah ada di IndexedDB.

Ini efek samping yang jarang disadari: offline-first, yang dibangun demi ketahanan, juga
menjadi strategi penskalaan paling efektif dalam sistem ini.

---

## 2. Jalur Penskalaan

```
SEKARANG          Satu VPS, semua layanan          → cukup s/d ~100 outlet
    │
    ▼
LANGKAH 1         Naikkan ukuran VPS (vertikal)    → cukup s/d ~500 outlet
    │             Termurah, paling sedikit risiko
    ▼
LANGKAH 2         Pisahkan Postgres ke host sendiri
    │             Dilakukan saat DB dan aplikasi berebut memori
    ▼
LANGKAH 3         Beberapa instans pos-engine di belakang Traefik
    │             ⚠️ Memaksa keputusan mutex di REDIS-STRATEGY.md §5
    ▼
LANGKAH 4         Replika baca untuk pelaporan
                  Dilakukan saat kueri dasbor mengganggu checkout
```

**Skala vertikal lebih dulu, dan cukup lama.** Skala horizontal memperkenalkan kompleksitas
terdistribusi yang tidak sepadan pada skala ini.

> **Langkah 3 adalah tembok tersembunyi.** Mutex stok dalam proses Go pecah total begitu
> instans kedua dijalankan — dan kegagalannya berupa **stok minus yang senyap**, bukan error.
> Karena itu rekomendasi memakai kunci baris Postgres perlu diputuskan **sekarang**, bukan
> saat langkah 3 tiba.

---

## 3. Mode Kegagalan

Kolom terpenting adalah yang terakhir: apakah toko tetap bisa berjualan.

| Yang mati | Dampak | Kasir tetap jualan? |
|---|---|---|
| **Internet toko** | Sinkronisasi berhenti | ✅ **Ya** — inti produk |
| **VPS mati total** | Semua perangkat masuk mode offline | ✅ **Ya** — sampai IndexedDB penuh |
| **pos-engine** | Sync & webhook berhenti | ✅ Ya — offline |
| **web-app** | Dasbor & admin hilang | ✅ Ya |
| **intelligence-worker** | Tidak ada prediksi baru | ✅ Ya — tak terasa |
| **Redis** | Rate limit & cache hilang | ✅ Ya — **bila** perbaikan di [REDIS-STRATEGY.md](./REDIS-STRATEGY.md) diterapkan |
| **PostgreSQL** | Tidak ada tulis di server | ✅ Ya — offline; sync menunggu |
| **Gateway QRIS** | QRIS gagal | ⚠️ Ya — **tunai saja** |
| **Traefik** | Semua HTTP mati | ✅ Ya — offline |
| **Printer thermal** | Struk tidak tercetak | ⚠️ Ya — struk WhatsApp |
| **IndexedDB penuh** | 🔴 Transaksi baru gagal | ❌ **TIDAK** |

**Hanya satu baris yang menghentikan penjualan.** Arsitektur offline-first menyerap hampir
setiap kegagalan — dan justru karena itu, satu-satunya kegagalan yang tersisa menjadi jauh
lebih penting daripada yang terlihat.

### Kegagalan yang harus paling dikhawatirkan

`IndexedDB penuh` adalah satu-satunya jalur menuju "toko tidak bisa berjualan".
[PRD](../00-product/PRD-01-POS-INTI.md) §4 menargetkan 10.000 transaksi offline, tetapi
belum ada yang menjawab:

- Apa yang terjadi pada transaksi ke-10.001?
- Apakah kasir diperingatkan **sebelum** batas tercapai?
- Apakah browser bisa mengusir data IndexedDB tanpa pemberitahuan? *(Bisa — kecuali
  penyimpanan persisten diminta secara eksplisit.)*

> Poin terakhir adalah risiko yang paling mudah terlewat: browser **dapat menghapus
> IndexedDB** saat perangkat kehabisan ruang, kecuali aplikasi meminta izin penyimpanan
> persisten. Tanpa itu, seluruh janji offline berdiri di atas penyimpanan yang boleh
> dibuang sistem operasi kapan saja. Ini harus diselesaikan di `30-data/OFFLINE-SYNC-SPEC.md` (**P0**).

---

## 4. Degradasi Bertahap

Urutan yang dikorbankan saat sistem tertekan:

```
Sehat          → semua fitur
    ↓ tertekan
Turun tingkat 1 → hentikan worker Python
    ↓
Turun tingkat 2 → hentikan kueri dasbor berat
    ↓
Turun tingkat 3 → sajikan katalog dari cache, tolak tulis non-transaksi
    ↓
Minimum        → HANYA checkout + sync
```

Aturannya: **checkout adalah yang terakhir dikorbankan, selalu.**

---

## 5. Titik Kegagalan Tunggal

| SPOF | Risiko | Mitigasi saat ini |
|---|---|---|
| Satu VPS | Semua tenant terdampak | ⚠️ Diterima; offline-first menyerap dampaknya |
| Satu instans Postgres | Kehilangan data bila korup | ⚠️ Backup — **restore belum pernah diuji** |
| Satu instans Redis | Sudah dianalisis | ✅ Aman setelah perbaikan §2 REDIS-STRATEGY |
| Satu gateway QRIS | Kehilangan pembayaran non-tunai | ❌ Tidak ada mitigasi |
| Konfigurasi Dokploy | Tidak bisa deploy / bangun ulang | ❌ Belum dicadangkan |

**Satu VPS untuk seluruh tenant adalah keputusan yang wajar di tahap ini** — dan hanya wajar
karena offline-first membuat toko tetap berjualan saat VPS mati. Itulah yang mengubah
"seluruh sistem down" dari bencana menjadi gangguan sinkronisasi.

Namun kewajaran itu punya batas waktu: makin lama VPS mati, makin dekat IndexedDB ke penuh.
**RTO harus ditetapkan secara eksplisit** di `50-operations/BACKUP-DR.md` (**P1**).

---

## 6. Yang Harus Diukur

Target di PRD §4 tidak berarti apa-apa tanpa pengukuran di produksi:

| Metrik | Ambang | Kenapa |
|---|---|---|
| Latensi checkout p99 | <5ms | Janji inti |
| Kedalaman antrean sync per perangkat | <100 | Peringatan dini sebelum IndexedDB penuh |
| **Pemakaian IndexedDB per perangkat** | <70% | **Satu-satunya jalur ke "tidak bisa jualan"** |
| Kelambatan konsumen event | <60 detik | Kesehatan worker |
| Pemakaian pool koneksi DB | <80% | Worker bisa menguras pool |
| Umur transaksi belum tersinkron | <24 jam | Perangkat yang terlupakan |

Alat ukurnya belum ada — lihat [50-operations/OBSERVABILITY.md](../50-operations/OBSERVABILITY.md).
