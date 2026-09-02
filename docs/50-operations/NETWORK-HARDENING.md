# Pengerasan Jaringan & Server (*Firewall, SSH, Akses Host*)

> **Status:** 🟡 Draft
> **Dokumen Terkait:** [INFRASTRUCTURE.md](./INFRASTRUCTURE.md), [DOKPLOY.md](./DOKPLOY.md), [SECURITY.md](../40-security/SECURITY.md)

---

## 1. Kenapa Dokumen Ini Terpisah dari `40-security/`

`40-security/SECURITY.md` mengatur keamanan **aplikasi**: siapa boleh melakukan apa, bagaimana
password di-hash, bagaimana tenant diisolasi. Dokumen ini mengatur keamanan **mesin**: port
mana yang terbuka, siapa yang boleh masuk ke server.

Keduanya bisa gagal secara independen. RBAC yang sempurna tidak menolong bila port 5432
terbuka ke internet.

---

## 2. Aturan Firewall (UFW)

Kebijakan dasar: **tolak semua masuk, izinkan semua keluar**, lalu buka seminimal mungkin.

```bash
ufw default deny incoming
ufw default allow outgoing

ufw allow 22/tcp      # SSH — persempit ke IP admin bila memungkinkan
ufw allow 80/tcp      # Traefik HTTP (redirect ke HTTPS)
ufw allow 443/tcp     # Traefik HTTPS — satu-satunya pintu masuk aplikasi

ufw enable
```

Port 3000 (UI Dokploy), 5432 (Postgres), 6379 (Redis), dan 8080 (pos-engine) **tidak pernah**
muncul dalam daftar ini. Lihat matriks lengkap di [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) §3.

---

## 3. ⚠️ Jebakan Terbesar: Docker Menembus UFW

Ini adalah kesalahan konfigurasi paling umum dan paling berbahaya pada stack Docker + UFW,
dan **wajib** dipahami sebelum menganggap server ini aman.

Ketika sebuah kontainer mem-*publish* port:

```yaml
postgres:
  ports:
    - "5432:5432"     # ← Postgres kini terbuka ke SELURUH INTERNET
```

Docker menulis aturan `iptables`-nya sendiri pada chain `DOCKER`, yang **dievaluasi lebih dulu**
daripada aturan UFW. Akibatnya:

> `ufw deny 5432` akan tampak aktif saat dicek dengan `ufw status`,
> tetapi port tersebut **tetap dapat diakses dari internet**.

Server terasa aman padahal database terekspos. Tiga cara mengatasinya, berurutan dari yang
paling disarankan:

| Pendekatan | Cara | Penilaian |
|---|---|---|
| **1. Jangan publish port sama sekali** | Hapus blok `ports:`; andalkan jaringan Docker internal | ✅ **Disarankan** — menghilangkan masalahnya, bukan menambalnya |
| **2. Bind hanya ke localhost** | `ports: - "127.0.0.1:5432:5432"` | ✅ Aman; dipakai bila butuh akses via SSH tunnel |
| **3. Pasang `ufw-docker`** | Menyisipkan aturan ke chain `DOCKER-USER` | ⚠️ Berhasil, tetapi menambah komponen yang bisa lupa dirawat |

**Aturan yang berlaku di proyek ini:** hanya Traefik yang boleh mem-publish port ke host.
Setiap `ports:` baru pada layanan lain harus lolos review dan dicatat alasannya.

### Cara Memverifikasi (jalankan setelah setiap perubahan infrastruktur)

Dari **luar** server — hasil yang benar adalah semuanya `filtered`/tertutup kecuali 22, 80, 443:

```bash
nmap -Pn -p 22,80,443,2375,3000,5432,6379,8080 <IP-SERVER>
```

Dari **dalam** server — memastikan tidak ada yang listen di `0.0.0.0` selain yang diizinkan:

```bash
ss -tulpn | grep -v '127.0.0.1'
```

---

## 4. Akses SSH

| Setelan | Nilai wajib | Alasan |
|---|---|---|
| `PasswordAuthentication` | `no` | Menutup serangan tebak-password otomatis |
| `PermitRootLogin` | `prohibit-password` atau `no` | Login root langsung menghapus jejak audit |
| Autentikasi | Hanya kunci publik (ed25519) | |
| `fail2ban` | Aktif untuk sshd | Membatasi laju upaya masuk |
| Pengguna | Akun non-root + `sudo` | |

**Yang masih harus ditetapkan:**

- [ ] Siapa saja yang memegang akses SSH? (daftar nama, bukan "tim")
- [ ] Prosedur pencabutan akses saat ada anggota tim keluar
- [ ] Apakah port SSH dibatasi ke IP tertentu atau di balik VPN?

---

## 5. Pengerasan Lain

* **Pembaruan otomatis:** aktifkan `unattended-upgrades` untuk patch keamanan.
* **Socket Docker:** `/var/run/docker.sock` setara akses root. Dokploy membutuhkannya —
  jadi **siapa pun yang bisa masuk ke UI Dokploy secara efektif memiliki root di VPS ini.**
  Itulah alasan sebenarnya UI Dokploy tidak boleh terbuka ke publik.
* **Docker API TCP (2375/2376):** tidak boleh diaktifkan. Ini jalur pembajakan server yang klasik.
* **Perlindungan lapisan aplikasi:** rate limiting sudah ditangani di level API
  ([API-GUIDELINES.md](../20-api/API-GUIDELINES.md) §6). Firewall tidak menggantikannya —
  keduanya melindungi hal yang berbeda.

---

## 6. Daftar Periksa Sebelum Produksi

- [ ] `ufw status` hanya menampilkan 22, 80, 443
- [ ] `nmap` dari luar mengonfirmasi hasil yang sama (**tidak boleh dilewati** — inilah yang menangkap jebakan §3)
- [ ] Tidak ada layanan selain Traefik yang mem-publish port
- [ ] Login SSH dengan password sudah dinonaktifkan dan diuji
- [ ] UI Dokploy tidak dapat dijangkau dari internet terbuka
- [ ] `fail2ban` aktif
- [ ] Pembaruan keamanan otomatis menyala
