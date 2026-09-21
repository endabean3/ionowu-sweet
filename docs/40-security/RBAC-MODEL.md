# Model Hak Akses — Tiga Kelas Principal

> **Status:** 🟡 Draft · **Prioritas:** 🔴 **P0** — memengaruhi skema, auth, dan isolasi tenant
> **Dasar keputusan:** [ADR-0007](../10-architecture/adr/0007-principal-classes-and-rbac.md)
> **Menggantikan** matriks di [SECURITY.md](./SECURITY.md) §3 sebagai sumber kebenaran RBAC

---

## 1. ⚠️ Temuan Utama: Tujuh Peran Itu Bukan Satu Sumbu

Usulan peran — `super admin`, `owner`, `kasir`, `gudang`, `SPG`, `customer`, `distributor` —
terlihat seperti satu daftar berjenjang. Sebenarnya **tiga jenis makhluk yang berbeda**, dan
memaksakannya ke satu kolom `role VARCHAR(20)` (skema saat ini) akan pecah.

| Kelas | Siapa | Cakupan | Isolasi |
|---|---|---|---|
| **1. Platform** | `super_admin` | **Lintas semua tenant** | 🔴 Justru **melanggar** isolasi tenant |
| **2. Staf tenant** | owner, manager, kasir, gudang, SPG | Satu tenant + outlet tertentu | Terikat `tenant_id` |
| **3. Pihak eksternal** | customer, distributor | **Identitas lintas-tenant, data per-tenant** | Terikat *hubungan*, bukan tenant |

### Kenapa ini penting, bukan sekadar kerapian

* **Super admin membalik jaminan inti sistem.** [SECURITY.md](./SECURITY.md) §1 menyebut
  kebocoran antar-tenant sebagai kegagalan paling fatal, dan
  [OBSERVABILITY](../50-operations/OBSERVABILITY.md) §2 menetapkan SLO-nya **nol, selamanya**.
  Super admin adalah pelanggaran isolasi yang **disengaja**. Ia tidak boleh diperlakukan
  sebagai "peran dengan hak lebih banyak" — ia butuh mekanisme sendiri (§3).

* **Identitas pelanggan & distributor bersifat lintas-tenant, tetapi datanya per-tenant.**
  Satu distributor melayani banyak toko. Satu orang bisa jadi pelanggan di dua tenant berbeda —
  dengan nomor telepon yang sama. Ini **kebalikan** dari staf, yang identitasnya melekat pada
  satu tenant. Menaruh keduanya di tabel `users` akan memaksa duplikasi akun atau membocorkan
  keberadaan tenant lain.

* **Auth kini melayani pihak yang tidak dipercaya.** Sampai sekarang seluruh pengguna adalah
  karyawan. Portal pelanggan dan distributor membuka pintu login ke publik — dengan risiko
  *credential stuffing* dan *account enumeration* yang belum pernah ada di model ancaman.

---

## 2. Kelas 2 — Staf Tenant

### ⚠️ `manager` hilang dari usulan Anda

Usulan menyebut super admin, owner, kasir, gudang, SPG — **tanpa manager**. Padahal Budi
(manager toko) adalah salah satu dari tiga persona utama
([PERSONAS-JTBD](../00-product/PERSONAS-JTBD.md) §3), dan pemegang tugas rekonsiliasi kas.

**Rekomendasi: pertahankan `manager`.** Tanpanya, tutup shift dan persetujuan void naik ke
owner — padahal owner justru persona yang paling jarang ada di toko. Bila SPG dimaksudkan
menggantikan manager, itu keliru: SPG adalah staf lantai penjualan, bukan penyelia.

### Matriks Hak Akses

