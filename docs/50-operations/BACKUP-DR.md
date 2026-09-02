# Backup & Disaster Recovery

> **Status:** 🟡 Draft · **Prioritas:** 🟠 P1
> **Dokumen Terkait:** [DOKPLOY.md](./DOKPLOY.md) §5, [CONFIGURATION.md](./CONFIGURATION.md) §6

---

## 1. Apa yang Sebenarnya Dipertaruhkan

Ini menyimpan catatan keuangan UMKM sungguhan. Kehilangan data di sini berarti pemilik
kehilangan pembukuannya — kerugian yang tidak bisa kami ganti dengan permintaan maaf.

---

## 2. RPO & RTO

| Skenario | RPO (data yang boleh hilang) | RTO (waktu pulih) |
|---|---|---|
| Kehilangan database | **≤ 1 jam** | ≤ 4 jam |
| VPS hilang total | ≤ 1 jam | **≤ 8 jam** |
| Kerusakan data akibat migrasi | ≤ 1 jam | ≤ 2 jam |
| Kehilangan perangkat kasir | Transaksi belum tersinkron | Segera (ganti perangkat) |

> **RTO 8 jam dapat diterima hanya karena offline-first.** Toko tetap berjualan selama VPS
> mati. Namun batas ini nyata: makin lama VPS mati, makin dekat IndexedDB ke penuh
> ([OFFLINE-SYNC-SPEC.md](../30-data/OFFLINE-SYNC-SPEC.md) §4). **8 jam adalah batas aman,
> bukan target santai.**

Baris terakhir sering terlewat: transaksi yang ada di perangkat hilang **tidak ada di mana
pun**. Ini satu-satunya kehilangan data yang tidak dapat dicegah backup server — dan alasan
kuat untuk mendorong sinkronisasi sesering mungkin.

---

## 3. Cakupan Backup

| Yang dicadangkan | Cara | Frekuensi | Ditangani Dokploy? |
|---|---|---|---|
| PostgreSQL | Dump ke S3 | Setiap jam | ✅ |
| Volume Docker (aset upload) | Sinkron ke S3 | Harian | ⚠️ Verifikasi |
| **Konfigurasi Dokploy** | Ekspor manual | Setiap perubahan | ❌ **Tanggung jawab kita** |
| **Rahasia environment** | Pengelola kata sandi | Setiap perubahan | ❌ Lihat [CONFIGURATION.md](./CONFIGURATION.md) §6 |
| Berkas migrasi | Git | Tiap commit | ✅ |
| Redis | — | — | ❌ **Sengaja tidak** — murni cache |

Baris `Redis` sengaja kosong: setelah perbaikan di
[REDIS-STRATEGY.md](../10-architecture/REDIS-STRATEGY.md) §3, Redis tidak menyimpan apa pun
yang tidak bisa dibangun ulang. Ini penyederhanaan yang berharga.

**Retensi:** 24 backup per jam, 30 harian, 12 bulanan. Simpan di **region berbeda** dari VPS.

---

## 4. Aturan yang Tidak Bisa Ditawar

> **Backup yang belum pernah di-restore bukan backup.** Ia hanya berkas yang membuat kita
> merasa aman.

- [ ] **Uji restore setiap bulan** ke lingkungan terpisah
- [ ] Catat waktu yang dibutuhkan — inilah RTO sesungguhnya, bukan yang di tabel §2
- [ ] Verifikasi jumlah baris dan total transaksi hari terakhir
- [ ] Dokumentasikan setiap langkah manual yang ternyata dibutuhkan

Sampai langkah-langkah ini pernah dijalankan, angka RTO di §2 adalah **harapan**, bukan fakta.

---

## 5. Prosedur Pemulihan

### A. Database rusak/hilang

```
1. Hentikan pos-engine & web-app (cegah tulis)
2. Konfirmasi kasir tetap berjualan offline  ← beri tahu tenant
3. Ambil backup terbaru dari S3
4. Restore ke instans bersih
5. Verifikasi: jumlah transaksi, saldo shift terakhir
6. Nyalakan layanan
7. Perangkat mengirim ulang antrean → celah ≤1 jam tertutup sendiri
```

> Langkah 7 adalah keunggulan tak terduga dari desain offline-first: **antrean lokal
> perangkat berfungsi sebagai lapisan backup kedua.** Transaksi dalam RPO 1 jam yang hilang
> di server sebagian besar masih ada di perangkat dan akan tersinkron ulang.

### B. VPS hilang total

```
1. Sediakan VPS baru
2. Pasang Dokploy
3. Pulihkan konfigurasi Dokploy + rahasia (dari luar VPS!)
4. Restore database
5. Arahkan DNS
6. Terbitkan ulang sertifikat TLS
7. Verifikasi ujung-ke-ujung sebelum mengumumkan pulih
```

**Langkah 3 adalah titik kegagalan yang paling mungkin.** Bila rahasia hanya ada di VPS yang
hilang, langkah ini mustahil dan seluruh prosedur berhenti di sini.

---

## 6. Komunikasi Insiden

| Kepada | Kapan | Isi |
|---|---|---|
| Tenant terdampak | Dalam 30 menit | "Sinkronisasi tertunda. **Kasir tetap berfungsi normal.**" |
| Semua tenant | Bila >2 jam | Perkiraan pemulihan |
| Setelah pulih | Dalam 24 jam | Apa yang terjadi, dampak data, pencegahan |

Pesan pertama adalah yang paling penting: pemilik toko perlu segera tahu bahwa **mereka tetap
bisa berjualan**. Tanpa itu, mereka akan panik dan kembali ke nota tulis tangan.

---

## 7. Yang Harus Ditetapkan

- [x] ✅ **Cloudflare R2** — tanpa biaya egress, penyedia berbeda dari Hostinger
- [ ] Siapa yang dihubungi saat insiden, dan cadangannya
- [ ] Jadwal uji restore bulanan — masukkan ke kalender, bukan niat
- [ ] Verifikasi apakah Dokploy benar-benar mencadangkan volume
