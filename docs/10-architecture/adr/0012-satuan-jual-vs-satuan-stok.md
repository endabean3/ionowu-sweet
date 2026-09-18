# ADR-0012: Satuan jual berbeda dari satuan stok (jual per ml, stok dalam gram)

| Metadata | Nilai |
|---|---|
| **Status** | **Diterima** (18 September 2026) |
| **Tanggal** | 2026-09-18 |
| **Pengambil Keputusan** | Pemilik produk (kebutuhan Warung Wangi Dongko) |
| **Dokumen Acuan** | [MARKET-SEGMENTS](../../00-product/MARKET-SEGMENTS.md) §4 · migrasi `00003_catalog` (`uom_conversions`) · [OFFLINE-SYNC-SPEC](../../30-data/OFFLINE-SYNC-SPEC.md) §3A |

## Konteks

Warung Wangi menjual bibit parfum **per ml** kepada pembeli, tetapi mengelola stok bibitnya
**dalam gram**. Bibit dibeli dan ditimbang per kemasan (100 gr, 250 gr, 500 gr), dan opname
dilakukan dengan menimbang. Pemilik meminta:

- nota pembeli hanya menyebut **ml** ("30 ml x Rp 1.000");
- setiap penjualan tetap mengurangi stok dalam **gram**, sebagai laporan stok keluar.

Sebelum keputusan ini, satu varian hanya punya satu satuan (`variants.uom`). Stok bibit terpaksa
dicatat dalam ml, padahal tidak ada yang mengukurnya dalam ml.

Temuan yang ikut menentukan pilihan:

- Tabel `uom_conversions` (migrasi 00003, dirancang untuk "1 karung = 25.000 g") sudah ada,
  lengkap dengan indeks unik `(tenant_id, variant_id, from_uom, to_uom)`, tetapi belum dipakai
  kode mana pun.
- Jalur BOM (`item_type = 'composite'`) hanya ditangani `POST /sales`. **`/sync/push` tidak
  memotong komponen BOM**, padahal aplikasi kasir mengirim seluruh penjualannya lewat sync.

## Alternatif yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| **A. Konversi satuan per varian** (`uom_conversions` dari satuan jual ke satuan stok) | Satu barang = satu kartu di kasir; tabel sudah ada; tidak ada migrasi | `stock_quantity` kini bisa berarti satuan stok, bukan satuan jual | — **dipilih** |
| B. BOM: barang jual "Parfum X (ml)" `composite` dengan komponen "Bibit X (g)" | Model yang sama kelak dipakai untuk botol + alkohol | Katalog berlipat (setiap aroma dua kali; bibit stok ikut muncul di kasir); `/sync/push` belum mendukung BOM; butuh UI resep | Terlalu berat untuk satu konversi satuan, dan jalur sync harus dibangun ulang lebih dulu |
| C. Stok tetap dalam ml, gram hanya di laporan | Tanpa perubahan kode | Opname menimbang gram lalu harus dikonversi tangan; angka stok tak pernah cocok dengan timbangan | Tidak memenuhi permintaan |
| D. Kolom baru `variants.stock_uom` + `stock_factor` | Eksplisit, satu baris | Migrasi skema, dan tetap perlu mekanisme konversi | Tabel `uom_conversions` sudah memodelkan hal yang sama |

## Keputusan

Kami memilih **A**. Aturannya:

1. **Konversi stok sebuah varian adalah baris `uom_conversions` yang `from_uom`-nya sama dengan
   `variants.uom`** (satuan jual). `to_uom` adalah satuan stok, dan `factor` adalah jumlah
   satuan stok per 1 satuan jual (mis. 1 g per ml).
2. Bila konversi itu ada, **`variants.stock_quantity` dihitung dalam `to_uom`**. Tanpa konversi,
   perilaku lama tidak berubah.
3. Penjualan X satuan jual mengurangi stok X × factor (dibulatkan 3 desimal, presisi kolom
   stok). `stock_events.uom` mencatat satuan stok. Fungsi murninya adalah `stockDeduction`
   (`internal/httpapi/stock_unit.go`), dipakai `/sync/push` dan `POST /sales`.
4. `sales_items` tetap mencatat jumlah dan satuan **jual**. Karena itu nota, omzet, dan harga
   tidak berubah sama sekali.
5. `/sync/pull` mengirim `stock_uom` dan `stock_factor`, sehingga kasir menampilkan stok dalam
   satuan stok ("Aman · 320 g"). `GET /stock/levels` mengembalikan satuan stok di kolom `uom`.
6. Impor CSV menerima dua kolom opsional baru, **`StockUom`** dan **`StockFactor`** (bawaan 1).
   Bila keduanya ada, `StockQuantity` dibaca dalam satuan stok.

Faktor awal Warung Wangi adalah **1 g per ml**, sebuah perkiraan yang disetujui pemilik. Berat
jenis minyak parfum tidak persis 1, jadi faktor per bibit bisa dikoreksi setelah ditakar.

## Konsekuensi

**Positif:**
- Opname bibit cukup menimbang, dan angkanya langsung dibandingkan dengan stok.
- Laporan stok keluar (ledger `stock_events`) dalam gram, sesuai cara toko mengelola bibit.
- Tidak ada migrasi skema; barang tanpa konversi tidak terpengaruh.

**Negatif / biaya yang kami terima:**
- Arti `stock_quantity` kini bergantung pada ada-tidaknya konversi. Setiap kode baru yang membaca
  stok **wajib** memakai `stock_uom` / `COALESCE(sc.to_uom, v.uom)`, bukan `variants.uom`.
- `min_stock_alert` untuk barang berkonversi juga dalam satuan stok (gram).
- Mengubah faktor tidak mengubah stok yang sudah tercatat, hanya penjualan berikutnya.
- Belum ada UI untuk mengubah faktor per bibit; saat ini hanya lewat impor.

**Yang akan kami tinjau ulang bila:**
- Warung Wangi membutuhkan resep botol + alkohol + bibit (BOM). Saat itu `/sync/push` harus
  mendukung `composite` lebih dulu (lihat Konteks), dan konversi ini tetap berlaku untuk
  komponen bibit.
- Ada varian yang butuh lebih dari satu konversi dari satuan jualnya. Aturan 1 memilih yang
  tertua; itu harus dibuat eksplisit.