| Aksi | 👑 Owner | 🧑‍🍳 Manager | 👩‍💼 Kasir | 📦 Gudang | 🛍️ SPG |
|---|:-:|:-:|:-:|:-:|:-:|
| **Transaksi** | | | | | |
| Buka/tutup shift kasir | ✅ | ✅ | ✅ | ❌ | ❌ |
| Proses pembayaran & cetak struk | ✅ | ✅ | ✅ | ❌ | ❌ |
| Buat keranjang / pesanan tertahan | ✅ | ✅ | ✅ | ❌ | ✅ |
| Void transaksi | ✅ | ✅ (log) | ⚠️ PIN manager | ❌ | ❌ |
| Diskon manual >20% | ✅ | ✅ | ⚠️ PIN manager | ❌ | ❌ |
| Buka laci kas manual | ✅ | ✅ (log) | ⚠️ (log) | ❌ | ❌ |
| **Stok** | | | | | |
| Lihat level stok | ✅ | ✅ | ✅ | ✅ | ✅ |
| Terima barang dari distributor | ✅ | ✅ | ❌ | ✅ | ❌ |
| Stock opname | ✅ | ✅ | ❌ | ✅ | ❌ |
| Transfer antar-outlet | ✅ | ✅ (outletnya) | ❌ | ✅ | ❌ |
| Catat barang rusak/hilang | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Katalog & Harga** | | | | | |
| Lihat harga jual | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Ubah HPP & harga jual** | ✅ | ❌ | ❌ | ⚠️ **lihat catatan** | ❌ |
| Tambah/ubah produk | ✅ | ✅ | ❌ | ❌ | ❌ |
| **CRM** | | | | | |
| Daftarkan pelanggan baru | ✅ | ✅ | ✅ | ❌ | ✅ |
| Lihat riwayat belanja pelanggan | ✅ | ✅ | ⚠️ Terbatas | ❌ | ✅ |
| Lihat segmentasi & churn | ✅ | ✅ (outletnya) | ❌ | ❌ | ❌ |
| Kirim WA ke pelanggan | ✅ | ✅ | ❌ | ❌ | ⚠️ Template saja |
| **Laporan & BI** | | | | | |
| Omzet seluruh outlet | ✅ | ❌ | ❌ | ❌ | ❌ |
| Omzet outletnya | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Laba & HPP** | ✅ | ❌ | ❌ | ❌ | ❌ |
| Laporan stok | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Administrasi** | | | | | |
| Kelola karyawan & PIN | ✅ | ⚠️ Outletnya | ❌ | ❌ | ❌ |
| Tambah/hapus outlet | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ubah profil toko & struk (alamat, telepon, penutup struk) | ✅ | ✅ (outletnya) | ❌ | ❌ | ❌ |
| Kelola distributor | ✅ | ✅ | ❌ | ✅ | ❌ |

> ### ⚠️ Batas gerbang diskon
>
> "Diskon manual >20% → PIN manager" ditegakkan **di klien** (`lib/pos/diskon.ts` +
> `POST /approvals/verify`), bukan di server. Itu bukan kelalaian: **transaksi offline
> selalu diterima** (CLAUDE.md §6 invarian #4 — barangnya sudah keluar, menolak sync berarti
> menghapus penjualan nyata), jadi tidak ada titik di server tempat diskon besar bisa ditolak
> tanpa membuang transaksi yang benar-benar terjadi.
>
> Artinya gerbang ini mencegah penyalahgunaan biasa, **bukan** kasir yang sengaja mematikan
> koneksi. Pengawasan sesungguhnya ada di laporan: diskon per transaksi terlihat di
> [tutup buku](../50-operations/GO-LIVE.md) harian, dan pola diskon besar oleh satu kasir
> akan menonjol di sana. Bila kelak dibutuhkan penegakan yang lebih keras, jalurnya adalah
> mencatat `approved_by` pada transaksi (butuh migrasi), bukan menolak sync.

