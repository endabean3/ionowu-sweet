# Cara Berkontribusi pada Dokumentasi Ini

> Bekerja dengan Claude atau AI agent lain? Arahkan ke [CLAUDE.md](../CLAUDE.md) —
> berisi keputusan yang sudah diambil dan hal yang sudah ditolak, agar tidak dibahas ulang.

---

## 1. Ke Folder Mana Tulisan Saya?

| Yang Anda tulis | Folder |
|---|---|
| Kenapa fitur ini ada, untuk siapa | `00-product/` |
| Bentuk sistem, keputusan teknis | `10-architecture/` |
| Kontrak antarmuka | `20-api/` |
| Bentuk data, migrasi | `30-data/` |
| Model keamanan aplikasi | `40-security/` |
| Infra, deploy, insiden | `50-operations/` |
| Cara membuktikan janji | `60-quality/` |
| Token, komponen, halaman | `70-design-system/` |

**Bila sebuah dokumen mulai menjawab dua pertanyaan berbeda, pecah.** Ini pernah terjadi:
FDR sempat memuat arsitektur + skema DB + Docker + keamanan sekaligus (311 baris).

---

## 2. Kapan Butuh ADR

Tulis ADR (`10-architecture/adr/`) bila keputusan **sulit dibalik**:

* Memilih teknologi atau vendor
* Mengubah batas layanan
* Mengubah bentuk data yang butuh migrasi
* Memindahkan sesuatu keluar dari Non-Goals

Pakai [TEMPLATE.md](./10-architecture/adr/TEMPLATE.md). **Wajib mencantumkan alternatif yang
ditolak beserta alasannya** — itulah bagian yang paling bernilai enam bulan kemudian.

---

## 3. Aturan Penulisan

1. **Bahasa Indonesia.** Istilah teknis boleh tetap dalam bahasa Inggris.
2. **Sertakan status** di kepala dokumen: ✅ Baseline · 🟡 Draft · 🔴 Usulan/Kerangka.
3. **Tandai yang belum diketahui** dengan ❌ atau "belum ditetapkan". **Jangan mengarang
   angka** — dokumen yang berisi tebakan yang terlihat seperti fakta lebih berbahaya
   daripada dokumen yang kosong.
4. **Tautkan, jangan salin.** Duplikasi akan berbeda seiring waktu.
5. **Cantumkan alasan, bukan hanya keputusan.**
6. **Perbarui `DOCS-MAP.md`** saat menambah atau menyelesaikan dokumen.

---

## 4. Sebelum Menyelesaikan Perubahan

- [ ] Semua tautan relatif valid (lihat §5)
- [ ] `DOCS-MAP.md` diperbarui
- [ ] README folder terkait diperbarui
- [ ] Status dokumen sesuai kenyataan
- [ ] `CHANGELOG.md` diisi untuk perubahan struktural

---

## 5. Memeriksa Tautan Rusak

```bash
python3 -c "
import os,re
bad=[]
for root,d,f in os.walk('.'):
    d[:]=[x for x in d if x not in ('.git','node_modules')]
    for n in f:
        if not n.endswith('.md'): continue
        p=os.path.join(root,n)
        for i,l in enumerate(open(p,encoding='utf-8'),1):
            for m in re.finditer(r'\]\((\.[^)#]*)\)',l):
                if not os.path.exists(os.path.normpath(os.path.join(root,m.group(1)))):
                    bad.append(f'{p}:{i} -> {m.group(1)}')
print('LINK PUTUS:',len(bad)); [print(' ',b) for b in bad]
"
```

---

## 6. Sumber Kebenaran

Bila dua dokumen bertentangan, yang ini menang:

| Topik | Sumber |
|---|---|
| RBAC & hak akses | `40-security/SECURITY.md` |
| Skema basis data | `30-data/DATA-MODEL.md` |
| Kontrak API | `20-api/openapi.yaml` |
| Token desain | `70-design-system/MASTER.md` |
| Batas layanan | `10-architecture/SERVICE-BOUNDARIES.md` |
| Non-Goals | `00-product/VISION-SCOPE.md` |
