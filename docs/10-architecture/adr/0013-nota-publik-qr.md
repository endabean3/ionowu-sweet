# ADR-0013: Nota publik lewat QR (cek garansi & daftar member tanpa login)

| Metadata | Nilai |
|---|---|
| **Status** | **Diterima** (19 September 2026) |
| **Tanggal** | 2026-09-19 |
| **Pengambil Keputusan** | Pemilik produk (permintaan Warung Wangi Dongko) |
| **Dokumen Acuan** | [ADR-0007](./0007-principal-classes-and-rbac.md) (kelas principal) · migrasi `00014_nota_web` · [ERROR-CATALOG](../../20-api/ERROR-CATALOG.md) · [openapi.yaml](../../20-api/openapi.yaml) `/public/v1/nota` |

## Konteks

Pemilik Warung Wangi ingin nota pembelian memuat kode yang bisa dipindai pembeli dengan kamera HP
untuk dua hal:

- **Cek garansi.** Garansi 7 hari sudah dicetak sebagai teks, tetapi pembeli tidak punya cara
  memeriksa atau mengklaimnya selain datang ke toko.
- **Daftar member.** Pembeli yang tidak sempat mendaftar di kasir perlu jalan lain untuk menjadi
  member.

Barcode CODE128 yang sudah ada di nota hanya berisi kode member. Kamera HP menampilkannya sebagai
teks, bukan halaman.

Warung Wangi juga sudah punya situs sendiri, `warungwangi.ionowu.com` (repo terpisah, Next.js + Go
API + Postgres sendiri). Situs itu punya CSP `connect-src 'self'` dan membaca data hanya dari sisi
server.

Temuan saat menggarap fitur ini: kasir membuat **dua ULID berbeda** untuk satu penjualan. Nota
mencetak id antrean, sedangkan server menyimpan `payload.id`, sehingga nomor di tangan pembeli tidak
pernah bisa dicari di server. Bug ini diperbaiki di perubahan yang sama. Tanpa perbaikan itu, QR
mana pun akan menunjuk ke nota yang tidak ada.

## Alternatif yang Dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| A. QR ke WhatsApp toko (pesan terisi) | Tanpa endpoint baru | Garansi tidak bisa dicek, dan pendaftaran tetap manual oleh pemilik | Tidak memenuhi "cek garansi" |
| B. QR ke profil TikTok toko | Tanpa endpoint baru | Tidak ada garansi maupun pendaftaran | Tidak memenuhi permintaan |
| C. Barcode nomor nota untuk dipindai kasir | Tanpa endpoint publik | Pembeli tidak mendapat apa pun dari memindainya | Bukan yang diminta |
| **D. QR ke halaman nota di web TOKO, data dari endpoint publik pos-engine** | Pembeli melihat nota, status garansi, dan form member bermerek toko | Endpoint tanpa login pertama di pos-engine | — **dipilih** (pilihan pemilik) |
| E. Halaman nota di `sweet.ionowu.com` | Satu repo | Merek ionowu, bukan merek toko; toko yang punya situs sendiri tidak memakainya | Toko sudah punya situs |

## Keputusan

Kami memilih **D**. Rinciannya:

1. **QR di nota** menunjuk ke `<outlets.nota_web_url>/<tenant_id>/<id nota>`. `nota_web_url` diisi
   di Pengaturan per outlet. Kosong berarti nota tanpa QR, dan itu bawaan untuk tenant lain.
   - Printer termal mencetaknya sebagai **raster `GS v 0`**, bukan perintah QR bawaan `GS ( k`
     yang tidak dimiliki sebagian printer Bluetooth murah.
   - Nota browser mencetaknya sebagai SVG. Kedua bentuk memakai matriks yang sama
     (`lib/barcode/qr.ts`, koreksi galat M).
2. **Dua endpoint publik tanpa login** di pos-engine, di luar `TenantMiddleware`:
   - `GET /public/v1/nota/{tenantId}/{saleId}` → ringkasan nota dan status garansi;
   - `POST /public/v1/nota/{tenantId}/{saleId}/member` → daftar member.

   Pengunjungnya adalah principal **eksternal anonim** (ADR-0007 kelas 3). Satu-satunya "kunci"
   yang ia pegang adalah nota.
3. **Kunci = (tenant_id, id nota).** Id nota adalah ULID dengan 80 bit acak, jadi menebak nota orang
   lain tidak praktis. Keduanya wajib di setiap kueri, sehingga aturan emas `tenant_id` tetap
   berlaku dan ditegakkan `sqlc vet`.
4. **Tidak ada PII atau data internal** di jawaban: tanpa pelanggan, kasir, HPP, atau id tenant.
   - Nomor WA yang sudah terdaftar dijawab `MEMBER_ALREADY_EXISTS` **tanpa** kode member pemiliknya.
   - Id salah, id milik tenant lain, dan nota yang belum tersinkron dijawab `404 NOTA_NOT_FOUND`
     yang sama.
5. **Batas pendaftaran:**
   - satu pendaftaran per nota (`customers.signup_sale_id` + indeks unik parsial);
   - hanya nota lunas, belum direfund, dan tanpa member;
   - paling lama 30 hari setelah pembelian;
   - syarat follow TikTok toko tetap berlaku (dideklarasikan sendiri oleh pembeli, lalu dicek kasir
     saat merchandise diberikan).
6. **Rate limit per tenant (baca 300/menit, daftar 30/menit) dan per nota (daftar 5/menit), bukan
   per IP.** Pemanggilnya adalah server web toko, jadi semua permintaan membawa satu IP yang sama.
7. **Web toko membaca endpoint ini dari server**, sehingga CSP-nya tidak berubah. Web toko juga
   **mengunci halaman ke tenant-nya sendiri** (`SWEET_TENANT_ID`). Tanpa kunci itu, siapa pun bisa
   merangkai URL berisi id toko lain dan halaman itu tampil dengan merek Warung Wangi.

## Konsekuensi

**Positif:**
- Pembeli memindai nota, melihat sisa garansi, dan bisa mengklaim lewat WhatsApp toko dengan nomor
  nota yang sudah terisi.
- Member bisa bertambah tanpa antre di kasir. Member baru ikut ke perangkat kasir lewat `/sync/pull`
  seperti biasa.
- Nomor di nota kini sama dengan id penjualan di server, sehingga klaim garansi dan refund bisa
  dicari dari nota.

**Negatif / biaya yang kami terima:**
- pos-engine kini punya permukaan tanpa login. Setiap perubahan di `public_nota.go` dan
  `public_nota.sql` harus ditinjau sebagai perubahan keamanan.
- Garansi dihitung dari `outlets.warranty_days` **saat ini**, bukan saat penjualan. Bila pemilik
  mengubah lamanya, halaman bisa berbeda dari nota lama yang sudah tercetak. Kolom garansi per
  penjualan menyusul bila ini jadi masalah nyata.
- Rate limit in-process per replika (seperti `/auth/*`), sehingga batas efektifnya dikali jumlah
  replika.
- Nota yang dibuat saat offline baru bisa dibuka setelah tersinkron. Halaman menjawab "coba lagi
  beberapa menit lagi".
- QR menambah ±5 KB raster per nota Bluetooth.

**Yang akan kami tinjau ulang bila:**
- Ada tenant kedua yang memakai nota publik tanpa situs sendiri → sediakan halaman bawaan di
  `sweet.ionowu.com` (opsi E).
- Ada tanda penyalahgunaan pendaftaran → tambah CAPTCHA di web toko atau verifikasi OTP WhatsApp
  (butuh BSP resmi, CLAUDE.md §7).
