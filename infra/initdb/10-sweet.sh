#!/usr/bin/env bash
# Database, role, dan batas koneksi khusus aplikasi ini.
# Rujukan: fondasi-server-ionowu.md ISO-08, DAT-09; docs/10-architecture/adr/0008.
#
# BUKAN `.sql` dengan `:'var'` — versi awal berkas ini memakai substitusi
# variabel psql (`PASSWORD :'sweet_app_password'`), yang HANYA berfungsi bila
# psql dipanggil dengan `-v nama=nilai`. Entrypoint resmi postgres menjalankan
# `.sql` di direktori ini lewat `psql -f`, TANPA `-v` apa pun — dibuktikan
# lewat `docker compose up` nyata: "ERROR: syntax error at or near ':'".
# Skrip `.sh` di sini dijalankan (di-source) dengan environment penuh,
# sehingga variabel shell diinterpolasi langsung ke teks SQL — pola yang
# benar-benar tereksekusi, bukan disalin dari templat tanpa diuji.
set -euo pipefail

: "${SWEET_APP_PASSWORD:?SWEET_APP_PASSWORD wajib diisi}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE sweet_app LOGIN PASSWORD '$SWEET_APP_PASSWORD' CONNECTION LIMIT 40;
    CREATE DATABASE ionowu_sweet OWNER sweet_app;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname ionowu_sweet <<-EOSQL
    REVOKE ALL ON DATABASE ionowu_sweet FROM PUBLIC;
EOSQL
