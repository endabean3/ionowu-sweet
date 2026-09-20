# Changelog Dokumentasi

Perubahan struktural pada dokumentasi. Bukan changelog produk.

---

## [1.27.0] — 2026-09-20

### Ditambahkan
* **Riwayat transaksi** (`/riwayat`) — prioritas tinggi #1–#3 daftar pemilik:
  * daftar nota 30 hari terakhir dengan pencarian nomor nota, penanda **Void** dan **Refund**;
  * detail nota: barang, pembayaran, riwayat refund;
  * **cetak ulang nota** (printer Bluetooth maupun browser), memakai profil toko dari cache;
  * **refund** penuh/sebagian dengan alasan, dan pilihan barang kembali ke rak (hanya refund
    penuh — refund sebagian tidak tahu barang mana yang kembali);
  * **void** transaksi salah input, mengembalikan stok dan mencatatnya di ledger.
* **`GET /sales`**, **`GET /sales/{id}`**, dan **`POST /sales/{id}/void`** di pos-engine.
  Void hanya untuk transaksi lunas, belum direfund, dan **shift-nya masih terbuka** — Z-Report
  yang sudah dicetak tidak pernah berubah (CLAUDE.md §6 #5). Setelahnya: refund.
* **Laporan stok** (`/laporan-stok`, `GET /stock/events`): pergerakan stok dari ledger — terjual,
  masuk, rusak, koreksi opname, void — dalam **satuan stok** (gram untuk bibit), ringkasan per
  jenis, rentang hari ini / 7 / 30 hari, dan **unduh CSV**.
* Migrasi **`00015_void_stock_event`**: `stock_events.event_type` menerima `void`, supaya
  pembatalan tidak tercampur dengan refund di laporan (CHECK dilebarkan, `NOT VALID` + `VALIDATE`).

### Diubah
* Pemeriksaan PIN manager dipindah ke `verifikasiPinManager` dan dipakai bersama refund dan void.
  Aturan yang sama ditulis dua kali adalah cara termudah membuat salah satunya lebih longgar.
* Pengembalian stok saat void memakai konversi satuan yang sama dengan penjualan
  (`GetVariantConversion`, tanpa filter `is_active`): barang yang sudah dinonaktifkan tetap
  kembali dalam satuan yang benar.

### Diuji
* Go: rentang tanggal riwayat (hari terakhir inklusif, format salah ditolak) dan batas jumlah baris.
* Playwright: `riwayat.spec.ts` (void mengembalikan stok, refund penuh, nota yang sudah direfund
  tidak bisa di-void) dan `laporan-stok.spec.ts` (tanda + / −, satuan, catatan mutasi).

## [1.26.0] — 2026-09-20

### Ditambahkan
* **Layar Stok** (`/stok`, tertaut dari Dasbor & Katalog) — prioritas #4 daftar kerja pemilik:
  * sisa stok tiap barang dalam **satuan stok** (gram untuk bibit, ADR-0012), yang habis dan
    menipis diurutkan paling atas, plus pencarian;
  * **Stok masuk** (barang datang), **Rusak/hilang**, dan **Opname** (hasil timbang) dalam satu
    dialog, dengan pratinjau "Stok menjadi …" dan selisih opname sebelum disimpan;
  * owner, manager, gudang saja (RBAC-MODEL §Stok). Butuh online: stok adalah angka bersama
    semua perangkat kasir, jadi tidak diantrekan seperti penjualan.

### Diperbaiki (mutasi stok sebelumnya tidak benar-benar bekerja)
* `POST /stock/events` memakai **`outlet_id` hardcode `"outlet_kemang"`** (sisa data contoh),
  **tidak pernah memperbarui `variants.stock_quantity`**, dan menulis `balance_after` = delta —
  ledger berisi saldo palsu sementara stok di kasir tidak bergerak.
* `POST /stock/opname` menyimpan berkas opname tetapi **tidak mengubah stok sama sekali**, dan
  meng-hardcode satuan `"pcs"` di ledger (koreksi bibit tercatat pcs, bukan gram). Jumlah menurut
  sistem juga diambil dari kiriman klien; kini dibaca di dalam transaksi sambil mengunci baris.
* Kedua endpoint **tidak memeriksa peran**; kini owner/manager/gudang, dan outlet diverifikasi
  milik tenant. Jumlah divalidasi (≥ 0, maks. 3 desimal, muat DECIMAL(14,3)); `event_type` dibatasi
  `restock`/`waste`; barang ganda dalam satu opname ditolak.
* Saldo dan ledger kini ditulis dalam satu transaksi, dan `stock_events.uom` memakai satuan stok.

### Diuji
* Go: RBAC stok, validasi jumlah, arah tanda restock/waste, dan validasi opname (ULID, ganda).
* Playwright `e2e/stok.spec.ts` (desktop + ponsel): masuk 250 → rusak 10 → opname 238,5, tiap
  langkah diperiksa lewat `GET /stock/levels`; angka tidak sah ditolak sebelum dikirim.

## [1.25.0] — 2026-09-19

### Ditambahkan
* **QR di nota: cek garansi & daftar member** (ADR-0013, pilihan pemilik Warung Wangi).
  * Nota mencetak QR ke `<Alamat web nota>/<tenant>/<nota>`; alamatnya diisi di **Pengaturan →
    Alamat web nota (QR)**, dan kosong berarti tanpa QR.
  * Printer termal: raster `GS v 0` (4 titik/modul ≈ 24 mm), jadi tidak bergantung pada perintah QR
    bawaan printer. Nota browser: SVG dari matriks yang sama.
  * **Terbukti terbaca**: `zbarimg` membaca tautan persis dari raster printer.
* **Endpoint publik tanpa login** (pertama di pos-engine):
  * `GET /public/v1/nota/{tenant}/{nota}` → ringkasan nota dan status garansi, tanpa
    PII/kasir/HPP/id tenant;
  * `POST …/member` → daftar member, **satu per nota**, hanya untuk nota lunas tanpa member
    ≤ 30 hari.
  * Rate limit per tenant/nota. Kode error baru: `NOTA_NOT_FOUND`, `NOTA_SIGNUP_CLOSED`,
    `MEMBER_ALREADY_EXISTS`.
* Migrasi **`00014_nota_web`**: `outlets.nota_web_url`, `customers.signup_sale_id` + indeks unik
  parsial (expand murni).
* Halaman nota ada di situs toko (`warungwangi.ionowu.com/nota/...`, repo `endabean3/warungwangi`).
  Data dibaca dari server situs itu, dan halamannya dikunci ke tenant toko itu sendiri.

### Diperbaiki
* **Nomor di nota ≠ id penjualan di server.** Kasir memanggil `ulid()` dua kali per penjualan (id
  antrean untuk nota, `payload.id` untuk server), sehingga nomor di tangan pembeli tidak pernah bisa
  dicari untuk klaim garansi atau refund. Kini satu id dipakai untuk antrean, payload, dan nota.

### Diuji
* Go:
  * batas tanggal garansi di zona waktu outlet (23:59 vs 00:00 WIB);
  * syarat daftar (void/refund/member/dipakai/> 30 hari);
  * validasi nomor, kode member = klien, pola ULID, URL nota (https saja, tanpa `?#`/kredensial).
* Vitest 92/92: raster = SVG = matriks yang sama, blok QR di nota, pratinjau melompati data raster.
* Playwright `e2e/nota-publik.spec.ts` (desktop + ponsel), alur penuh jual → QR → sinkron:
  * nota publik tanpa PII;
  * nomor nota = id server;
  * daftar member 201, daftar kedua 409;
  * tenant lain 404.
## [1.24.0] — 2026-09-19

### Ditambahkan
* **Ubah & nonaktifkan barang dari Katalog** (prioritas #3: harga kosong, nama terpotong, ejaan
  "Spichy"). Tombol **Ubah** di tiap barang (owner/manager) membuka dialog berisi:
  * nama barang;
  * harga jual per satuan jual (owner saja);
  * batas stok menipis dalam satuan **stok** (gram untuk bibit, ADR-0012);
  * barcode ("" = kosongkan);
  * **Dijual di kasir**.
  "Hapus" sengaja berupa **nonaktifkan**: riwayat penjualan dan ledger stok tetap merujuk barangnya.
  Barang nonaktif hilang dari kasir, berlabel "Nonaktif" di katalog, diurutkan paling bawah, dan
  bisa dinyalakan lagi. Perubahan langsung dicerminkan ke Dexie perangkat ini. Butuh online.
* `/sync/pull`: `is_active` varian = **varian AND produk**, jadi menonaktifkan produk menyembunyikan
  semua variannya di kasir. Kasir kini memfilter varian nonaktif (sebelumnya semua tetap tampil).

### Diperbaiki (keamanan & validasi)
* **Katalog tidak memeriksa peran sama sekali.** Kasir bisa mengubah harga lewat `PATCH
  /variants/{id}`, serta membuat atau mengimpor produk. Kini:
  * `POST /products` dan `PATCH` produk/varian: **owner & manager**;
  * `price`/`cost_price` dan **impor CSV** (menetapkan harga massal): **owner saja**, sesuai
    RBAC-MODEL.
* **Harga tidak sah diabaikan diam-diam.** `"25.000.00"` dijawab 200 OK tanpa mengubah apa pun. Kini
  422 `VALIDATION_ERROR` untuk angka tidak sah, negatif, desimal berlebih, atau melebihi
  DECIMAL(14,x).
* PATCH produk/varian untuk id salah atau milik tenant lain kini 404
  `PRODUCT_NOT_FOUND`/`VARIANT_NOT_FOUND`, bukan 200. Barcode ganda dijawab 409
  `BARCODE_ALREADY_EXISTS`. Barcode/SKU bisa dikosongkan (NULL), karena "" akan bentrok di indeks
  unik parsial.
* `PATCH /variants` kini juga menerima `cost_price` dan `min_stock_alert`.

### Diuji
* Go: `TestPatchVariantNormalize` (12 kasus), `TestPatchProductNormalize`, `TestBolehUbahKatalog`.
* Playwright `e2e/katalog-ubah.spec.ts` (desktop + ponsel): ubah nama dan harga → tersimpan di server
  (`/sync/pull`) dan tampil di kasir; nonaktifkan → hilang dari kasir; harga kosong ditolak.

## [1.23.0] — 2026-09-19

### Diubah
* **Tata letak portrait ponsel 360 px** (keluhan pemilik di Redmi 9C, 360×800 CSS px). Di layar lebar
  (≥ sm/lg) tampilan tidak berubah.
  * **Header satu baris** (~56 px, sebelumnya tiga baris ±200 px): nama toko terpotong satu baris.
    Status online + sinkron + antrean digabung jadi satu tombol: warna = koneksi, gelembung angka =
    transaksi belum terkirim, dan **"Offline" tetap berupa teks**. Tombol tema pindah ke
    **Pengaturan → Tampilan**.
  * **Produk jadi daftar satu kolom**: nama bibit utuh dalam 2 baris, harga di kanan. Sebelumnya
    kartu dua kolom memotong "Bibit Parfum Baccarat Rouge…".
  * **Kolom cari/scan menempel** di atas saat daftar digulir.
  * **Keranjang jadi panel bawah**, dibuka dengan mengetuk ringkasan di bar bawah atau mengusapnya ke
    atas, dan ditutup dengan menarik pegangannya ke bawah. Total dan "Bayar Sekarang" menempel di
    dasar panel. Sebelumnya keranjang ada di bawah seluruh katalog.
  * **Semua dialog di ponsel** (`Modal`) punya pegangan tarik-untuk-menutup (hanya dari
    pegangan/judul, jadi isi tetap bisa digulir) dan slot `footer` yang menempel di dasar.
  * **Keypad jumlah**: "Masukkan ke Keranjang" menempel di dasar panel. Di layar sentuh, papan ketik
    **tidak** muncul otomatis selama ada pintasan botol racikan, karena papan ketik menutupi tombol
    "Botol 30 ml". `viewport.interactiveWidget = resizes-content` dan Android
    `windowSoftInputMode=adjustResize` membuat panel naik di atas papan ketik.
  * **Pengaturan**: judul dan tombol kembali lengket, Garansi dan Racikan berdampingan, tombol
    Simpan menempel di bawah selama ada perubahan, serta kartu **Tampilan** (terang/gelap) baru.

### Diuji
* Playwright **22/22** (desktop + Mobile Chrome), termasuk `e2e/layout-ponsel.spec.ts` baru:
  header < 80 px, tanpa geser samping, bayar lewat panel bawah. Selektor tombol bayar di uji lama
  kini memilih tombol yang **terlihat** (`klikBayar`), karena di ponsel keranjang samping
  disembunyikan. Vitest 86/86.

## [1.22.0] — 2026-09-19

### Ditambahkan
* **Racikan parfum 65% bibit : 35% pelarut** (permintaan pemilik Warung Wangi). **Pengaturan →
  Racikan: % bibit**; pelarut = sisanya; 0 = mati.
  * **Nota** yang memuat bibit per ml mencetak tabel takaran untuk botol **10, 15, 20, 30, 50, 100 ml**
    (mis. 30 ml = 19,5 + 10,5 ml), di printer termal maupun browser. Bibit dibulatkan 1 desimal
    (Decimal, half-up), pelarut = botol − bibit, jadi selalu pas satu botol.
  * **Keypad kasir** untuk bibit: pintasan "Botol 30 ml → 19,5 ml" mengisi jumlah bibit untuk
    ukuran botol yang diminta pembeli.
  * Migrasi **`00013_outlet_recipe`**: `outlets.bibit_percent` (0–100, expand murni).
* **Barcode member di SEMUA nota**, termasuk cetak browser/PWA. Encoder CODE128 B ditulis sendiri
  (tanpa pustaka tambahan), dengan zona tenang 10 modul. **Terbukti terbaca pemindai sungguhan**:
  `zbarimg` membaca `M-ZX38FR` dari gambar barcode maupun dari nota cetak utuh.

### Diperbaiki
* **`<Button>` mengabaikan prop `type`.** Setiap tombol di dalam `<form>` menjadi tombol submit.
  Akibatnya pintasan jumlah di keypad kasir langsung memasukkan barang ke keranjang tanpa
  konfirmasi, dan tombol tambah varian di **Tambah Produk** ikut mengirim form. Semua tombol submit
  memang sudah menulis `type="submit"` eksplisit, jadi perbaikannya tidak mengubah form lain.

### Terverifikasi
* Go (validasi 0–100), vitest **86/86** (takaran 6 ukuran, jumlah pas, tabel muat 58/80 mm,
  CODE128 107 pola × 11 modul, checksum), Playwright **18/18**.
* Nyata di 360px: Pengaturan (racikan 65, TikTok `warungwangidongko`) → member baru → bibit via
  "Botol 30 ml" (19,5 ml, Rp 39.000) → nota berisi racikan, member, bonus, barcode, garansi.

---
## [1.21.0] — 2026-09-19

Permintaan pemilik Warung Wangi: member ber-barcode yang didaftarkan lewat form, dengan bonus
**tester di setiap pembelian** dan **merchandise di pembelian pertama**.

### Ditambahkan
* **Daftar member di kasir** (tombol 👤 Member): nomor WA wajib, nama dan akun media sosial
  opsional, dan centang wajib **"Sudah follow TikTok @akun-toko"**. Akun toko diatur di
  **Pengaturan → Akun TikTok toko**. WA dibakukan ke `62…` (0812…, +62 812…, 812… = orang yang
  sama) dengan aturan identik di klien dan server; WA ganda ditolak dan kasir ditawari member
  yang sudah ada.
* **Kode member `M-XXXXXX`** dibuat di perangkat dari ULID-nya, sehingga **bisa didaftarkan
  offline**; keunikannya dijaga indeks unik per tenant.
* **Scan kode member** (nota/kartu) ke kolom cari langsung menempelkan member. Enter dari
  scanner ditahan sesaat agar tidak membuka pembayaran.
* **Nota:** "Member M-XXXXXX", "Bonus: 1 tester", "Bonus: merchandise perdana" (hanya pembelian
  pertama), dan **barcode CODE128** digambar printer termal (ESC/POS `GS k`). Kasir mendapat
  pengingat bonus 12 detik setelah bayar.
* Server: `customers` di `/sync/push` (diproses paling awal), `customer_id` pada penjualan sync,
  daftar member di `/sync/pull` (tanpa email/tanggal lahir). Migrasi **`00012_customer_member`**
  (expand murni).

### Diperbaiki
* **Penjualan tidak terkirim otomatis selama toko online.** Antrean hanya dikirim saat aplikasi
  dibuka, saat kembali online, atau saat "Sinkron" ditekan. Kini item baru dikirim tiap 20 detik
  selama online; item yang ditolak server tidak diulang otomatis.
* `useMemo` pratinjau Pengaturan kekurangan dependensi garansi (Biome).

### Keamanan
* **Isolasi tenant:** foreign key hanya menjamin pelanggan ADA. Penjualan yang merujuk member
  tenant lain **diterima tanpa member**, dan member itu tidak pernah ikut terkirim. Diuji langsung.
* Nomor WA tidak pernah masuk log atau pesan galat (invarian #6); diperiksa di log server uji.

### Terverifikasi
* Go: `normalizeWA` (paritas dengan TS), validasi member (5 penolakan), `go test`/lint/`sqlc vet`.
* Uji langsung server: daftar + jual pertama (merchandise tercatat), jual kedua (tanggal tetap),
  WA ganda ditolak, kiriman ulang = duplicate, belum follow ditolak, tenant lain → tanpa member.
* Web: vitest 72/72 (paritas WA, kode member, blok member + barcode di nota). Playwright
  **18/18**, termasuk `e2e/member.spec.ts` baru. Nyata di 360px: member, penjualan, dan bonus
  sampai ke server **lewat kirim otomatis** tanpa menekan Sinkron.

---
## [1.20.0] — 2026-09-19

### Ditambahkan
* **Garansi di nota.** Setiap nota mencetak **"Garansi 7 hari s/d <tanggal beli + 7>"** (tebal,
  di atas teks penutup), di kertas termal maupun cetak browser. Lamanya diatur di **Pengaturan →
  Garansi (hari)**; 0 = tanpa garansi, jadi perilaku tenant lain tidak berubah. Tanggal dihitung
  di perangkat dari waktu transaksi, sehingga tetap tercetak saat offline.
* Migrasi **`00011_outlet_warranty`**: `outlets.warranty_days SMALLINT NOT NULL DEFAULT 0`
  (0–365). Expand murni. **Wajib dijalankan sebelum `api` baru.**
* `PATCH /outlets/{id}` menerima `warranty_days` (422 bila di luar 0–365).

### Terverifikasi
* Go (validasi 0–365), vitest 57/57 (garansi 7 hari → +7 hari; 0/kosong → tidak dicetak).
* Nyata di 360px: Pengaturan → Garansi 7 → Simpan → pratinjau dan nota transaksi memuat
  "Garansi 7 hari s/d 25/09/2026".

---
## [1.19.0] — 2026-09-18

### Ditambahkan
* **Bibit dijual per ml, stoknya dalam gram** ([ADR-0012](./10-architecture/adr/0012-satuan-jual-vs-satuan-stok.md)).
  Permintaan pemilik Warung Wangi: nota hanya menyebut ml, dan setiap penjualan tetap tercatat
  sebagai gram keluar. Memakai tabel `uom_conversions` yang sudah ada sejak 00003 tetapi belum
  pernah dipakai; **tanpa migrasi**.
  * Penjualan X ml mengurangi stok X × faktor gram di `/sync/push` **dan** `POST /sales`. Ledger
    `stock_events` mencatat gram; `sales_items` tetap ml sehingga nota dan omzet tidak berubah.
  * `/sync/pull` mengirim `stock_uom`/`stock_factor`; kartu kasir dan katalog menampilkan
    "Aman · 320 g". `GET /stock/levels` memakai satuan stok.
  * Impor CSV: kolom opsional **`StockUom`**, **`StockFactor`** (bawaan 1).

### Terverifikasi
* Uji Go `stockDeduction` (6 kasus, termasuk faktor 0,92 dan pembulatan 3 desimal) dan parser
  impor (7 kasus). Ujung ke ujung di database lokal dengan katalog Warung Wangi: impor 161 barang,
  90 konversi `ml→g` tersimpan; jual 30 ml "Macbrame Scandal Vica" lewat `/sync/push` → stok
  350 g → **320 g**, ledger **−30 g**, item penjualan **30 ml**.

### Diketahui, belum diperbaiki
* `/sync/push` memperlakukan barang `composite` (BOM) seperti barang biasa — komponen resepnya
  tidak dipotong. Hanya `POST /sales` yang menjalankan BOM, padahal kasir menjual lewat sync.
  Belum berdampak karena belum ada barang `composite`.

---

## [1.18.0] — 2026-09-18

Fokus Warung Wangi Dongko. Diverifikasi di 360px dengan katalog nyata (162 produk) di
database lokal.

### Ditambahkan
* **Halaman Pengaturan** (`/pengaturan`, dari tombol ⚙️ di header kasir dan dari dasbor):
  * **Profil toko & struk:** nama, alamat, telepon/WA, dan teks penutup struk (maks. 200 huruf).
    Tersimpan di server (`PATCH /outlets/{id}`) dan di-cache ke IndexedDB, sehingga struk yang
    dicetak **offline** tetap lengkap. Saat offline, form tampil hanya-baca dengan alasannya.
  * **Pratinjau struk** disusun dari byte ESC/POS yang sama persis dengan yang dikirim ke
    printer, termasuk lipatan baris 58/80 mm.
  * **Printer** (APK) dan **Akun** (nama, peran, Keluar).
* Migrasi **`00010_outlet_receipt_footer`**: `outlets.receipt_footer VARCHAR(200)`. Expand murni,
  aman dijalankan sebelum kode baru. **Wajib dijalankan di produksi sebelum `api` baru dideploy.**

### Diubah
* **PPN 11% dihapus dari kasir.** Warung Wangi bukan PKP; sebelumnya setiap transaksi ditagih
  11% di atas label harga. Rincian Subtotal/Pajak di keranjang dan struk hanya muncul bila ada
  pajak.
* Struk: alamat dan "Telp/WA" di bawah nama toko; penutup dari Pengaturan (bawaan "Terima
  kasih"); kata "pcs" tidak dicetak ("1 x Rp 4.000"), satuan curah tetap ("30 ml x …").

### Diperbaiki
* **Kasir bisa mengubah nama dan alamat toko, dan menambah outlet.** `PATCH`/`POST /outlets`
  tidak memeriksa peran. Kini: owner semua outlet, manager hanya outlet yang ditugaskan dan
  tidak bisa menonaktifkan outlet, peran lain 403. Baris baru di RBAC-MODEL.
* **`PATCH /outlets` menjawab 200 untuk id yang salah atau milik tenant lain**, dan menerima
  nama kosong. Kini 404 `OUTLET_NOT_FOUND` dan 422 `VALIDATION_ERROR`.
* **Nama "Tutup ①…⑨" tercetak "Tutup ?"** di printer termal. `toPrinterText` kini memakai NFKD
  (① → 1) dan memetakan tanda pisah, kutip, dan ½ ke ASCII.
* `VALIDATION_ERROR` sudah dipakai di 25 tempat tetapi tak pernah tercatat di ERROR-CATALOG.
  Kini tercatat, bersama `OUTLET_NOT_FOUND`.

### Terverifikasi
* Go: uji + lint + `sqlc vet`. Uji langsung `PATCH /outlets` dengan token owner/manager/kasir:
  200 / 200 / 403, manager menonaktifkan 403, tenant lain 404, nama kosong 422, kasir `POST` 403.
* Web: vitest 55/55 (termasuk profil struk, `printedText`, NFKD); Playwright 14/14.
* Alur nyata di 360px: isi Pengaturan → simpan → pratinjau → jual "Botol Slim" → struk memuat
  alamat, telepon, dan penutup; total Rp 4.000 tanpa PPN.

---

## [1.17.2] — 2026-09-18

### Diperbaiki
* **Ikon dan layar pembuka APK masih bawaan Capacitor** (tanda "X" biru). Kini ikon launcher
  memakai tanda merek (`public/icons/icon-mark.png`) di atas merah muda `#FB89BA`, sama dengan
  ikon PWA. Ikon adaptif (Android 8+) diberi tanda setinggi 42% kanvas supaya muat di zona
  aman masker bulat maupun squircle. Ikon lama (persegi dan bulat) disediakan untuk Android 7.
  Layar pembuka (11 ukuran, portrait dan landscape) memakai tanda di atas krem `--bg-base`.
  Tanda hanya diperkecil, tidak pernah diperbesar, agar tetap tajam.

---

## [1.17.1] — 2026-09-18

Ditemukan dari screenshot APK di **Redmi 9C** sungguhan (720×1600) dan dibuktikan lewat
computed style di WebView (remote debugging), bukan dari tebakan.

### Diperbaiki
* **Teks yang diketik tak terlihat di SEMUA kolom isian** (Email, Password, dan setiap `Input`/
  `Select`). Warnanya `rgb(250 246 240)`, yaitu krem latar, di atas putih. Penyebabnya token
  warna `base` di Tailwind: sebagai entri `colors` ia ikut membuat utilitas `text-base`, yang
  bentrok dengan ukuran huruf bawaan `text-base` (16px). Setiap `text-base` jadi sekaligus
  mewarnai teks krem. Kini `base` hanya `backgroundColor`, dan `bg-base` tetap berfungsi.
  Terukur ulang: teks di Login, Buka Shift, Cari produk, dan Bayar kini `rgb(45 35 30)`.
* **Kolom isian tanpa tepi yang terlihat.** Tepinya putih 40% di atas kartu putih, sehingga
  kolom Password tampak bukan kolom. Kini tepinya tinta 25%, dan fokusnya tinta penuh dengan
  cincin mint. Sebelumnya fokus berwarna mint di atas putih, kontras ±1,3:1.
* **Kolom rupiah di modal Bayar dan Buka Shift** kini satu kolom dengan "Rp" di dalamnya,
  lewat komponen bersama `MoneyInput`. Sebelumnya berupa dua kotak terpisah yang tepinya tak
  menyatu, dengan panah naik/turun yang tak berguna di layar sentuh, dan kolom yang mepet ke
  tepi layar 360px.
* Label abu yang sulit dibaca di bawah cahaya terang ("Uang Diterima", "QRIS", "Kartu",
  label modal awal berhuruf kapital yang patah jadi "LACI)") kini berwarna tinta.

### Terverifikasi
* vitest 44/44, tsc, dan biome bersih; Playwright 14/14.

---

## [1.17.0] — 2026-09-18

Layar kasir diperiksa pada lebar 360 px (Redmi 9A) lewat transaksi sungguhan di Playwright,
bukan dari membaca kode.

### Diperbaiki — cetak struk
* **Struk tidak bisa dicetak lagi setelah toast hilang.** Satu-satunya tombol "Cetak Struk" ada
  di dalam toast yang hilang sendiri beberapa detik setelah bayar. Kini ada bar **Struk
  terakhir** yang tetap ada sampai transaksi berikutnya.
* **Struk tercetak dua kali.** Koneksi Bluetooth butuh 2–5 detik tanpa tanda apa pun, jadi kasir
  mengetuk lagi. Kini ada status "Mencetak…" dan penjaga ketukan ganda. Uji E2E-nya terbukti
  menjaga: tanpa penjaga, cetakan tercatat 3 kali.
* **Kegagalan cetak hilang sendiri.** Toast gagal kini bertahan dengan **Coba lagi** dan
  **Ganti printer**. Struk yang gagal langsung tercetak di printer yang baru dipilih.
* **Printer hanya bisa diatur lewat struk yang gagal.** Header APK kini punya tombol printer.
  Pengaturannya memuat lebar kertas (langsung berlaku), cetak otomatis (bawaan mati), dan
  **Cetak uji** dengan penggaris angka untuk membuktikan lebar kertasnya benar.
* Plugin native mengirim byte per 512 byte, bukan sekaligus: buffer printer murah bisa
  kehilangan ekor struk panjang, yaitu bagian total dan kembalian.

### Diperbaiki — tampilan ponsel
* Header melebihi lebar layar 360 px (tombol tema terpotong, halaman bisa digeser ke samping).
* Nama produk dipotong jadi satu baris: "Bibit Parfum Vanilla" dan "Bibit Parfum Ocean"
  sama-sama tampil "Bibit Parfum…". Kini dua baris.
* Akhiran "- Default" tidak lagi muncul pada produk bervarian tunggal, di kartu, keranjang, dan struk.
* Label diganti ke bahasa Indonesia ("Sinkron", "N belum terkirim"). Petunjuk papan ketik
  ("Enter", "F2") hanya tampil di layar lebar, dan chip kategori yang isinya hanya "Semua" disembunyikan.
* Toast bayar kini menampilkan **kembalian**.

### Diperbaiki — CI
* **Gerbang E2E merah karena rate limit #31.** Setiap uji E2E mendaftar dan login dari satu IP
  runner. Dengan uji printer baru jumlahnya melewati 10/menit, sehingga server menjawab
  `429 RATE_LIMITED`. Kini batasnya diatur lewat `IONOWU_SWEET_AUTH_RATE_PER_MINUTE` (bawaan
  10, CI 1000). Nilai 0, negatif, atau bukan angka ditolak saat start. 3 uji Go.

### Terverifikasi
* vitest 44/44 (termasuk 2 uji baru untuk halaman cetak uji), tsc, dan biome bersih.
* Playwright 14/14 di Chromium dan Mobile Chrome, termasuk `printer-bluetooth.spec.ts` baru yang
  menjalankan jalur APK lewat jembatan native Capacitor palsu.
* **Belum diuji:** printer sungguhan dan kompilasi Java. Kompilasi Java akan diuji gerbang
  `android-build.yml` di CI; printer sungguhan lewat runbook deploy §5 D.

---

## [1.16.1] — 2026-09-18

### Diubah
* **Monorepo kini keputusan final** (dikonfirmasi pemilik). [REPOSITORY](./15-development/REPOSITORY.md)
  §1 tidak lagi berstatus usulan; catatan tentang folder `docs-UMKM Intelligence` yang terpisah
  dihapus karena dokumentasi sudah lama berada di `docs/`. `CLAUDE.md` §4 disamakan.
* `CLAUDE.md` §7 disamakan dengan isi repo dan status produksi.

---

## [1.16.0] — 2026-09-18

Ditemukan saat menjalankan daftar periksa pasca-deploy (runbook `deploy-pertama` §5) terhadap
produksi: TLS, health, dan CORS lolos, tetapi 12 percobaan login salah berturut-turut ke
`api.sweet.ionowu.com` semuanya dijawab `401` — tidak pernah `429`.

### Diperbaiki
* **`pos-engine` tidak punya rate limit sama sekali**, padahal THREAT-MODEL menandai "banjir
  permintaan" ✅ dan NETWORK-HARDENING menulis rate limiting "sudah ditangani di level API".
  Dengan produksi publik, kata sandi owner bisa ditebak tanpa batas.
  * Kini `/auth/login` dan `/auth/register` dibatasi 10/menit per IP (token bucket in-process),
    menjawab `429 RATE_LIMITED` + `Retry-After`. Batas efektif = 10 × jumlah replika.
  * IP diambil dari entri **paling kanan** `X-Forwarded-For`; `/auth/refresh` sengaja tidak
    dibatasi. Alasan keduanya di [API-GUIDELINES](./20-api/API-GUIDELINES.md) §6.
  * Terverifikasi pada API lokal: 10× `401` → `429` dengan `Retry-After: 6`; IP lain tetap
    dilayani; refresh tak terdampak. 4 uji Go + 1 uji web (429 tidak menghapus sesi).
* THREAT-MODEL, NETWORK-HARDENING, dan API-GUIDELINES kini menyebut cakupan sebenarnya:
  endpoint kasir dan reporting **belum** dibatasi.

---

## [1.15.1] — 2026-09-17

### Diperbaiki
* **Runbook deploy akan menolak image web yang sebenarnya benar.** Langkah 1 memeriksa URL API
  di `.next/static` relatif terhadap direktori kerja `/app`, padahal image berlayout monorepo
  dan build-nya ada di `/app/apps/web/.next/static`. `grep` gagal dengan *No such file or
  directory*, tetapi pipeline tetap keluar 0 karena `head` berhasil — hasilnya "nol baris",
  persis gejala yang runbook tafsirkan sebagai *image salah, berhenti*.
  * Kini jalurnya absolut dan diperiksa lebih dulu (`[ -d ]`, exit 2 bila tidak ada), sehingga
    "jalur salah" dan "image salah" tidak lagi bisa tertukar. Keluarannya juga sekaligus
    menghitung kemunculan `localhost:…`, dan ada tabel cara menafsirkan tiap hasil.
  * Diuji pada image rilis nyata (web `a0ac35f5…`): jalur benar → `14
    https://api.sweet.ionowu.com`, exit 0; jalur salah yang disimulasikan → `JALUR SALAH`,
    exit 2.
  * Ditemukan saat menjalankan prasyarat deploy pertama terhadap server sungguhan.
    `GO-LIVE` §2.G tidak diubah: ia memeriksa build **lokal** dari akar repo, dan jalur
    relatifnya memang benar di sana.

---

## [1.15.0] — 2026-09-16

### Ditambahkan
* **Layar Katalog → Impor CSV** (`/katalog/impor`). Sebelumnya `POST /products/import` hanya bisa
  dipanggil lewat terminal dengan token login — tidak praktis bagi pemilik warung, dan token itu
  bukan sesuatu yang layak diserahkan ke orang lain. Layar ini menampilkan hasil apa adanya:
  jumlah yang masuk **dan setiap baris yang dilewati beserta alasannya**. Setelah impor, katalog
  langsung ditarik ke IndexedDB sehingga barangnya muncul di layar kasir, termasuk saat offline.
  * Terverifikasi di browser dengan klik sungguhan: 150 barang Warung Wangi masuk dan tersinkron
    ke perangkat (79 per ml); berkas berisi barcode ganda + harga kosong menampilkan
    "2 baris TIDAK diimpor" dengan nomor baris dan alasannya.

---

## [1.14.0] — 2026-09-16

Ditemukan saat menyiapkan deploy pertama ke VPS sungguhan — setiap nilai di runbook kini
diverifikasi terhadap server, image, atau database nyata.

### Diperbaiki
* **Rollback otomatis `DEP-07` tidak akan pernah terpicu.** `pos-engine` distroless tidak punya
  `HEALTHCHECK`, dan ADR-0008 mengandalkan "probe HTTP di panel Dokploy" — padahal health check
  aplikasi Swarm di Dokploy dijalankan di dalam kontainer, tempat tidak ada shell maupun `curl`.
  Swarm akan menganggap versi dengan `DATABASE_URL` salah sebagai sehat. Kini biner punya
  subperintah `healthcheck` (→ `/health/ready`) dan Dockerfile memakai `HEALTHCHECK CMD
  ["/api", "healthcheck"]`, tanpa menambahkan shell. 4 uji Go; diverifikasi pada image distroless
  nyata: `healthy` → Postgres dimatikan → `unhealthy` (503) → Postgres hidup → pulih.
* **Runbook deploy tidak akan jalan apa adanya.**
  * Jaringan `sweet-internal` bertanda `external: true` tetapi tidak pernah dibuat — kini ada
    langkahnya, dan wajib `overlay` + `attachable` supaya layanan Swarm `api` bisa menjangkau
    PgBouncer (pola yang sama dengan `ionowu-data` yang sudah jalan di server).
  * Migrasi menunjuk host `postgres`; nama kontainernya `sweet-postgres`.
  * Proyek data wajib bersumber **Git**, bukan YAML tempel — ia me-mount `./infra/initdb`.
  * Kata sandi migrasi dibaca dengan `read -s`, tidak tercatat di history shell.
* **Header `docker-compose.data.yml` mengasumsikan VPS khusus aplikasi ini.** Server nyata
  dipakai bersama empat proyek lain; runbook kini memperingatkannya dan meminta snapshot VPS
  sebelum deploy pertama.

### Terverifikasi
* Image `pos-engine` dan `web` publik di ghcr.io; repo publik — Dokploy tidak butuh kredensial.
* Image `web` memuat `https://api.sweet.ionowu.com` (15×), nol `localhost`/domain contoh.
* Pembuat kunci JWT menghasilkan 32/64 byte; pembuat kata sandi hanya alfanumerik (aman di URL).
* Image PgBouncer membawa `psql` (perintah verifikasi runbook valid).
* Memori server: tersedia ±5 GB, batas maksimum ionowu-sweet ±1,7 GB.

---

## [1.13.0] — 2026-09-16

Ditemukan saat menyiapkan impor inventaris nyata Warung Wangi (171 entri, stock opname
11–12 Sep 2026) — importer ini, menurut komentarnya sendiri, "belum pernah benar-benar dicoba".

### Diperbaiki
* **Harga kosong diimpor sebagai Rp 0.** `decimal.NewFromString("")` gagal, errornya diabaikan,
  dan barangnya masuk kasir dengan harga nol — bisa terjual gratis. Inventaris Warung Wangi punya
  8 barang tanpa harga. Kini baris tanpa harga ditolak; `"0"` yang ditulis eksplisit tetap diterima.
* **Satu baris rusak menggagalkan SELURUH impor.** Komentar kode menjanjikan "lewati baris rusak",
  tetapi di Postgres satu statement gagal membatalkan seluruh transaksi (`current transaction is
  aborted`) dan Commit berubah jadi rollback. Kini setiap baris diproses dalam SAVEPOINT sendiri.
  Terbukti: berkas dengan barcode ganda di tengah tetap memasukkan baris sesudahnya.
* **Baris yang dilewati hilang diam-diam.** Respons kini memuat `dilewati: [{baris, alasan}]`.
* **Nilai rusak lain ikut diam-diam jadi nol** — presisi satuan di luar 0–3, stok bukan angka,
  harga modal rusak, jenis barang asing. Semuanya kini ditolak dengan alasan.
* **Kontrak `openapi.yaml` tidak sesuai kenyataan** — menjanjikan `202` asinkron dengan `job_id`,
  padahal implementasinya selalu sinkron `201`. Kontrak disamakan.

### Terverifikasi
* 6 uji Go baru untuk `parseBarisImpor` (fungsi murni, tanpa database).
* Impor nyata 150 barang Warung Wangi ke tenant uji lokal: 150 masuk, 0 dilewati; 80 barang per ml
  (presisi 1), 71 per biji, 1 per pack; stok desimal tersimpan utuh.

---

## [1.12.0] — 2026-09-16

Semua temuan di bawah muncul saat APK dipasang di **Redmi 9A sungguhan** (Android 10, RAM
2,8 GB) dan saat pos-engine **benar-benar dimatikan** — bukan dari membaca kode.

### Diperbaiki
* **Kasir offline terkunci keluar dari aplikasinya sendiri.** `AuthProvider` menghapus refresh
  token pada SETIAP kegagalan refresh, termasuk "server tidak terjangkau". Kasir yang membuka
  aplikasi saat toko offline kehilangan kredensialnya lalu dilempar ke halaman login yang juga
  tidak bisa dihubungi — invarian #2 (CLAUDE.md §6.2) patah. Kini `apiFetch` membedakan
  `AuthDitolakError` (401/403) dari `JaringanError`; hanya yang pertama menghapus sesi. 5 uji.
* **Shift offline dibuat dengan tenant `"tenant_default"`, penjualan offline dengan `tenant_id`
  kosong, dan cache outlet tidak bisa dibaca.** Ketiganya bergantung pada `user.tenant_id`, yang
  bernilai null tepat saat offline — padahal cache outlet ditulis justru untuk keadaan itu.
  Kini identitas terakhir disimpan (`lib/auth/profile.ts`, tanpa token) dan dipakai sebagai
  cadangan. Fallback `"tenant_default"` dihapus: shift yang gagal dibuat lebih baik daripada
  shift bertenant palsu yang ditolak server secara diam-diam. 5 uji.
* **Layar kasir terbuka tanpa login.** Tidak ada penjaga sesi sama sekali. Kini ada
  `SessionGuard`: layar kasir boleh dibuka dengan sesi mati **asal perangkat pernah dipakai
  login** (toleran offline); layar pemilik wajib sesi hidup. 6 uji, termasuk kasus
  "kasir offline dengan sesi mati tetap boleh berjualan".
* **Pesan "Anda belum ditugaskan ke outlet" muncul saat servernya yang mati.** Kegagalan
  jaringan dan outlet kosong berakhir di layar yang sama. Kini dibedakan; kegagalan jaringan
  berbunyi "Tidak bisa menghubungi server" dengan tombol **Coba lagi**.

### Terverifikasi ujung ke ujung (pos-engine dimatikan)
Login → matikan server → muat ulang: tetap di `/kasir`, refresh token tetap ada, cache outlet
terbaca, shift terbuka dengan tenant asli, penjualan 50 ml masuk antrean dengan tenant asli,
tidak ada satu pun data bertenant palsu. Perangkat yang belum pernah login tetap dilempar ke
`/login`.

---

## [1.11.0] — 2026-09-16

### Ditambahkan
* **`runbooks/deploy-pertama.md`** — runbook deploy produksi pertama, dari DNS sampai login dari
  APK. Menutup jarak yang selama ini tersebar di DOKPLOY/DEPLOYMENT/GO-LIVE: dua proyek Dokploy
  (ADR-0009), digest image (bukan tag), urutan migrasi sebelum kode, nilai environment persis,
  dan daftar periksa pasca-deploy yang setiap barisnya punya perintah verifikasi.
  * **Migrasi wajib menyambung langsung ke `postgres:5432`, bukan lewat PgBouncer.** PgBouncer
    berjalan `POOL_MODE: transaction`, sementara goose memegang session advisory lock — lewat
    transaction pooling, lock itu bisa jatuh ke koneksi backend berbeda. Dicatat sebagai
    pengecualian pemeliharaan terhadap DAT-09; aplikasi tetap wajib lewat PgBouncer.
  * **Uji CORS `https://localhost`** dengan `curl -X OPTIONS` — origin WebView APK (ADR-0010).
    Tidak ada browser yang bisa menguji ini, dan kegagalannya membuat APK terlihat seperti
    "server mati" padahal web berfungsi sempurna.
  * Verifikasi URL API **di dalam image web** sebelum rilis, bukan pada konfigurasi build.

### Diketahui, belum selesai
* **Job migrasi pre-deploy di CI (DAT-05) belum ada.** `DOKPLOY.md` §2 menyebut migrasi sudah
  "pindah ke CI", tetapi `.github/workflows/` tidak punya job itu — yang ada hanya migrasi
  terhadap Postgres sementara milik CI. Sampai dibuat, langkah migrasi produksi manual.
* Runbook ini **belum pernah dijalankan sampai selesai**; verifikasi pertamanya adalah deploy
  produksi pertama itu sendiri.

---

## [1.10.0] — 2026-09-16

### Ditambahkan
* **Kasir bisa menjual per ml dan per gram** — kebutuhan inti arketipe B, yaitu KEDUA pelanggan
  yang sudah pasti (CLAUDE.md §2). Sebelumnya `CartLine.quantity` bertipe `number` bulat dan
  satu-satunya cara mengubahnya adalah tombol +/- yang melangkah satu-satu: Warung Wangi tidak
  punya cara memasukkan "30 ml" sama sekali, dan Media Boga tidak bisa menimbang 250 g.
  Database, API, dan `calculateCart` sudah mendukungnya sejak awal — hanya layar kasir yang
  mengabaikan `uom_precision`.
  * `src/lib/catalog/quantity.ts` — logika murni (11 uji): menerima koma maupun titik, menolak
    nol/negatif, dan **menolak** desimal yang melebihi presisi satuan alih-alih membulatkannya
    diam-diam. Membulatkan berarti menagih pembeli untuk jumlah yang tidak ia minta.
  * `qty-keypad.tsx` — dialog jumlah keyboard-first dengan pratinjau harga; muncul HANYA untuk
    varian berpresisi > 0. Barang `pcs` tetap satu ketuk tanpa langkah tambahan.
  * Kuantitas mengalir sebagai **string desimal** dari keranjang → `calculateCart` → payload sync
    (`qty`), tidak pernah lewat float (CLAUDE.md §6.3). Terverifikasi pada transaksi nyata:
    payload berisi `qty: "30"`, struk mencetak `30 ml × Rp 500`.
  * Form Tambah Produk kini punya pilihan **Utuh / Pecahan**; sebelumnya `uom_precision` tidak
    pernah dikirim, sehingga varian "ml" pun tersimpan berpresisi 0 dan fitur ini tidak akan
    pernah terjangkau dari UI.

### Diperbaiki
* **Lapisan tak terlihat menelan seluruh ketukan kasir — regresi dari 1.8.0.** `AnimatePresence`
  yang membungkus SATU anak bersyarat meninggalkan node-nya di DOM setelah keluar: `opacity: 0`
  tetapi `fixed inset-0` dengan pointer-events aktif. Layar tampak normal, tetapi tombol Bayar
  tidak bisa ditekan sama sekali. Terbukti pada modal shift, dialog jumlah, dan bar ringkasan
  bawah; daftar baris keranjang (anak berkunci di dalam map) tidak terkena. Animasi KELUAR untuk
  keempatnya dihapus — di mesin kasir, layar yang tidak bisa disentuh jauh lebih mahal daripada
  transisi yang hilang. Ditemukan lewat `getComputedStyle` + `elementFromPoint` pada dialog yang
  tersangkut, bukan dari membaca kode.
* **Modal shift berkedip di setiap muat halaman.** `useLiveQuery` mengembalikan `undefined` baik
  saat masih memuat maupun saat memang tidak ada shift, sehingga modal ter-mount lalu langsung
  di-unmount — dan mount→unmount secepat itulah yang memicu node tersangkut di atas. Kini
  memakai nilai awal `null` untuk membedakan "belum tahu" dari "tidak ada".
* **Tenant hanya bisa punya SATU produk tanpa barcode.** `PostProduct` menyimpan string kosong,
  bukan NULL, sedangkan `idx_variants_barcode` UNIK pada `(tenant_id, barcode)` untuk barcode
  bukan-NULL. Produk pertama berhasil, produk KEDUA selalu gagal 500 "Gagal menyimpan varian".
  Ditemukan saat menambah produk kedua di aplikasi nyata — cacat ini tidak terlihat dari membaca
  kode karena produk pertama selalu berhasil.

---

## [1.9.0] — 2026-09-16

> Nomor 1.7.0 ada di bawah (PR #16, cetak struk Bluetooth) — dirilis lebih dulu menurut tanggal,
> tetapi merge-nya belakangan.

### Ditambahkan
* **Jalur rilis Google Play** — `PLAY-STORE.md` + konfigurasi penandatanganan rilis di
  `android/app/build.gradle` + target `make aab`. Kredensial dibaca dari
  `android/keystore.properties` (di-gitignore) atau environment; tidak pernah masuk repo.
  `versionCode`/`versionName` kini bisa dinaikkan lewat environment — Play menolak unggahan
  dengan `versionCode` yang sudah dipakai.
* **`android-build.yml`** — gerbang kompilasi Android di SETIAP PR yang menyentuh berkas
  Android/Gradle/Capacitor. Sebelumnya satu-satunya jalur yang mengompilasi Android
  (`apk-debug.yml`) bersifat manual dan hanya dari `main`, sehingga berkas Gradle yang rusak baru
  ketahuan setelah merge. URL API di job ini sengaja palsu — yang diuji kompilasinya, bukan
  artefaknya, dan APK-nya tidak pernah diunggah.

### Diketahui, belum selesai
* **Tidak bisa diverifikasi di mesin pengembang** (host sengaja tanpa JDK, ADR-0010
  §Konsekuensi). Karena itu `android-build.yml` ditambahkan: kompilasinya dibuktikan di CI pada
  PR ini juga, bukan ditunda sampai setelah merge. Yang TETAP belum terbukti adalah jalur
  **bertanda tangan** — itu butuh keystore yang hanya boleh dibuat pemilik.
* **Yang memblokir penerbitan bukan kode:** keystore rilis (hanya pemilik yang boleh membuatnya),
  akun Play Console, dan **URL kebijakan privasi** semuanya belum ada.

---

## [1.8.0] — 2026-09-16

> Nomor 1.7.0 dilewati dengan sengaja: ia dipakai PR cetak struk Bluetooth (#16) yang belum
> masuk `main`. Begitu PR itu merge, urutannya tetap benar menurut tanggal.

### Ditambahkan
* **framer-motion di seluruh aplikasi** (keputusan pemilik 2026-09-16) — dipasang lewat
  `LazyMotion features={domAnimation} strict` + `MotionConfig reducedMotion="user"`, dengan token
  gerak tunggal di `src/lib/motion/tokens.ts` yang diturunkan dari Mochi Spring Physics
  (fondasi-UI §A). `strict` memaksa komponen `m.*`: satu `motion.*` yang lolos akan menarik
  seluruh pustaka ke bundle tanpa error dan tanpa ada yang menyadarinya.
* **`components/ui/modal.tsx`** — dialog bersama untuk modal bayar dan shift.
* **Token `--surface`** — permukaan padat yang sadar tema.

### Diubah
* **`pages/kasir.md` §Zona gerak: `none` → `fungsional`.** Aturan "nol animasi, impor pustaka
  gerak diblokir dari `/kasir`" dicabut atas keputusan pemilik. Penggantinya bukan pelonggaran
  bebas: daftar gerak yang boleh beserta alasannya, larangan stagger di grid produk (jalur
  scan-to-cart < 100 ms), larangan animasi layout, dan kewajiban `prefers-reduced-motion`.

### Diperbaiki
* **Escape saat dialog terbuka MENGHAPUS isi keranjang.** Layar kasir punya pendengar Escape
  global yang mengosongkan keranjang; menutup dialog pembayaran dengan Escape ikut menghapus
  belanjaan pembeli yang sedang dilayani. `Modal` kini menangkap Escape di fase capture lalu
  menghentikan penyebarannya. Diverifikasi lewat interaksi nyata di browser: dialog tertutup,
  keranjang tetap berisi.
* **Zoom dimatikan di seluruh aplikasi** (`maximumScale: 1`, `userScalable: false`) — melanggar
  WCAG 1.4.4, memukul pemilik warung berusia 50+ dan kasir yang memeriksa ULID kecil. Diganti
  `touch-action: manipulation`, yang mematikan double-tap-zoom TANPA mematikan cubit-zoom.
* **`prefers-reduced-motion` tidak didukung sama sekali** — kini ditangani di CSS dan MotionConfig.
* **18 permukaan `bg-white` ter-hardcode** menjadi putih di mode gelap sementara teksnya ikut
  krem; tombol "Sync Now" harfiah putih di atas putih. Semua dipindah ke token `--surface`.
* **Dialog tanpa semantik** — kini `role="dialog"` + `aria-modal` + nama, perangkap fokus,
  pengembalian fokus ke pemicu, dan kunci gulir latar.
* **Kontrol di bawah ambang sentuh 44px** — tombol sync (30px) dan tombol tema (36px) di header.
* **Tautan tanpa nama di ponsel** — tautan "Dasbor" di layar kasir hanya berisi ikon setelah
  labelnya disembunyikan `hidden sm:inline`; tombol kembali di katalog dan tambah produk sama.
* **Baris keranjang terpotong di 375px** — nama produk tinggal satu-dua huruf karena dipaksa
  satu baris dengan kontrol qty, total, dan tombol hapus. Kini bertingkat di bawah `sm`.
* **`id` input kembar** — `Input` menurunkan id dari teks label, sehingga dua field berlabel sama
  (mis. "Harga Jual" di tiap baris varian) berbagi id dan `<label htmlFor>` menunjuk field yang
  salah. Kini `useId()`, plus `aria-invalid`/`aria-describedby` dan `role="alert"` pada error.
* **Tema tidak tersimpan** — mode gelap kembali terang setiap muat ulang.
* **`min-h-screen` (100vh) di lima layar** — di Chrome Android menyisakan konten di bawah bilah
  alamat; diganti `100dvh`.
* **Hover menempel di layar sentuh** — `.mochi-button:hover` kini di balik `@media (hover: hover)`.

### Diketahui, belum selesai
* **Rute `/kasir` di atas anggaran 150 KB** (PERFORMANCE-BUDGET §4). Sudah melewatinya sebelum
  perubahan ini; framer-motion menambah ~20 kB di atas utang yang sudah ada. Angka anggaran
  sengaja tidak dinaikkan agar utangnya tetap terlihat.
* **Gerbang "Anggaran performa" hijau tanpa menguji apa pun.** `scripts/check-bundle-size.sh`
  memeriksa `apps/web/.next/static`, tetapi job CI-nya checkout bersih **tanpa build** — direktori
  itu tidak pernah ada, skrip keluar "dilewati" berstatus 0. Dijalankan pada build nyata ia
  melaporkan 3501 KB karena menjumlahkan seluruh chunk statis, bukan JS awal per rute yang
  dianggarkan. Belum diperbaiki di PR ini: memperbaikinya membuat gerbang itu merah sampai utang
  bundle diselesaikan, dan itu keputusan tersendiri.
* Gerak belum diuji di perangkat Android nyata maupun di dalam APK — baru di Chrome 375×812.

---

## [1.7.0] — 2026-09-14

### Ditambahkan
* **Cetak struk ke printer termal Bluetooth di APK** — kebutuhan kedua ADR-0010.
  * Plugin native lokal `ThermalPrinter` (`android/.../printer/ThermalPrinterPlugin.java`):
    Bluetooth klasik SPP, hanya ke perangkat yang sudah dipasangkan (tanpa `BLUETOOTH_SCAN`/izin
    lokasi), koneksi di utas terpisah. Ditulis sendiri, bukan plugin komunitas.
  * Tata letak ESC/POS di TypeScript murni (`src/lib/receipt/escpos.ts`, 58 mm/32 kolom dan
    80 mm/48 kolom) dengan uji vitest yang membaca balik byte dan menolak perintah tak dikenal.
  * `src/lib/receipt/format.ts` — data + format rupiah dipakai bersama struk HTML dan ESC/POS.
    Rupiah kini dibulatkan lewat Decimal, bukan `Math.round(Number(...))`.
  * Pemilih printer + lebar kertas di layar kasir, disimpan per perangkat. Browser/PWA tetap
    memakai `window.print()`.
* **Belum terverifikasi di perangkat:** plugin belum dikompilasi (host tanpa JDK) dan belum diuji
  dengan printer sungguhan. Printer yang hanya BLE tidak didukung.

---

## [1.6.4] — 2026-09-14

### Ditambahkan
* **`apk-debug.yml`** — APK debug menunjuk API produksi, dibangun di GitHub Actions dan dijalankan
  **manual** dari `main`. `make apk` tidak bisa dipakai untuk rilis: Gradle berjalan di host yang
  sengaja tidak punya JDK aktif, dan build di laptop ikut membawa branch yang sedang aktif —
  saat itu working tree berada di branch PR #16 yang belum di-review. Tiga gerbang: hanya
  `refs/heads/main`, URL API sama dengan build.yml, dan URL diverifikasi **di dalam APK yang
  jadi** (domain produksi harus ada; `ionowu.example`/`localhost:8080` harus nol). Artefak
  diberi nama per commit + SHA-256, disimpan 14 hari. `CI-PIPELINE.md` §3b; `GO-LIVE.md` §2.G.
  Belum mencakup build release/Play Store — butuh keystore milik pemilik.

---

## [1.6.3] — 2026-09-14

### Diperbaiki
* **Image web di `ghcr.io` memanggil domain yang tidak ada.** `NEXT_PUBLIC_API_URL` dibakar
  ke bundle klien saat build, tetapi `build.yml` tidak pernah meneruskannya — `build-args` hanya
  berisi `VERSION`/`COMMIT`/`CREATED`. Setiap image web (termasuk `08210e5`) memuat default
  Dockerfile `https://api.ionowu.example`. Image itu menyala normal dan lolos semua cek; ia baru
  gagal saat kasir memanggil API. Mengisi `PUBLIC_API_URL` di panel Dokploy tidak menolong karena
  nilainya tidak dibaca saat runtime. Ditemukan saat memeriksa gerbang GO-LIVE §2.G sebelum
  menyerahkan digest untuk deploy.
  * `build.yml` meneruskan repository variable `PUBLIC_API_URL`, dan langkah **Gerbang URL API web**
    menolak build bila nilainya kosong, berisi `example`, menunjuk `localhost`, atau bukan `https://`.
  * `apps/web/Dockerfile` tidak lagi punya default; build tanpa `--build-arg` gagal di tempat.
  * `DOCKER.md` §5 — contoh build manual ikut membawa `--build-arg`.

### Diubah
* **Skema domain produksi** (ditetapkan pemilik 2026-09-14) — satu subdomain per aplikasi Ionowu:
  web **`sweet.ionowu.com`**, API **`api.sweet.ionowu.com`**, menggantikan `app.ionowu.com` /
  `api.ionowu.com` di `DOKPLOY.md` §4, `SERVER-PROVISIONING.md`, `INFRASTRUCTURE.md`, dan contoh di
  `docker-compose.prod.yml`. Repository variable `PUBLIC_API_URL` diisi `https://api.sweet.ionowu.com`.
  Saat ditetapkan, `ionowu.com` sudah menunjuk VPS (76.13.16.85) tetapi kedua subdomain **belum
  punya record DNS**.

---

## [1.6.2] — 2026-09-14

### Ditambahkan
* **ADR-0011** — image hanya `linux/amd64`; arm64 dihentikan. Build `web` untuk arm64 berjalan
  lewat QEMU di runner x86 dan terbukti **macet tanpa log**: 358,8 menit pada `997aab8`
  (dibatalkan timeout 6 jam) dan 30,8 menit pada `f3fa10f`, sementara amd64 di run yang sama
  selesai dalam hitungan menit. Server produksi dikonfirmasi pemilik x86_64. Butir WAJIB
  `IMG-10` (amd64) tetap dipenuhi; yang dihentikan hanya bagian SEBAIKNYA (arm64).

### Diubah
* **`build.yml`** — `platforms: linux/amd64`; `setup-qemu-action` dihapus.
* **`SERVER-PROVISIONING.md` §1** — baris **Arsitektur** baru. Sebelumnya dokumen hanya
  menyebut jumlah vCPU, sehingga tidak ada yang tahu image arm64 tidak pernah dipakai.
* **`DOCKER.md` §5** — panduan build manual di Mac Apple Silicon (`--platform linux/amd64`):
  tanpa itu image arm64 lolos uji lokal lalu gagal di server dengan `exec format error`.

---

## [1.6.1] — 2026-09-14

### Diperbaiki
* **`DOKPLOY.md` §6 basi.** Berisi lima pertanyaan "masih harus ditetapkan" dan
  diagram yang menggambar build **di VPS** — padahal §7 berkas yang sama sudah
  menutupnya lewat ADR-0004. Empat dari lima pertanyaan ternyata sudah dijawab di
  `DEPLOYMENT.md` dan `MIGRATIONS.md`, termasuk yang ditandai P0 (urutan migrasi
  terhadap deploy). Kini diganti tabel status yang menunjuk jawabannya; satu yang
  benar-benar masih terbuka (deploy otomatis vs manual) ditandai jujur, dan rollback
  ditandai "tertulis, belum diuji".

### Ditambahkan
* **`GO-LIVE.md` §2.G — gerbang build & klien.** Tiga cacat yang pernah lolos semua
  pemeriksaan lain: URL API ter-*bake* `localhost`, CORS tanpa origin APK, dan APK
  demo yang menunjuk IP laptop. Masing-masing disertai cara memeriksanya pada
  artefak nyata, bukan pada konfigurasi. Urutan hari-H kini mewajibkan login dari
  **APK sungguhan**, karena CORS untuk origin APK tidak teruji oleh browser mana pun.

---

## [1.6.0] — 2026-09-12

### Ditambahkan
* **ADR-0010** — Capacitor membungkus PWA yang sama menjadi APK, menolak usulan
  menulis ulang dengan React Native. Pengukuran pada kode nyata: RN membuang
  ±92% frontend (2.860 baris komponen + Dexie/Serwist/sync engine), sementara
  Capacitor memenuhi kedua kebutuhan client (Play Store + printer termal
  Bluetooth) tanpa membuang satu baris pun.
* **Target `make apk`** — satu perintah dari sumber sampai APK. `API_URL` wajib
  diisi karena nilainya ter-*bake* saat build.

### Diubah
* **`next.config.ts`** — keluaran kini dipilih lewat `BUILD_TARGET`:
  `export` untuk Capacitor, `standalone` untuk image Docker. Keduanya tidak
  bisa aktif bersamaan.

### Diperbaiki
* **`next.config.ts` mem-*bake* `localhost:8080` ke SETIAP build.** Baris
  `process.env.NEXT_PUBLIC_API_URL = "http://localhost:8080"` di dalam config
  dieksekusi sebelum Next menyisipkan variabel `NEXT_PUBLIC_*`, sehingga
  menimpa environment yang benar-benar diberikan. Dibuktikan dengan membangun
  memakai URL lain lalu mencari string-nya: URL asli muncul **nol** kali,
  localhost **12** kali. Dampaknya bukan hanya APK (ponsel menghubungi dirinya
  sendiri) tetapi juga deployment VPS — browser pengguna akan menghubungi
  dirinya sendiri. Tidak terlihat saat pengembangan karena di lokal localhost
  memang kebetulan benar.

---

## [1.5.0] — 2026-09-11

### Ditambahkan
* **Katalog jenis usaha** — `services/pos-engine/internal/businesstype/catalog.json`
  beserta pembacanya di Go (`//go:embed`) dan TypeScript. Isinya diturunkan dari
  `MARKET-SEGMENTS.md` §3 dan §5; tidak ada kategori di luar yang tertulis di sana.
  Berkasnya **satu** dan dibaca kedua bahasa — bukan konstanta kembar — mengikuti pola
  paritas `internal/money/fixtures`. Kategori `parfum_refill` ("Toko Parfum Refil")
  melayani Warung Wangi, satu dari dua pelanggan pasti (CLAUDE.md §2).
* **Halaman `/daftar`** (`apps/web`) — pendaftaran tenant + pemilik dengan pemilih jenis
  usaha, dikelompokkan per arketipe A–F dan ditandai fase fiturnya, supaya pemilik tahu
  arketipe yang belum digarap **sebelum** mendaftar. Sebelumnya `POST /auth/register`
  sudah ada di backend tetapi tidak punya layar sama sekali.
* **`components/ui/select.tsx`** — token dan bentuknya disalin persis dari `input.tsx`.

### Diubah
* **`openapi.yaml` `/auth/register`** — menerima `business_type` (opsional) dan
  mendokumentasikan respons `400 INVALID_BUSINESS_TYPE`.
* **`httpapi/auth.go`** — `PostRegister` memvalidasi lalu menyimpan `business_type`.
  Sebelumnya kolom itu **selalu `NULL`** untuk setiap tenant yang mendaftar lewat HTTP:
  `CreateTenantParams` sudah punya field-nya, tetapi handler tidak pernah mengisinya —
  hanya seeder yang mengisi, sehingga cacatnya tidak terlihat dari data contoh.

---

## [1.4.0] — 2026-09-03

### Ditambahkan
* **ADR-0008** — tiga penyimpangan dari `fondasi-server-ionowu.md` v3.9 (base image build Go,
  ketiadaan `HEALTHCHECK` Docker di image distroless, cosign belum aktif), dicatat sesuai
  prinsip P7 standar itu sendiri: penyimpangan boleh terjadi bila ditulis terbuka.
* **ADR-0009** — model dua-proyek Dokploy (`ionowu-sweet-data` tipe Compose,
  `ionowu-sweet` tipe Application), membalik sebagian keputusan ADR-0003. Alasannya
  diverifikasi lewat pengujian nyata: Swarm mengabaikan `depends_on`, membuat `DEP-07`
  (zero-downtime) diam-diam gagal bila seluruh stack didaftarkan sebagai satu Compose.

### Diubah
* **`DOKPLOY.md` §2** — rekomendasi "satu Compose untuk semua layanan" ditandai usang dan
  digantikan model dua-proyek, dengan peringatan eksplisit alih-alih dihapus diam-diam.

### Diperbaiki
* **`services/pos-engine/internal/httpapi/router.go`** — `/health/live` dan `/health/ready`
  dipisah (RUN-08); sebelumnya hanya satu `/healthz` generik.
* **`.github/workflows/build.yml`** — image `web` tidak akan pernah ter-build karena
  `context` salah (pnpm workspace butuh context root, bukan `./apps/web`); dikonfirmasi lewat
  `docker build` nyata sebelum diperbaiki.

---

## [1.3.0] — 2026-08-22

### Ditambahkan
* **`CLAUDE.md`** — konteks proyek yang **ikut berpindah bersama repositori**.
  Berbeda dari memori lokal Claude (`~/.claude/projects/.../memory/`) yang terikat pada
  mesin & akun, berkas ini ter-commit ke git sehingga tetap berlaku di perangkat atau
  akun mana pun.

  Isinya bukan ringkasan dokumentasi, melainkan: sumber kebenaran saat dokumen bertentangan ·
  **12 keputusan yang jangan ditawarkan ulang** · **10 hal yang sudah ditolak** ·
  **8 invarian yang tidak boleh dilanggar** · kondisi terkini · cara kerja di repo ini.

---

## [1.2.0] — 2026-08-22

### Audit menyeluruh — nol error
86 dokumen divalidasi terhadap 8 kelas kesalahan: link relatif · referensi §seksi ·
penanda basi · file yatim · kontradiksi antar-dokumen · heading duplikat · tabel rusak ·
blok kode tak tertutup. **Hasil: 0.**

### Diperbaiki
* **9 penanda basi** — dokumen menyebut berkas "belum ditulis" padahal sudah ada
* **7 kontradiksi nyata:**
  * `DOCKER.md` & `REPOSITORY.md` masih menyatakan layanan Python ditunda (dibatalkan ADR-0006)
  * **BOM di Fase 4 vs Fase 1** — diselesaikan: BOM ringan naik ke **Fase 1**
    (Warung Wangi & arketipe C membutuhkannya), manufaktur penuh tetap Fase 4 bersyarat
  * `DOKPLOY.md` masih menyebut lokasi build sebagai keputusan terbuka (ditutup ADR-0004)
  * runbook `database-full` masih menyebut build di VPS sebagai penyebab image menumpuk
  * **`ANALYTICS-BI` menulis `quantity_sold INT`** sementara migrasi memakai `DECIMAL(14,3)`
  * Blok SQL lama di `DATA-MODEL.md` kini ditandai `⚠️ BENTUK LAMA`
* Tabel memori di `PERFORMANCE-BUDGET` — jumlah kolom tidak konsisten
* `CHANGELOG` & `CONTRIBUTING` sebelumnya tidak tertaut dari mana pun

### Ditambahkan
* **`15-development/DEV-VS-PROD.md`** — batas tegas dev / staging / produksi:
  tabel perbedaan baris-per-baris, **5 kebiasaan dev yang berbahaya di produksi**,
  daftar hal yang justru **wajib sama**, dan perjalanan satu perubahan dari laptop ke produksi

---

## [1.1.0] — 2026-08-22

### sqlc & kueri jalur checkout
* `30-data/sqlc.yaml` — konfigurasi pgx/v5, override `numeric` → `decimal.Decimal`
* `30-data/queries/` — **23 kueri** (catalog 6 · shift 5 · checkout 12), 7 ditandai `HOT PATH`

### 🔒 Aturan emas kini ditegakkan otomatis
`sqlc vet` menolak kueri yang tidak memfilter `tenant_id`, memakai `SELECT *`, atau
`DELETE` pada tabel keuangan. SECURITY §2B berubah dari konvensi menjadi gerbang CI.

### Keputusan yang dikunci dalam SQL
* **`DecrementStockStrict` vs `DecrementStockAllowNegative`** — dua kueri berbeda,
  karena checkout online menolak stok kurang sementara sync offline wajib menerimanya
* **Mutex stok = kunci baris Postgres**, bukan Redis — `UPDATE` tunggal sudah atomik;
  menambah Redis ke jalur ini menambah titik kegagalan di bagian paling kritis
* **`CreateSaleIdempotent`** — `ON CONFLICT DO NOTHING RETURNING`; 0 baris = duplikat
  (kelas ACCEPTED), bukan error
* **`InsertOutboxEvent`** dalam transaksi yang sama — mengatasi dual-write
* **`CalculateExpectedCash`** mengecualikan `is_late_arrival` — Z-Report tidak berubah retroaktif
* `numeric` → `decimal.Decimal`, **tidak pernah `float64`**

### Belum diverifikasi
Belum pernah dijalankan lewat `sqlc generate` (belum ada lingkungan Go).
Validasi statis lulus: 23 kueri, 0 masalah tenant-scope, parameter berurutan.

---

## [1.0.0] — 2026-08-22

### Migrasi awal ditulis — dari dokumen menjadi kode
`30-data/migrations/` — **9 berkas, 47 tabel, 57 indeks**, validasi dependensi FK lulus.

| # | Isi |
|---|---|
| 00001 | tenants · outlets · users · `user_outlet_assignments` · refresh_tokens |
| 00002 | platform_admins · breakglass_sessions · identities · distributors · model izin |
| 00003 | katalog dengan **`DECIMAL(14,3)` + `uom` + `item_type` + BOM + konversi satuan** |
| 00004 | customers · consents · segments · interactions |
| 00005 | shifts · cash_movements · sales · items · payments · refunds |
| 00006 | stock_events · opname · transfer antar-outlet |
| 00007 | sync_receipts · webhook · **event_outbox** · background_jobs · audit_logs |
| 00008 | daily_outlet_summary · product_performance · restock_predictions |
| 00009 | sop_templates · sop_executions |

### Diselesaikan
* 🔴 **Celah `stock_quantity INT` tertutup.** Skema awal langsung `DECIMAL(14,3)` — Warung
  Wangi (ml) & Media Boga (gram) kini dapat dilayani tanpa `ALTER` di kemudian hari.
* Seluruh tabel yang tercecer di berbagai dokumen kini punya DDL nyata: `event_outbox`,
  `user_outlet_assignments`, `outlet_price_overrides`, `is_sandbox`, `is_late_arrival`.
* `30-data/migrations/` menjadi **sumber kebenaran skema**; DATA-MODEL.md menjadi penjelasan rancangan.

### Belum masuk migrasi
`settlement_reports` (menunggu vendor QRIS) · langganan & tagihan (menunggu finalisasi paket) ·
order pekerjaan & slot waktu (arketipe E & D, Fase 3–4)

---

## [0.9.0] — 2026-08-22

### Ditambahkan
* `00-product/MARKET-SEGMENTS.md` — **6 arketipe operasional** + katalog ~50 jenis usaha UMKM
* `00-product/SOP-MODULE.md` — SOP per kategori, tiga lapis: template → penegakan → penemuan

### 🔴 Temuan kritis
* **`stock_quantity INT` membuat kedua pelanggan fix tidak bisa dilayani.**
  Warung Wangi (ml) & Media Boga (gram) butuh `DECIMAL(14,3)` + UOM + konversi satuan.
  Naik menjadi **P0 nomor 0** — lebih murah diubah sekarang selagi tabel kosong.

### Prinsip baru
* **Universal dari sisi rancangan, fokus dari sisi pemasaran** — model data mencakup
  6 arketipe sejak awal (`item_type`), urutan fitur tetap bertahap
* **Kategori usaha = konfigurasi, bukan cabang kode** — sejalan dengan model izin RBAC §7

### Diubah
* Legalitas usaha (izin, NPWP, PIRT, pajak) → **tanggung jawab owner/tenant**.
  Yang tetap melekat pada kita: UU PDP sebagai pemroses & keamanan data.
  Paparan diperkecil lewat model sub-merchant + DPA. **Tidak memblokir Fase 0.**
* SOP naik menjadi **pembeda utama produk**, masuk Fase 1

---

## [0.8.0] — 2026-08-21

### Arah produk: mini ERP
* `00-product/ERP-MODULE-MAP.md` — peta 8 modul ERP, urutan pengerjaan, dan **peringatan
  ruang lingkup**: ERP adalah kategori produk berbeda, bukan POS + fitur
* Urutan disarankan: Purchasing → Finance ringan → HR ringan → Manufacturing (bersyarat)
* Tetap di Non-Goals: buku besar, payroll, e-faktur, marketplace pemasok

### Katalog peran lengkap — [RBAC-MODEL](./40-security/RBAC-MODEL.md) §6
* **18 peran** dalam 3 kelas, lengkap dengan pentahapan
* 🔑 **Rekomendasi utama: model berbasis izin (§7)**, bukan 18 peran keras —
  `permissions` + `role_templates` + peran kustom per tenant
* Peran bernilai tinggi & murah: `auditor`, `external_accountant` (baca saja)
* Peran kunci pertumbuhan: `area_manager` — tanpanya pertumbuhan berhenti di kapasitas owner

### Ditandai perlu ditinjau
* **North Star** kemungkinan salah — mengukur pemakaian, bukan pertumbuhan tenant
* Lanskap kompetitif berubah: kini juga Accurate, Jurnal, Majoo
* **Modul SOP** diusulkan sebagai pembeda utama — belum ada di roadmap mana pun

---

## [0.7.0] — 2026-08-21

### Model hak akses dirombak — [ADR-0007](./10-architecture/adr/0007-principal-classes-and-rbac.md)
* Tujuh peran dipetakan menjadi **tiga kelas principal**: platform · staf tenant · pihak eksternal
* `40-security/RBAC-MODEL.md` menjadi **sumber kebenaran RBAC** (menggantikan SECURITY §3)
* `users.role` diperluas: + `warehouse`, `sales_floor` — **`manager` dipertahankan**
* `platform_admins` + `breakglass_sessions`: super admin **tanpa akses default**,
  hanya lewat sesi beralasan, maks 4 jam, tercatat, **tenant diberi tahu**
* `identities` + tabel penghubung: identitas pelanggan & distributor **lintas-tenant**

### Konsekuensi
* 🔴 `TenantMiddleware` tidak lagi bisa mengasumsikan satu `tenant_id` — **menyentuh setiap endpoint**
* 🔴 Auth kini melayani pihak tidak dipercaya (portal publik) — permukaan ancaman baru
* **SPG mewajibkan fitur pesanan tertahan** yang selama ini belum tercakup FR mana pun
* Konflik terbuka: **gudang vs HPP** saat menerima barang
* Portal distributor menyentuh Non-Goals "marketplace pemasok" — butuh ADR tersendiri
* Persona baru: Gudang, SPG, Super Admin

---

## [0.6.0] — 2026-08-21

### Ruang lingkup diperluas — [ADR-0006](./10-architecture/adr/0006-crm-bi-and-python-service.md)
* **CRM & Business Intelligence masuk produk.** CRM dikeluarkan dari Non-Goals.
* **Layanan Python diaktifkan sejak Fase 1** — membatalkan keputusan penundaan di v0.5.0.
  Ruang lingkup: restock · segmentasi pelanggan (RFM) · agregasi BI.

### Ditambahkan
* `10-architecture/ANALYTICS-BI.md` — jalur analitik bertahap (ringkasan → replika → DuckDB)
* **Entitas pelanggan** di DATA-MODEL §5: `customers`, `customer_consents`,
  `customer_segments`, `customer_interactions` — sebelumnya **tidak ada sama sekali**
* Tooling Python ditetapkan: uv · psycopg3 · pandas · duckdb · scikit-learn · APScheduler · ruff · pytest

### Konsekuensi
* 🔴 **Sistem kini menyimpan PII pelanggan** — UU PDP naik dari P2 ke P0
* 🔴 **Perangkat kasir hilang kini membawa PII pelanggan** — mitigasi di DATA-MODEL §5E
* ⚠️ **Ukuran VPS naik: 4 GB → 8 GB minimum** (agregasi BI memuat data ke memori)
* Aturan dedup pelanggan pada sync offline (nomor telepon = kunci identitas)
* CRM & BI menjadi pembeda paket di PRICING

---

## [0.5.0] — 2026-08-21

### Disetujui
Seluruh keputusan teknis di [TECH-STACK](./10-architecture/TECH-STACK.md) dinaikkan ke ✅.
ADR-0004 & ADR-0005 → **Diterima**.

### Konsekuensi yang diterapkan
* **Layanan Python ditunda ke Fase 2.** V0/V1 prediksi restock dikerjakan `web-app` sebagai
  job terjadwal. FDR, SERVICE-BOUNDARIES, ROADMAP, INTELLIGENCE-WORKER, DOCKER, dan
  PERFORMANCE-BUDGET diperbarui. Menghemat ~512 MB RAM di VPS.
* **Peran TanStack Query dicabut dari sinkronisasi** dan dicatat langsung di
  `fondasi-UI-v0.1.md` §8C, tempat kesalahpahaman paling mungkin terjadi.
* Variabel baru di CONFIGURATION: `GHCR_TOKEN`, `GRAFANA_CLOUD_API_KEY`, `SENTRY_DSN`, kunci R2.
* Gerbang CI di PERFORMANCE-BUDGET & TESTING-STRATEGY kini punya platform yang menjalankannya.

### Menunggu penawaran komersial
* Gateway QRIS — **arah sub-merchant disetujui**, Midtrans dievaluasi lebih dulu
* WhatsApp — **API resmi disetujui**, pemilihan BSP menunggu

---

## [0.4.0] — 2026-08-21

### Ditetapkan
* **VPS: Hostinger (KVM)** — region terdekat Indonesia, RAM min. 4GB
* **Backend Go:** chi · pgx/v5 · sqlc · goose · go-redis/v9 · golang-jwt/v5 · x/crypto/argon2 · log/slog
* **Frontend:** pnpm · zod · Biome · Vitest · Playwright · **Serwist** (Service Worker)
* **CI & registry:** GitHub Actions + ghcr.io, build **tidak lagi di VPS** ([ADR-0004](./10-architecture/adr/0004-ci-build-and-registry.md))
* **Telemetri:** Grafana Cloud + Sentry SaaS; data transaksi tetap di VPS ([ADR-0005](./10-architecture/adr/0005-telemetry-external-data-internal.md))
* **Backup:** Cloudflare R2 (penyedia berbeda dari VPS)
* **Analytics produk:** tabel PostgreSQL sendiri, bukan PostHog/Umami

### Diubah
* `OBSERVABILITY.md` §6 direvisi: tumpukan pemantauan **tidak** self-hosted di VPS produksi
* Batas peran sinkronisasi ditegaskan: SW → aset · TanStack Query → cache baca ·
  antrean sendiri → **seluruh tulis transaksi**

### Menunggu keputusan komersial
* Gateway QRIS (kandidat: Midtrans / Xendit)
* WhatsApp Business Platform resmi

---

## [0.3.0] — 2026-08-21

### Ditambahkan
* **`00-product/`** — 9 dokumen: VISION-SCOPE, PERSONAS-JTBD, ROADMAP, SUCCESS-METRICS,
  ANALYTICS-EVENTS, ONBOARDING-ACTIVATION, PRICING-PACKAGING, MULTI-OUTLET, COMPETITIVE-LANDSCAPE
* **`10-architecture/`** — SERVICE-BOUNDARIES, EVENT-ARCHITECTURE, REDIS-STRATEGY,
  INTELLIGENCE-WORKER, SCALABILITY-RELIABILITY; ADR-0003 (Dokploy)
* **`20-api/`** — ERROR-CATALOG, INTEGRATION-QRIS
* **`30-data/`** — DATA-MODEL, MIGRATIONS, OFFLINE-SYNC-SPEC, RETENTION
* **`40-security/`** — THREAT-MODEL, COMPLIANCE-ID
* **`50-operations/`** — INFRASTRUCTURE, DOKPLOY, DOCKER, NETWORK-HARDENING,
  CONFIGURATION, DEPLOYMENT, OBSERVABILITY, BACKUP-DR, 6 runbook
* **`60-quality/`** — TESTING-STRATEGY, PERFORMANCE-BUDGET, ACCESSIBILITY, HARDWARE-SUPPORT
* Akar — DOCS-MAP, GLOSSARY, CONTRIBUTING, CHANGELOG; README per folder

### Diubah
* Struktur folder diberi awalan angka mengikuti alur `kenapa → bagaimana → dijaga → tampak`
* **FDR dipecah** (311 → 169 baris): skema → `30-data/`, compose → `50-operations/`,
  keamanan → `40-security/`. Tidak ada isi yang hilang.
* Reverse proxy ditetapkan **Traefik** (ADR-0003), mengakhiri "Traefik / Caddy / Nginx"

### Diperbaiki
* 3 tautan yang sudah rusak sebelumnya di ADR-0001 & ADR-0002

### Temuan yang menunggu keputusan
* Redis Pub/Sub kehilangan event → usul Redis Streams + outbox
* Revokasi token gagal saat Redis restart → Postgres sebagai sumber kebenaran
* `users` tidak terkait outlet → kasir dapat mengakses seluruh cabang
* `plan_tier` ada di skema tanpa definisi produk
* Tabrakan port 3000 antara `web-app` dan UI Dokploy
* "In-memory mutex" ambigu → pecah senyap saat penskalaan horizontal

---

## [0.2.0] — sebelum 2026-08-21

Baseline awal: PRD-01, FDR, SECURITY, ADR-0001/0002, API guidelines + OpenAPI,
design system, katalog aset, prototipe HTML.