> ### ⚠️ Konflik yang harus diputuskan: Gudang vs HPP
>
> Gudang menerima barang dari distributor — dan penerimaan barang **mencantumkan harga beli**.
> Padahal matriks lama menetapkan HPP **hanya untuk Owner**
> ([SECURITY.md](./SECURITY.md) §3), dan itu memang perlindungan penting: margin usaha adalah
> informasi paling sensitif bagi pemilik UMKM.
>
> Tiga pilihan:
>
> | Opsi | Konsekuensi |
> |---|---|
> | Gudang boleh input harga beli | HPP bocor ke staf gudang |
> | **Gudang input jumlah saja; harga menyusul dari faktur oleh Owner/Manager** | ✅ **Disarankan** — memisahkan alur fisik dari alur keuangan |
> | Penerimaan barang jadi tugas Manager | Beban manager bertambah, gudang jadi setengah berguna |
>
> Opsi kedua juga lebih benar secara akuntansi: barang bisa datang sebelum fakturnya.

### SPG memunculkan kebutuhan yang selama ini hilang

SPG membuat keranjang, kasir yang menyelesaikan pembayaran. Alur ini membutuhkan
**pesanan tertahan (*held order*)** — salah satu dari tiga kebutuhan kasir sehari-hari yang
saya catat belum tercakup FR mana pun ([ROADMAP](../00-product/ROADMAP.md) §5).

Menambahkan SPG berarti fitur itu **wajib** ada, bukan opsional lagi.

---

## 3. Kelas 1 — Super Admin (Platform)

`super_admin` adalah **kita**, bukan pengguna tenant. Ia tidak boleh berada di tabel `users`.

### Aturan yang tidak bisa ditawar

| # | Aturan | Alasan |
|---|---|---|
| 1 | Disimpan di tabel **`platform_admins`** terpisah | Tidak punya `tenant_id`; menaruhnya di `users` mengundang kesalahan kueri |
| 2 | **Tanpa akses default ke data tenant** | Akses adalah pengecualian, bukan bawaan |
| 3 | Akses data tenant lewat **break-glass**: beralasan, berbatas waktu | |
| 4 | **Setiap** aksi tercatat di `audit_logs` yang terlihat **oleh tenant** | Tenant berhak tahu siapa membuka datanya |
| 5 | **Tidak bisa membaca PII pelanggan** tanpa persetujuan eksplisit tenant | Kewajiban PDP ([COMPLIANCE-ID](./COMPLIANCE-ID.md)) |
| 6 | **Tidak bisa membuat transaksi** atau mengubah data keuangan | Menjaga audit trail tetap bermakna |
| 7 | Wajib 2FA | Akun paling bernilai di seluruh sistem |

```
Super admin butuh akses tenant
   └─► buat sesi break-glass: alasan + durasi (maks 4 jam)
       ├─► tenant diberi tahu
       ├─► setiap kueri tercatat
       └─► otomatis kedaluwarsa
```

> **Tanpa mekanisme ini, super admin menjadi pintu belakang permanen** yang menggugurkan
> seluruh janji isolasi tenant. Dukungan pelanggan memang membutuhkan akses — tetapi akses
> yang terpantau dan berbatas waktu, bukan akses diam-diam yang selalu terbuka.

---

## 4. Kelas 3 — Pihak Eksternal

### Bentuk identitas

```
identities                    ← login global (email/telepon + kredensial)
    │
    ├── customer_links   (identity ↔ customers.id per tenant)
    └── distributor_links (identity ↔ distributors.id, banyak tenant)
```

Satu orang bisa jadi pelanggan Kopi Senja **dan** Roti Manis dengan satu login — tetapi
**tidak boleh tahu** bahwa ia punya hubungan dengan tenant lain kecuali ia sendiri membukanya.

### Customer

| Boleh | Tidak boleh |
|---|---|
| Lihat riwayat belanjanya sendiri | Melihat data pelanggan lain |
| Unduh e-struk | Melihat stok, harga beli, atau data toko |
| **Kelola persetujuan (consent)** | Mengubah transaksi |
| Perbarui data dirinya | |

> Baris "kelola consent" bukan sekadar fitur — ia adalah **cara pelanggan menjalankan haknya
> menurut UU PDP**. Portal pelanggan mengubah kewajiban PDP dari beban menjadi mekanisme
> yang tertata.

