# Runbook: Sinkronisasi Macet

**Gejala:** `sync_queue_depth` naik terus · tenant melapor transaksi tidak muncul di dasbor

## 0. Nilai keparahan
Kasir masih bisa bertransaksi? → **Ya** hampir selalu. Ini **bukan** keadaan darurat,
tetapi jam terus berjalan menuju IndexedDB penuh.

## 1. Tentukan cakupan
- Satu perangkat / satu tenant / semua? → cek metrik `sync_queue_depth` per `device_id`
- Semua tenant → masalah server. Satu perangkat → masalah perangkat/jaringan.

## 2. Periksa server
```bash
docker ps                      # pos-engine hidup?
docker logs --tail 200 pos-engine | grep -i "sync\|error"
```
- `DATABASE_UNAVAILABLE` → lihat [database-full.md](./database-full.md)
- Latensi tinggi → periksa pool koneksi DB; **worker Python bisa menguras pool**

## 3. Periksa antrean mati
```sql
SELECT code, count(*) FROM sync_failures
WHERE created_at > now() - interval '2 hours' GROUP BY code;
```
- Banyak `INVALID_TRANSACTION_TOTAL` → 🔴 **eskalasi**: rumus klien & server tidak cocok
- Banyak `SHIFT_CLOSED` → normal, itu penerimaan terlambat

## 4. Head-of-line blocking
Bila satu transaksi menghalangi seluruh antrean:
1. Identifikasi ID-nya di log perangkat
2. Pastikan kelas error-nya **PERMANENT** ([ERROR-CATALOG](../../20-api/ERROR-CATALOG.md) §2)
3. Pindahkan ke antrean mati agar sisanya lewat — **jangan hapus**

## 5. Bila perangkat mendekati penuh
Prioritas: buang cache gambar → antrean analytics → katalog. **Jangan pernah transaksi.**

## 6. Setelah pulih
- [ ] Verifikasi antrean kembali ke 0
- [ ] Bandingkan jumlah transaksi perangkat vs server
- [ ] Catat penyebab; bila berulang, buat perbaikan permanen
