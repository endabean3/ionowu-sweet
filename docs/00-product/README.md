# 00-product — Kenapa Produk Ini Ada

Folder ini menjawab **kenapa dibangun** dan **untuk siapa**. Seluruh keputusan teknis di
`10-architecture/` sampai `60-quality/` seharusnya bisa ditelusuri balik ke sini.

---

## 1. Urutan Baca

Dokumen disusun sebagai satu rangkaian argumen. Membacanya berurutan akan masuk akal;
melompat ke tengah tidak.

| # | Dokumen | Menjawab | Status |
|:-:|---|---|:---:|
| 1 | [VISION-SCOPE.md](./VISION-SCOPE.md) | Masalah apa, untuk siapa, dan apa yang **tidak** kami bangun | 🟡 Draft |
| 2 | [PERSONAS-JTBD.md](./PERSONAS-JTBD.md) | Siapa penggunanya dan pekerjaan apa yang mereka selesaikan | 🟡 Draft |
| 3 | [PRD-01-POS-INTI.md](./PRD-01-POS-INTI.md) | Apa yang dibangun (FR & NFR) | ✅ Baseline |
| 4 | [ROADMAP.md](./ROADMAP.md) | Dengan urutan apa, dan kapan sebuah fase dinyatakan lulus | 🟡 Draft |
| 5 | [SUCCESS-METRICS.md](./SUCCESS-METRICS.md) | Bagaimana kami tahu ini berhasil | 🟡 Draft |
| 6 | [ANALYTICS-EVENTS.md](./ANALYTICS-EVENTS.md) | Data apa yang direkam agar metrik itu bisa dihitung | 🟡 Draft |
| 7 | [ONBOARDING-ACTIVATION.md](./ONBOARDING-ACTIVATION.md) | Bagaimana tenant sampai ke nilai pertamanya | 🟡 Draft |
| 8 | [PRICING-PACKAGING.md](./PRICING-PACKAGING.md) | Bagaimana produk ini menghasilkan uang | 🔴 Usulan |
| 9 | [MULTI-OUTLET.md](./MULTI-OUTLET.md) | Bagaimana FR-04 benar-benar bekerja | 🟡 Draft |
| 10 | [COMPETITIVE-LANDSCAPE.md](./COMPETITIVE-LANDSCAPE.md) | Terhadap siapa kami bersaing | 🔴 Kerangka kosong |
| 11 | [ERP-MODULE-MAP.md](./ERP-MODULE-MAP.md) | Modul apa yang ditambah, dengan urutan apa | 🟡 Draft |
| 12 | [MARKET-SEGMENTS.md](./MARKET-SEGMENTS.md) | Jenis usaha & arketipe operasional | 🟡 Draft |
| 13 | [SOP-MODULE.md](./SOP-MODULE.md) | SOP per kategori — pembeda utama produk | 🟡 Draft |

```
VISION ──► PERSONAS ──► PRD ──► ROADMAP ──► METRICS ──► EVENTS
   │                              │            │
   │                              ▼            ▼
   └──► NON-GOALS            ONBOARDING    guardrail ──► 60-quality/
                                  │
                             PRICING ──► MULTI-OUTLET ──► 30-data/
                                  ▲
                          COMPETITIVE (memblokir harga)
```

---

## 2. Prioritas Pengerjaan

Prioritas dinilai dari satu pertanyaan: **apa yang rusak bila dokumen ini salah atau tidak ada?**

### 🔴 P0 — Memblokir Fase 0, keputusannya sulit dibalik

| Tindakan | Ada di | Kenapa mendesak |
|---|---|---|
| **Stok & kuantitas jadi `DECIMAL`, tambah UOM & konversi** | [MARKET-SEGMENTS](./MARKET-SEGMENTS.md) §4 | **Kedua pelanggan fix (Warung Wangi, Media Boga) tidak bisa dilayani** skema `INT` saat ini. Jauh lebih murah diubah sekarang selagi tabel kosong. |