### Distributor

| Boleh | Tidak boleh |
|---|---|
| Menerima & mengonfirmasi pesanan restock | Melihat penjualan atau margin tenant |
| Memperbarui daftar harga & ketersediaan | Melihat data pelanggan |
| Memperbarui status pengiriman | Melihat tenant lain yang dilayaninya |

**Ini mengubah FR-50 secara mendasar.** Sekarang FR-50 hanya "kirim pesan WhatsApp ke
distributor". Dengan portal, ia menjadi **alur B2B dua arah** — pesanan, konfirmasi, harga,
pengiriman. Itu bukan penambahan peran; itu produk tambahan.

> **Peringatan ruang lingkup:** portal distributor adalah pekerjaan besar dan menyentuh
> Non-Goals "marketplace pemasok" ([VISION-SCOPE](../00-product/VISION-SCOPE.md) §6).
> Bila dikerjakan, harus melalui ADR tersendiri.

---

## 5. Bentuk Skema

Kolom `role VARCHAR(20)` di `users` tidak lagi memadai.

```sql
-- Kelas 1
CREATE TABLE platform_admins (
    id VARCHAR(26) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    totp_secret VARCHAR(255) NOT NULL,        -- 2FA wajib
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE breakglass_sessions (
    id VARCHAR(26) PRIMARY KEY,
    admin_id VARCHAR(26) NOT NULL REFERENCES platform_admins(id),
    tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id),
    reason TEXT NOT NULL,
    ticket_ref VARCHAR(100),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,   -- maks 4 jam
    ended_at TIMESTAMP WITH TIME ZONE,
    tenant_notified_at TIMESTAMP WITH TIME ZONE
);

-- Kelas 2: users tetap, role diperluas
-- role: owner | manager | cashier | warehouse | sales_floor
-- Cakupan outlet lewat user_outlet_assignments (MULTI-OUTLET §3)

-- Kelas 3
CREATE TABLE identities (
    id VARCHAR(26) PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(30) UNIQUE,
    password_hash VARCHAR(255),
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_links (
    id VARCHAR(26) PRIMARY KEY,
    identity_id VARCHAR(26) NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id VARCHAR(26) NOT NULL REFERENCES customers(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_customer_link ON customer_links(identity_id, tenant_id);

CREATE TABLE distributors (
    id VARCHAR(26) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(30),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE distributor_tenant_links (      -- satu distributor, banyak tenant
    id VARCHAR(26) PRIMARY KEY,
    distributor_id VARCHAR(26) NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
    tenant_id VARCHAR(26) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE
);
CREATE UNIQUE INDEX idx_dist_tenant ON distributor_tenant_links(distributor_id, tenant_id);
```

> **Middleware tenant harus tahu kelas principal-nya.** `TenantMiddleware`
> ([SECURITY.md](./SECURITY.md) §2A) saat ini mengasumsikan setiap request punya satu
> `tenant_id` dari JWT. Itu tidak berlaku untuk super admin (banyak tenant) maupun distributor
> (banyak tenant). **Ini perubahan yang menyentuh setiap endpoint** — dan alasan dokumen ini
> berstatus P0.

---

## 6. Katalog Lengkap Peran (Mini ERP)

> Ditambahkan 21 Agustus 2026 atas permintaan pemilik produk: *"rekomendasikan semua role
> yang dapat kamu berikan"*, dengan arah produk menjadi **mini ERP**.

### ⚠️ Peringatan lebih dulu: ledakan peran adalah cara ERP mati

Daftar di bawah berisi **18 peran**. Sebelum memakainya, pahami biayanya:

* Matriks uji isolasi tenant tumbuh **18× lipat**, bukan bertambah 18 baris
  ([TESTING-STRATEGY](../60-quality/TESTING-STRATEGY.md) §3B)
* UMKM dengan 5 karyawan hanya akan memakai 3–4 dari daftar ini
* Setiap peran yang jarang dipakai tetap harus diuji, dipelihara, dan didokumentasikan

