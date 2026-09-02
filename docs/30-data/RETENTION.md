# Retensi & Siklus Hidup Data

> **Status:** 🟡 Draft · **Prioritas:** 🟡 P2 — **kecuali** bagian hukum, yang menunggu `COMPLIANCE-ID.md`

---

## 1. Ketegangan yang Harus Diselesaikan

Tiga kekuatan menarik ke arah berbeda:

| Kekuatan | Menginginkan |
|---|---|
| **Biaya** | Buang data lama; VPS tunggal punya ruang terbatas |
| **Hukum** | Simpan bukti transaksi bertahun-tahun |
| **Paket langganan** | Retensi audit log 30 hari (Free) s.d. 24 bulan | 

Batas paket di [PRICING-PACKAGING.md](../00-product/PRICING-PACKAGING.md) §3 **tidak boleh
melanggar kewajiban hukum**. Bila hukum mewajibkan penyimpanan 5 tahun, "retensi 30 hari"
pada paket Free berarti **membatasi akses baca**, bukan menghapus data.

> Perbedaan itu penting dan mudah salah diterapkan: **paket membatasi apa yang bisa dilihat,
> bukan apa yang kami simpan.**

---

## 2. Usulan Retensi

| Data | Retensi aktif | Arsip | Catatan |
|---|---|---|---|
| `sales_transactions`, `sales_items`, `payments` | Selamanya | — | Bukti keuangan; **jangan hapus** |
| `audit_logs` | 24 bulan | Arsip dingin | Append-only (SECURITY §6) |
| `stock_events` | 24 bulan | Agregat bulanan | Ledger; ringkas, jangan hapus |
| `sync_receipts` | **7 hari** | — | Sudah ditetapkan di [DATA-MODEL.md](./DATA-MODEL.md) §3F |
| `webhook_events` | 90 hari | — | Setelah rekonsiliasi settlement selesai |
| `background_jobs` | 30 hari | — | Kecuali yang `dead_letter` |
| `event_outbox` | 7 hari setelah terbit | — | |
| `restock_predictions` | 90 hari | — | Kecuali yang punya `prediction_outcomes` |
| Data analytics | 12 bulan | Agregat | |
| **Data sandbox** | Sampai dihapus tenant | — | Lihat [ONBOARDING](../00-product/ONBOARDING-ACTIVATION.md) §6 |

---

## 3. Penghapusan Tenant

Ini bagian tersulit, karena bertemu dengan hak pengguna atas datanya.

```
Tenant berhenti berlangganan
   │
   ├─ 0–90 hari   : data utuh, ekspor penuh tersedia
   │                (janji di PRICING §5)
   ├─ 90 hari     : akun ditutup, data dianonimkan sebagian
   │                data pribadi dihapus, catatan keuangan disimpan
   └─ setelah masa wajib simpan : penghapusan penuh
```

**Apa yang dianonimkan, bukan dihapus:** nama & email pengguna, nomor telepon pelanggan.
**Apa yang tetap disimpan:** nominal transaksi, waktu, dan audit trail — karena kewajiban
pembukuan biasanya melekat pada usaha, bukan pada langganan kita.

> Batas persisnya belum bisa ditetapkan tanpa `40-security/COMPLIANCE-ID.md`.
> **Jangan implementasikan penghapusan permanen sebelum dokumen itu selesai** — penghapusan
> tidak bisa dibatalkan, dan salah menghapus bukti transaksi orang lain jauh lebih mahal
> daripada menyimpan terlalu lama.

---

## 4. Yang Harus Ditetapkan

- [ ] Masa wajib simpan bukti transaksi menurut ketentuan Indonesia
- [ ] Kewajiban penghapusan data pribadi menurut UU PDP, dan bagaimana ia berinteraksi
      dengan kewajiban pembukuan di atas
- [ ] Media arsip dingin (S3 Glacier atau setara)
- [ ] Apakah pemulihan dari arsip adalah layanan berbayar?
