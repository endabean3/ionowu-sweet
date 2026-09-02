# Go-Live — Checklist Rilis Produksi Pertama

> **Status:** 🟡 Draft · **Fase E** dari [15-development/README.md](../15-development/README.md)
> **Sifat:** gerbang sekali jalan. Rilis berikutnya memakai [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## 1. Prinsip

> Go-live yang baik **tidak menghasilkan kejutan**, karena setiap prosedur sudah pernah
> dijalankan di staging.

Bila ada satu saja baris di bawah yang belum pernah benar-benar dicoba, ia akan dicoba
pertama kali di produksi — dengan uang pelanggan sungguhan di dalamnya.

---

## 2. Gerbang Sebelum Go-Live

### A. Kode & Kualitas

- [ ] Seluruh fitur Fase 0 selesai ([ROADMAP](../00-product/ROADMAP.md) §3)
- [ ] CI hijau di `main`
- [ ] **Uji paritas rumus uang Go ↔ TS lulus**
- [ ] **Uji isolasi tenant lulus untuk seluruh endpoint**
- [ ] Uji offline lulus, termasuk 10.000 transaksi di IndexedDB
- [ ] Budget performa terpenuhi
- [ ] `navigator.storage.persist()` dipanggil & keberhasilannya dipantau

### B. Server (Fase C)

- [ ] Seluruh gerbang [SERVER-PROVISIONING](./SERVER-PROVISIONING.md) §3 ✅
- [ ] `nmap` dari luar diulang sekali lagi — **hanya 22, 80, 443**

### C. Data

- [ ] Migrasi awal dijalankan & diverifikasi di staging
- [ ] **Restore backup sudah pernah dilakukan** dan waktunya dicatat
- [ ] Pengguna `app_readonly` dibuat; `web` memakainya
- [ ] Retensi `sync_receipts` (7 hari) terjadwal

### D. Keamanan

- [ ] Rahasia produksi **berbeda** dari staging
- [ ] Kunci JWT produksi dibuat baru, tidak pernah ada di repo
- [ ] Zero-Sensitive-Logging diverifikasi pada log nyata
- [ ] Rate limit aktif & teruji
- [ ] Auto-lock PIN kasir 5 menit berfungsi **saat offline**

### E. Operasional

- [ ] Alarm kritis terpasang & **sudah pernah berbunyi saat diuji**
- [ ] Setiap alarm kritis punya runbook ([runbooks/](./runbooks/))
- [ ] Uptime monitor eksternal aktif
- [ ] Ada penanggung jawab yang siap dihubungi
- [ ] **Rollback pernah diuji di staging**

### F. Produk

- [ ] Toko percontohan sudah setuju dan tahu ini rilis pertama
- [ ] Katalog toko percontohan sudah masuk
- [ ] Kasir sudah dilatih (target: satu shift)
- [ ] **Rencana cadangan disepakati** — bila sistem gagal, toko kembali ke cara lama tanpa
      kehilangan penjualan hari itu

> Poin terakhir bukan tanda pesimisme, melainkan syarat agar toko percontohan bersedia
> mencoba. Menghilangkan risiko bagi mereka adalah bagian dari kesepakatan.

---

## 3. Urutan Hari Go-Live

Pilih hari yang **sepi dan bukan Jumat** — jangan rilis saat tidak ada yang berjaga besok.

```
H-1  Backup penuh + verifikasi
     Konfirmasi ulang rahasia di Dokploy
     Beri tahu toko percontohan

Hari-H, 05.00 WIB  (sebelum toko buka)
  1. Verifikasi CI hijau, catat SHA yang akan dirilis
  2. Jalankan migrasi awal        → verifikasi skema
  3. Dokploy tarik image :<sha>   → verifikasi health check
  4. Uji asap (§4)
  5. Buat akun tenant percontohan
  6. Verifikasi PWA terpasang di perangkat kasir

08.00  Toko buka · dampingi langsung
       Pantau: latensi checkout, antrean sync, error

Sepanjang hari  Catat setiap kejanggalan, sekecil apa pun

Tutup toko  Verifikasi Z-Report cocok dengan uang fisik
```

---

## 4. Uji Asap (sebelum toko buka)

Dijalankan pada tenant uji, bukan tenant percontohan:

- [ ] Daftar tenant → outlet → 3 produk
- [ ] Buka shift dengan saldo awal
- [ ] Transaksi tunai → **struk tercetak**
- [ ] **Matikan Wi-Fi perangkat** → transaksi kedua → struk tetap tercetak
- [ ] Nyalakan kembali → transaksi tersinkron, **tidak ada duplikat**
- [ ] Tutup shift → variance benar
- [ ] Login sebagai tenant lain → **data tenant pertama tidak terlihat**
- [ ] Hapus tenant uji

> Baris keempat sampai keenam adalah inti produk. Bila salah satunya gagal, **jangan
> lanjutkan go-live** — tunda, perbaiki, ulangi.

---

## 5. Pemicu Rollback

Rollback segera bila:

| Pemicu | |
|---|---|
| Transaksi gagal tersimpan | 🔴 |
| Selisih total antara struk dan server | 🔴 |
| Ada data tenant lain terlihat | 🔴 |
| Antrean sync tidak terkirim >30 menit | 🔴 |
| Latensi checkout >500ms terus-menerus | 🟠 |

Prosedur: tarik tag SHA sebelumnya di Dokploy
([DEPLOYMENT](./DEPLOYMENT.md) §5). Skema tidak dibalik — migrasi expand kompatibel mundur.

> **Kasir tetap dapat berjualan offline selama rollback berlangsung.** Ini yang membuat
> rollback di sistem ini jauh lebih aman daripada di POS berbasis cloud biasa.

---

## 6. Setelah Go-Live

**Minggu pertama** — periksa harian: antrean sync kosong, variance terjelaskan, tidak ada
error baru, kasir tidak kembali ke nota tulis tangan.

**Setelah 7 hari** — evaluasi terhadap kriteria lulus Fase 0
([ROADMAP](../00-product/ROADMAP.md) §3):

- [ ] Toko berjualan 7 hari berturut-turut sebagai satu-satunya kasir
- [ ] Minimal satu kejadian offline nyata tertangani tanpa kehilangan data
- [ ] Selisih kas dapat dijelaskan setiap hari
- [ ] Kasir baru bisa dilatih dalam satu shift

Bila belum terpenuhi, **jangan lanjut ke Fase 1.** Perbaiki dulu — menambah tenant di atas
fondasi yang belum terbukti hanya menggandakan masalah.