**Karena itu §7 mengusulkan model berbasis izin, bukan peran keras.** Daftar ini adalah
*preset*, bukan 18 cabang `if` di dalam kode.

### Kelas 1 — Platform (tim kami)

| Peran | Untuk | Batas |
|---|---|---|
| `super_admin` | Operasional platform | Break-glass, 2FA, tenant diberi tahu (§3) |
| `support_agent` | Dukungan pelanggan | Break-glass **baca saja**; tidak bisa mengubah data |
| `billing_admin` | Langganan & tagihan | **Hanya** data langganan — tidak pernah data bisnis tenant |

> Memisahkan `support_agent` dari `super_admin` itu penting: dukungan pelanggan adalah
> pekerjaan harian, dan memberi akses tulis penuh untuk pekerjaan harian menghapus makna
> audit trail.

### Kelas 2 — Staf Tenant

**Inti (Fase 0–1):**

| Peran | Inti pekerjaan | Modul ERP |
|---|---|---|
| `owner` | Pemilik — akses penuh | Semua |
| `manager` | Penyelia outlet, rekonsiliasi kas | Sales, Inventory |
| `cashier` | Transaksi | Sales |
| `warehouse` | Terima barang, opname, transfer | Inventory |
| `sales_floor` (SPG) | Layani pelanggan, pesanan tertahan | Sales, CRM |

**Pertumbuhan (Fase 2+) — inilah jembatan "UMKM → perusahaan":**

| Peran | Inti pekerjaan | Kenapa penting untuk naik kelas |
|---|---|---|
| `area_manager` | Penyelia **beberapa outlet** | 🔑 Saat outlet >5, owner tidak bisa mengawasi satu per satu. **Tanpa peran ini, pertumbuhan berhenti di kapasitas owner.** |
| `finance` | Laporan keuangan, rekonsiliasi, pajak | Melihat laba & HPP tanpa bisa menyentuh kasir |
| `purchasing` | PO ke distributor, negosiasi harga | Memisahkan *siapa memesan* dari *siapa menerima* — kontrol anti-fraud klasik |
| `hr` | Karyawan, jadwal shift, absensi | Owner berhenti mengurus jadwal manual |
| `marketing` | Kampanye CRM, promo | Akses PII pelanggan **tanpa** akses keuangan |
| `production` | Bahan baku, resep (BOM), produksi | 🔑 Untuk bakery & kafe — mengubah "beli bahan" jadi **harga pokok produksi yang benar** |
| `auditor` | **Baca saja, seluruh tenant** | Risiko nol, nilai tinggi. Untuk audit internal & pemeriksaan. |

> **`purchasing` vs `warehouse` adalah pemisahan tugas klasik.** Orang yang memesan barang
> tidak boleh orang yang mengonfirmasi barang datang — itu pintu penggelapan paling umum di
> perusahaan yang mulai besar. Di UMKM kecil keduanya satu orang, dan itu wajar; sistem harus
> **memungkinkan** pemisahan saat mereka siap, bukan memaksakannya sejak awal.

> **`production` adalah pintu masuk ke wilayah manufaktur.** Begitu ada resep/BOM, HPP
> berhenti menjadi "harga beli" dan menjadi "biaya bahan + susut + tenaga". Bagi bakery,
> inilah selisih antara *merasa untung* dan *tahu untung*. Tetapi ini juga modul ERP paling
> berat — jangan dikerjakan sebelum ada tenant yang benar-benar memintanya.

### Kelas 3 — Pihak Eksternal

| Peran | Akses | Catatan |
|---|---|---|
| `customer` | Riwayat sendiri, e-struk, kelola consent | Fase 2 |
| `distributor` | Pesanan, konfirmasi, harga, pengiriman | Fase 3 — butuh ADR |
| `external_accountant` | **Baca saja** laporan keuangan | 🔑 Sangat umum di Indonesia — UMKM pakai jasa akuntan luar. Murah dibangun, nilainya besar. |
| `franchisee` | Outletnya sendiri, terikat aturan pusat | Hanya bila model bisnis waralaba muncul |

