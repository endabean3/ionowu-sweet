# syntax=docker/dockerfile:1.7
#
# Toolchain pengembangan ionowu sweet — SEMUA tool ada di sini.
# Mac tidak perlu punya Go, Node, Python, goose, atau sqlc sama sekali.
# Image ini juga dipakai CI, sehingga versi lokal dan CI dijamin identik.
#
# Dua pelajaran yang membentuk berkas ini (image sempat membengkak jadi 8,45 GB):
#   1. `chown -R /go` menyalin ULANG seluruh direktori jadi layer baru (+1,98 GB).
#      Solusi: buat pengguna LEBIH DULU, GOPATH langsung di direktori miliknya.
#   2. `go install` tanpa cache mount menyimpan cache modul di dalam image.
#      Solusi: --mount=type=cache, cache tinggal di BuildKit, bukan di image.

FROM golang:1.27-bookworm

ARG NODE_MAJOR=24
ARG PNPM_VERSION=11.22.0
ARG GOOSE_VERSION=v3.27.3
ARG SQLC_VERSION=v1.31.1
ARG GOLANGCI_VERSION=v2.12.2

ENV DEBIAN_FRONTEND=noninteractive

# ── Pengguna dibuat DULUAN, sebelum apa pun yang perlu kepemilikan ──
RUN useradd -m -s /bin/bash -u 1000 dev

# ── Dasar + klien Postgres & Redis (klien saja, bukan server) ───────
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git make jq \
        postgresql-client redis-tools \
        python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

