# Aksesibilitas

> **Status:** 🟡 Draft · **Prioritas:** 🟡 P2

---

## 1. Kenapa Ini Bukan Sekadar Kepatuhan

[PRD](../00-product/PRD-01-POS-INTI.md) §4 menargetkan kontras **WCAG AAA (≥7:1)**, dan
alasannya bersifat operasional, bukan formalitas: **Sari menatap layar ini 8 jam sehari,
sering di bawah cahaya terang.** Kelelahan mata menimbulkan kesalahan input, dan kesalahan
input berujung pada selisih kas.

Aksesibilitas di sini adalah pencegahan fraud sekaligus retensi karyawan.

---

## 2. Target

| Aspek | Target | Cara verifikasi |
|---|---|---|
| Kontras teks | ≥ 7:1 (AAA) | Otomatis di CI |
| Kontras teks besar | ≥ 4,5:1 | Otomatis |
| Target sentuh | ≥ 48×48 px | Audit komponen |
| Navigasi keyboard | 100% jalur kasir | E2E |
| Fokus terlihat | Selalu | Audit visual |
| Screen reader | Jalur kasir dapat dioperasikan | Uji manual |

`#FAF6F0` di atas `#2D231E` memberi rasio sekitar 13:1 — melampaui AAA dengan nyaman.
Yang perlu diperiksa adalah **aksen pastel**: warna matcha/custard/strawberry berisiko
gagal kontras bila dipakai untuk teks, bukan sekadar latar.

---

## 3. Aturan Khusus Produk Ini

### Warna tidak boleh jadi satu-satunya penanda

Alert stok memakai matcha/custard/strawberry (FR-14). Sekitar 8% pria mengalami buta warna
merah-hijau — dan **matcha vs strawberry adalah persis pasangan yang paling sulit dibedakan**.

Setiap indikator status wajib menyertakan penanda kedua: ikon, teks, atau angka.

### Audio haptik butuh alternatif

Fondasi UI mengandalkan umpan balik audio. Ini harus punya padanan visual, karena:
* Kasir tuli atau dengan gangguan pendengaran
* Lingkungan bising (kafe saat ramai)
* Perangkat dalam mode senyap

**Konfirmasi transaksi tidak boleh hanya berupa suara.**

### Keyboard-first butuh padanan sentuh

FR-21 mengandalkan pintasan keyboard. Tingkat keluar-masuk kasir tinggi
([PERSONAS-JTBD](../00-product/PERSONAS-JTBD.md) §2), jadi setiap pintasan **wajib** punya
tombol yang terlihat dan bisa disentuh. Pintasan adalah percepatan untuk yang mahir,
bukan satu-satunya jalan.

### Gerakan

Mochi Spring adalah identitas produk, tetapi hormati `prefers-reduced-motion` — animasi
membal dapat memicu ketidaknyamanan pada sebagian orang.

---

## 4. Penegakan

```
CI: axe-core pada rute kasir → gagal bila ada pelanggaran serius
CI: pemeriksaan kontras token → gagal bila <7:1
E2E: seluruh alur checkout hanya dengan keyboard
Manual: uji screen reader per kuartal
```

- [ ] Audit palet aksen terhadap ambang kontras
- [ ] Uji dengan kasir sungguhan, termasuk yang berkacamata
- [ ] Uji di bawah sinar matahari langsung — kondisi kerja yang nyata