> **`external_accountant` adalah peran dengan rasio nilai-terhadap-biaya tertinggi di seluruh
> daftar ini.** Ia hanya membaca, tidak menambah permukaan serangan tulis, dan menghapus
> pekerjaan ekspor-kirim-Excel yang selama ini manual. Layak dinaikkan ke Fase 2.

---

## 7. 🔑 Rekomendasi Utama: Izin, Bukan Peran Keras

Menaruh 18 peran ke dalam `role VARCHAR(20)` akan mengulang kesalahan yang sama seperti
menaruh tujuh peran di sana — hanya lebih parah.

**Rancangan yang disarankan:**

```
permissions            ← izin granular: pos.checkout, stock.receive,
                          finance.view_pnl, crm.view_pii, catalog.edit_cost, ...
role_templates         ← preset bawaan: owner, manager, cashier, warehouse, ...
tenant_custom_roles    ← tenant boleh menyusun peran sendiri saat tumbuh
user_permissions       ← pengecualian per orang
```

```sql
CREATE TABLE role_templates (
    id VARCHAR(26) PRIMARY KEY,
    tenant_id VARCHAR(26) REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = bawaan sistem
    code VARCHAR(40) NOT NULL,
    name VARCHAR(100) NOT NULL,
    permissions JSONB NOT NULL,        -- ["pos.checkout","stock.view",...]
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX idx_role_template ON role_templates(COALESCE(tenant_id,'SYSTEM'), code);
```

### Kenapa ini justru **mewujudkan** visi "UMKM jadi perusahaan besar"

| Tahap usaha | Yang terjadi |
|---|---|
| Warung, 3 orang | Pakai 3 preset bawaan. Tidak pernah melihat kata "izin". |
| 2 outlet, 8 orang | Aktifkan preset `warehouse` & `sales_floor` |
| 5 outlet, 25 orang | Aktifkan `area_manager`, `purchasing`; **pisahkan tugas** |
| 15 outlet, PT | Susun peran sendiri, undang akuntan eksternal, audit internal |

**Struktur organisasi mereka tumbuh, sistemnya ikut — tanpa kami merilis versi baru.**
Itu perbedaan antara alat kasir dan sistem yang menemani usaha naik kelas.

Sebaliknya, dengan peran keras: setiap kali ada tenant yang strukturnya sedikit berbeda,
mereka harus menunggu kami menambah peran baru. Itu cara ERP tradisional bekerja — dan
alasan ERP tradisional terasa kaku.

---

## 6. Pentahapan yang Disarankan

| Fase | Peran | Alasan |
|---|---|---|
| **0** | owner, manager, cashier | Sudah ada |
| **0** | **super_admin + break-glass** | Dibutuhkan untuk mendukung toko percontohan — **bangun mekanismenya sejak awal**, jangan ditambal belakangan |
| **1** | warehouse, sales_floor (SPG) | Butuh fitur pesanan tertahan lebih dulu |
| **1** | **model izin (§7)** | Bangun sebelum peran menumpuk — menambal belakangan berarti migrasi seluruh otorisasi |
| **2** | auditor, finance, external_accountant | Baca saja — risiko rendah, nilai tinggi |
| **2** | customer portal | Setelah CRM matang; membuka auth ke publik |
| **2** | area_manager | Saat ada tenant dengan >3 outlet |
| **3** | purchasing, hr, marketing | Saat modul ERP terkait dibangun |
| **3** | distributor portal | Pekerjaan besar; butuh ADR tersendiri |
| **4** | production (BOM), franchisee | Hanya bila ada permintaan nyata |

> **Super admin sengaja ditaruh di Fase 0.** Bukan karena mendesak secara fitur, tetapi karena
> menambal jalur akses lintas-tenant ke sistem yang sudah berjalan jauh lebih berbahaya
> daripada merancangnya sejak awal.