# ── Pustaka sistem untuk Chromium (Playwright) ──────────────────────
# Tanpa ini `make test-e2e` dan `make test-offline` GAGAL DILUNCURKAN sama
# sekali: Playwright melempar "Host system is missing dependencies to run
# browsers", dan perbaikannya (`npx playwright install-deps`) butuh root —
# sementara container ini sengaja berjalan sebagai `dev` tanpa sudo. Akibatnya
# kedua target itu tidak pernah bisa dijalankan siapa pun, dan uji offline —
# pembeda utama produk — tidak pernah terverifikasi meski berkas ujinya ada.
#
# Daftarnya sengaja ditulis eksplisit, BUKAN `playwright install-deps`: perintah
# itu menarik paket jauh lebih banyak (termasuk font & GTK untuk Firefox/WebKit)
# padahal playwright.config.ts hanya memakai Chromium.
#
# Binernya sendiri TIDAK dibakukan ke image (~300 MB per browser). Ia mendarat
# di /home/dev/.cache/ms-playwright, yang dipasang sebagai named volume di
# docker-compose.dev.yml — pola yang sama dengan cache go-build dan pnpm.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 libnspr4 libnss3 libdbus-1-3 libatk1.0-0 \
        libatk-bridge2.0-0 libcups2 libdrm2 libxcb1 libxkbcommon0 \
        libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
        libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    && rm -rf /var/lib/apt/lists/*

# ── Tool Go — BINER SIAP PAKAI, bukan dikompilasi ───────────────────
# Mengompilasi sqlc menarik ~200 modul dan golangci-lint lebih banyak lagi.
# Di jaringan yang putus-putus itu hampir pasti gagal (`unexpected EOF`
# dari proxy.golang.org). Biner siap pakai: satu berkas 13–40 MB.
#
# Layer ini sengaja diletakkan LEBIH AWAL daripada Node/Python: mengubah
# versi Python tidak boleh membatalkan cache unduhan yang rapuh ini.
#
# /go/bin dapat dibaca semua pengguna — TIDAK perlu `chown -R /go`
# yang menyalin ulang seluruh direktori jadi layer 1,98 GB.
ARG TARGETARCH
ENV DL="curl -fsSL --retry 6 --retry-delay 3 --retry-all-errors"

RUN set -eux; a="${TARGETARCH:-arm64}"; \
    $DL -o /go/bin/goose \
      "https://github.com/pressly/goose/releases/download/${GOOSE_VERSION}/goose_linux_${a}"; \
    chmod 0755 /go/bin/goose; goose --version

RUN set -eux; a="${TARGETARCH:-arm64}"; v="${SQLC_VERSION#v}"; \
    $DL -o /tmp/sqlc.tar.gz \
      "https://github.com/sqlc-dev/sqlc/releases/download/${SQLC_VERSION}/sqlc_${v}_linux_${a}.tar.gz"; \
    tar -xzf /tmp/sqlc.tar.gz -C /go/bin sqlc; rm /tmp/sqlc.tar.gz; \
    chmod 0755 /go/bin/sqlc; sqlc version

RUN set -eux; a="${TARGETARCH:-arm64}"; v="${GOLANGCI_VERSION#v}"; \
    f="golangci-lint-${v}-linux-${a}"; \
    $DL -o /tmp/gcl.tar.gz \
      "https://github.com/golangci/golangci-lint/releases/download/${GOLANGCI_VERSION}/${f}.tar.gz"; \
    tar -xzf /tmp/gcl.tar.gz -C /tmp; \
    install -m 0755 "/tmp/${f}/golangci-lint" /go/bin/golangci-lint; \
    rm -rf /tmp/gcl.tar.gz "/tmp/${f}"; golangci-lint --version

# ── Node.js LTS + pnpm ──────────────────────────────────────────────
# corepack diaktifkan sebagai ROOT: ia menulis shim ke direktori bin global.
# Menjalankannya sebagai `dev` gagal diam-diam — itu sebabnya pnpm sempat hilang.
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@${PNPM_VERSION} --activate \
    && pnpm --version

# ── uv (manajer paket Python) ───────────────────────────────────────
ARG PYTHON_VERSION=3.12
RUN curl -LsSf https://astral.sh/uv/install.sh | \
        env UV_INSTALL_DIR=/usr/local/bin sh \
    && rm -rf /root/.cache

# Debian bookworm hanya membawa Python 3.11. TECH-STACK menjanjikan 3.12,
# jadi uv yang memasangnya — inilah gunanya versi dipin.
ENV UV_PYTHON_INSTALL_DIR=/opt/python
RUN uv python install ${PYTHON_VERSION} \
    && ln -sf "$(uv python find ${PYTHON_VERSION})" /usr/local/bin/python3.12 \
    && ln -sf /usr/local/bin/python3.12 /usr/local/bin/python3 \
    && python3.12 --version \
    && chmod -R a+rX /opt/python

# `python3` polos HARUS ikut menunjuk 3.12. Tanpa tautan kedua ini, PATH masih
# menemukan /usr/bin/python3 milik Debian (3.11) lebih dulu, sehingga
# `make tools-check` melaporkan 3.11 sementara TECH-STACK menjanjikan 3.12 —
# selisih versi yang baru ketahuan saat ia menyebabkan bug.
# Skrip Debian tidak terpengaruh: shebang mereka menyebut /usr/bin/python3 mutlak.

# ── Titik pasang volume dibuat DULU, dan dimiliki `dev` ─────────────
# Saat memasang named volume, Docker membuat direktori induk yang belum ada
# sebagai ROOT. Akibatnya `dev` tidak bisa menulis di sebelahnya: corepack
# gagal `mkdir /home/dev/.cache/node` → pnpm mati total dan seluruh target
# web (dev, build, test, lint) ikut gagal.
#
# `install -d` pada direktori KOSONG itu murah — berbeda dengan `chown -R`
# pada direktori besar, yang menyalin ulang isinya jadi layer baru (lihat
# pelajaran #1 di kepala berkas ini).
RUN install -d -o dev -g dev \
        /home/dev/.cache \
        /home/dev/.cache/go-build \
        /home/dev/.cache/node \
        /home/dev/.cache/ms-playwright \
        /home/dev/.pnpm \
        /workspace/.pnpm-store \
        /home/dev/go/pkg/mod \
        /workspace/node_modules \
        /workspace/apps/web/node_modules

# ── Pengguna non-root untuk bekerja ────────────────────────────────
# GOPATH milik dev sendiri; /go/bin cukup dibaca lewat PATH.
USER dev
ENV GOPATH=/home/dev/go \
    PNPM_HOME=/home/dev/.pnpm \
    PATH=/go/bin:/home/dev/go/bin:/home/dev/.pnpm:/home/dev/.local/bin:$PATH

# Repo di-bind-mount dari host dengan uid pemilik yang berbeda dari `dev`,
# sehingga git menolaknya: "detected dubious ownership in repository".
# `git status` kebetulan masih jalan, tapi `git rev-parse HEAD` tidak — dan
# itulah yang dipanggil `go build` untuk stempel VCS, membuat SELURUH
# `go build`/`go test` gagal dengan exit 1 tanpa sebab yang jelas.
RUN git config --global --add safe.directory /workspace

# `corepack prepare` di atas dijalankan sebagai root, jadi paketnya mendarat di
# COREPACK_HOME milik root. Sebagai `dev`, corepack mengunduh ULANG pnpm setiap
# container baru — container jadi butuh registry npm hanya untuk menyala.
# Menyiapkannya sekali lagi sebagai dev membakukannya ke dalam image.
ENV COREPACK_HOME=/home/dev/.cache/node/corepack
RUN corepack prepare pnpm@${PNPM_VERSION} --activate && pnpm --version

WORKDIR /workspace
