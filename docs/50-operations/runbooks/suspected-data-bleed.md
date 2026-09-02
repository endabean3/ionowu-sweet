# 🔴 Runbook: Dugaan Kebocoran Data Antar-Tenant

**Gejala:** tenant melihat data tenant lain · kueri mengembalikan `tenant_id` bercampur

> Ini kegagalan paling fatal dalam sistem ini
> ([SECURITY.md](../../40-security/SECURITY.md) §1). SLO-nya **nol, selamanya**
> ([OBSERVABILITY](../OBSERVABILITY.md) §2). Perlakukan sebagai insiden kritis sejak menit pertama.

## 1. Segera — 5 menit pertama
1. **Jangan restart apa pun.** Bukti ada di memori dan log.
2. Tangkap bukti: tangkapan layar, `request_id`, waktu, tenant terdampak
3. Beri tahu penanggung jawab keamanan
4. **Hentikan seluruh rilis** sampai tuntas

## 2. Tentukan jalurnya
| Jalur | Cara memeriksa |
|---|---|
| **SQL tanpa `WHERE tenant_id`** | Cari kueri terkait di kode; ini penyebab paling umum |
| **Kunci cache Redis tanpa `tenant_id`** | `redis-cli --scan` — apakah ada kunci tanpa tenant? |
| **JWT salah `tenant_id`** | Periksa klaim token pada `request_id` terkait |
| **Middleware tenant terlewat** | Apakah endpoint itu melewati `TenantMiddleware`? |

> Jalur Redis paling mudah terlewat: ia **tidak tertangkap oleh review SQL mana pun**
> ([REDIS-STRATEGY](../../10-architecture/REDIS-STRATEGY.md) §4).

## 3. Batasi
- Endpoint terdampak → nonaktifkan sementara bila memungkinkan
- Cache tercemar → `FLUSHDB` (aman; Redis murni cache)
- Bila jalurnya JWT → cabut token terdampak

## 4. Nilai dampak
```sql
SELECT tenant_id, count(*) FROM audit_logs
WHERE created_at BETWEEN $1 AND $2 GROUP BY tenant_id;
```
Tentukan: data tenant mana yang terlihat, oleh siapa, berapa lama, apakah tersalin keluar.

## 5. Perbaiki & verifikasi
- [ ] Perbaikan disertai uji regresi khusus
- [ ] Audit **seluruh** kueri sejenis, bukan hanya yang dilaporkan
- [ ] Pertimbangkan RLS PostgreSQL sebagai jaring pengaman kedua
- [ ] Verifikasi di staging dengan dua tenant sebelum rilis

## 6. Kewajiban pengungkapan
Kebocoran data pribadi kemungkinan besar memicu kewajiban pelaporan
([COMPLIANCE-ID](../../40-security/COMPLIANCE-ID.md) §2A). **Konsultasikan sebelum berkomunikasi keluar** —
tetapi jangan menunda pemberitahuan kepada tenant terdampak lebih lama dari yang diperlukan.

## 7. Postmortem wajib
Tanpa menyalahkan orang. Jawab: kenapa lolos dari review, kenapa lolos dari uji, dan
apa yang membuatnya mustahil terulang.
