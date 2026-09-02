# 40-security — Model Keamanan Aplikasi

Folder ini mengatur keamanan **aplikasi**: siapa boleh melakukan apa, bagaimana kredensial
dilindungi, bagaimana tenant diisolasi.

Keamanan **mesin** — firewall, SSH, paparan port — ada di
[50-operations/NETWORK-HARDENING.md](../50-operations/NETWORK-HARDENING.md). Keduanya bisa
gagal secara terpisah: RBAC sesempurna apa pun tidak menolong bila port 5432 terbuka.

| # | Dokumen | Isi | Status |
|:-:|---|---|:---:|
| 1 | [SECURITY.md](./SECURITY.md) | Baseline: tenancy, RBAC, kredensial, webhook, audit | ✅ |
| 2 | [RBAC-MODEL.md](./RBAC-MODEL.md) | **Tujuh peran, tiga kelas principal** | 🟡 Draft · 🔴 P0 |
| 3 | [THREAT-MODEL.md](./THREAT-MODEL.md) | Analisis STRIDE & risiko terbuka | 🟡 Draft |
| 4 | [COMPLIANCE-ID.md](./COMPLIANCE-ID.md) | Kerangka pertanyaan hukum | 🔴 Butuh nasihat hukum |
| 5 | [SECURITY-PIPELINE.md](./SECURITY-PIPELINE.md) | **10 kontrol otomatis di CI** | ✅ Terpasang |

> Pelaporan celah dari pihak luar: [.github/SECURITY.md](../../.github/SECURITY.md)

---

## Tiga Risiko Terbuka

| # | Risiko | Rujukan |
|---|---|---|
| 🔴 | Kasir dapat mengakses seluruh cabang (`users` tidak terkait outlet) | [THREAT-MODEL](./THREAT-MODEL.md) §4 R2 |
| 🔴 | Revokasi token gagal saat Redis restart | [REDIS-STRATEGY](../10-architecture/REDIS-STRATEGY.md) §2 |
| 🟠 | Kunci cache Redis tanpa `tenant_id` = jalur kebocoran yang lolos review SQL | [REDIS-STRATEGY](../10-architecture/REDIS-STRATEGY.md) §4 |

## Prinsip

1. **Zero data bleed.** Kebocoran antar-tenant adalah kegagalan yang paling fatal.
2. **Klien tidak pernah dipercaya.** Server selalu menghitung ulang uang.
3. **Fraud dideteksi lewat rekonsiliasi**, bukan dicegah lewat kriptografi.
4. **Kegagalan harus aman.** Ragu tentang status pencabutan token → periksa Postgres.