| Tindakan | Ada di | Kenapa tidak bisa ditunda |
|---|---|---|
| **Validasi persona lewat 10 wawancara** | [PERSONAS-JTBD.md](./PERSONAS-JTBD.md) §1 | Semua persona masih hipotesis. Bila salah, seluruh Fase 0 salah sasaran. |
| **Kunci batas RBAC Manager** | [PERSONAS-JTBD.md](./PERSONAS-JTBD.md) §3 | PRD FR-03 dan SECURITY §3 saling bertentangan soal akses omzet |
| **Putuskan `user_outlet_assignments`** | [MULTI-OUTLET.md](./MULTI-OUTLET.md) §3 | Celah keamanan: kasir kini bisa mengakses semua cabang |
| **Putuskan model harga dasar+override** | [MULTI-OUTLET.md](./MULTI-OUTLET.md) §2 | Mengubahnya nanti = migrasi seluruh data harga |
| **Putuskan `outlets.timezone` & jam tutup buku** | [MULTI-OUTLET.md](./MULTI-OUTLET.md) §5 | Memengaruhi setiap kueri laporan yang akan ditulis |
| **Putuskan penanda data sandbox** | [ONBOARDING-ACTIVATION.md](./ONBOARDING-ACTIVATION.md) §6 | Menambahkannya nanti = tulis ulang semua kueri laporan |
| **Perbaiki penomoran FR yang bolong** | [ROADMAP.md](./ROADMAP.md) §5 | FR-15/29/34/45/55 disebut di judul tapi tidak ada isinya |

### 🟠 P1 — Memblokir Fase 1 (siap dijual)

| Tindakan | Ada di |
|---|---|
| Riset kompetitif, terutama **uji offline langsung** | [COMPETITIVE-LANDSCAPE.md](./COMPETITIVE-LANDSCAPE.md) §4 |
| Finalisasi paket & harga (butuh riset di atas) | [PRICING-PACKAGING.md](./PRICING-PACKAGING.md) §6 |
| Definisikan arti `plan_tier` di skema DB | [PRICING-PACKAGING.md](./PRICING-PACKAGING.md) §1 |
| Pasang pelacakan event aktivasi | [ANALYTICS-EVENTS.md](./ANALYTICS-EVENTS.md) §4A |
| Sepakati definisi metrik | [SUCCESS-METRICS.md](./SUCCESS-METRICS.md) §5 |
| Bangun jalur aktivasi bertahap | [ONBOARDING-ACTIVATION.md](./ONBOARDING-ACTIVATION.md) §3 |

### 🟡 P2 — Fase 2 dan seterusnya

Transfer stok antar-outlet, UI laporan konsolidasi, prediksi restock, dan seluruh Fase 3.

---

## 3. Temuan yang Memerlukan Keputusan Anda

Enam hal yang saya temukan saat menulis folder ini, dan **tidak bisa saya putuskan sendiri**:

1. **`plan_tier` sudah ada di skema produksi tanpa definisi produk apa pun.** Kolom
   `free`/`premium` di [FDR.md](../10-architecture/FDR.md) §2 akan menggerbangi fitur di
   seluruh basis kode. Usulan lengkap ada di [PRICING-PACKAGING.md](./PRICING-PACKAGING.md).
2. **Kasir bisa mengakses seluruh cabang.** Tabel `users` tidak punya kaitan ke outlet,
   bertentangan dengan matriks RBAC di [SECURITY.md](../40-security/SECURITY.md) §3.
3. **PRD dan SECURITY bertentangan** soal apa yang boleh dilihat Manager.
4. **Lima nomor FR fiktif** (15, 29, 34, 45, 55) muncul di judul rentang tanpa isi.
5. **Tiga kebutuhan kasir sehari-hari tidak tercakup FR mana pun:** pesanan tertahan,
   cetak ulang struk, dan penyesuaian harga manual.
6. **Seluruh persona belum divalidasi.** Ini bukan cacat dokumen, melainkan pekerjaan
   riset yang belum dilakukan — dan risikonya paling besar dari semuanya.

---

## 4. Aturan Folder Ini

* Dokumen di sini **tidak boleh** memuat detail implementasi. Skema database ada di
  `30-data/`, kontrak API di `20-api/`.
* Setiap fitur baru harus bisa ditelusuri ke sebuah persona dan sebuah metrik. Bila tidak
  bisa, kemungkinan besar ia termasuk Non-Goals.
* Memindahkan sesuatu keluar dari Non-Goals membutuhkan ADR di `10-architecture/adr/`.
