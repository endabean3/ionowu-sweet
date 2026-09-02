# 60-quality — Membuktikan Janji

[PRD](../00-product/PRD-01-POS-INTI.md) §4 membuat lima janji terukur. Folder ini berisi cara
**memberlakukan** janji itu di CI dan produksi, bukan sekadar menyatakannya.

| # | Dokumen | Isi | Status |
|:-:|---|---|:---:|
| 1 | [TESTING-STRATEGY.md](./TESTING-STRATEGY.md) | Piramida, uji offline, gerbang CI | 🟡 Draft |
| 2 | [PERFORMANCE-BUDGET.md](./PERFORMANCE-BUDGET.md) | Ambang yang memblokir merge | 🟡 Draft |
| 3 | [ACCESSIBILITY.md](./ACCESSIBILITY.md) | WCAG AAA & aturan khusus kasir | 🟡 Draft |
| 4 | [HARDWARE-SUPPORT.md](./HARDWARE-SUPPORT.md) | Printer, scanner, batasan iOS | 🟡 Draft |

---

## Tiga Uji yang Paling Menentukan

1. **Paritas rumus klien–server** — duplikasi rumus total yang sengaja diterima
   ([SERVICE-BOUNDARIES](../10-architecture/SERVICE-BOUNDARIES.md) §4) hanya aman bila diikat uji.
2. **Isolasi tenant otomatis untuk setiap endpoint** — endpoint baru yang lupa diuji adalah
   persis cara kebocoran lolos ke produksi.
3. **Uji offline sungguhan** — pembeda utama produk. Tanpa ini, klaim "100% toleransi offline"
   tidak pernah terbukti.

## Keputusan Terbuka

* Posisi resmi soal iOS ([HARDWARE-SUPPORT](./HARDWARE-SUPPORT.md) §5)
* Pemilihan kerangka uji ([TESTING-STRATEGY](./TESTING-STRATEGY.md) §7)
