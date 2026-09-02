# 70-design-system — Bahasa Visual & Interaksi

Fondasi tampilan produk. Keputusannya dicatat di
[ADR-0002](../10-architecture/adr/0002-sweet-creamy-spatial-luxe-design-language.md).

| # | Dokumen | Isi | Status |
|:-:|---|---|:---:|
| 1 | [MASTER.md](./MASTER.md) | Indeks & aturan emas desain | ✅ |
| 2 | [fondasi-UI-v0.1.md](./fondasi-UI-v0.1.md) | Token, Mochi Spring, audio, komponen | ✅ |
| 3 | [pages/kasir.md](./pages/kasir.md) | Spesifikasi kecepatan halaman POS | ✅ |

---

## Kaitan dengan Folder Lain

| Kebutuhan | Ke |
|---|---|
| Aset SVG & maskot | [80-assets/](../80-assets/) |
| Prototipe interaktif | [90-prototypes/](../90-prototypes/) |
| Ambang kontras & a11y | [60-quality/ACCESSIBILITY.md](../60-quality/ACCESSIBILITY.md) |
| Budget bundle & INP | [60-quality/PERFORMANCE-BUDGET.md](../60-quality/PERFORMANCE-BUDGET.md) |

## Batasan yang Berlaku

1. **Zero pure black.** Tidak ada `#000000`.
2. **Kontras ≥7:1** — bukan formalitas; kelelahan mata menimbulkan kesalahan input
   ([ACCESSIBILITY](../60-quality/ACCESSIBILITY.md) §1).
3. **Warna bukan satu-satunya penanda.** Alert stok matcha/strawberry adalah pasangan
   tersulit bagi penglihatan buta warna merah-hijau.
4. **Audio wajib punya padanan visual.** Kafe ramai, perangkat bisa senyap.
5. **Setiap pintasan keyboard punya tombol yang bisa disentuh.**

## Yang Masih Kurang

* Spesifikasi halaman selain kasir (dasbor pemilik, katalog, shift, opname)
* Pustaka komponen sebagai kode, bukan hanya deskripsi
* Panduan status kosong, memuat, dan error
* Spesifikasi tampilan mode offline — bagaimana kasir tahu ia sedang offline **tanpa merasa
  ada yang rusak**
