# syntax=docker/dockerfile:1.7
#
# pos-engine — jalur uang. Mengikuti templat fondasi-server-ionowu §4.1.
# Memenuhi: IMG-01 (multi-stage), IMG-02 (digest), IMG-08 (label OCI),
#           RUN-01 (UID 65532). IMG-10 (multi-arch) DISIMPANGI — hanya amd64,
#           lihat docs/10-architecture/adr/0011-*.md.
#
# PENYIMPANGAN IMG-03 — lihat docs/10-architecture/adr/0008-*.md:
# §3.1 mewajibkan stage build `golang:1.23-alpine`, tetapi go.mod modul ini
# menyatakan `go 1.26`. Toolchain 1.23 menolak membangunnya. Dipakai
# `golang:1.26-alpine` (varian alpine tetap sesuai keluarga yang didaftar);
# stage runtime tetap persis seperti §3.1.

FROM golang:1.26-alpine@sha256:ce864e7223ac17b1775e6fd0b4c0db580c2eb50e7953a427916379e4b92a1628 AS builder
WORKDIR /src

# Layer dependensi dipisah dari kode: go.mod/go.sum jarang berubah, kode
# berubah tiap commit — urutan ini menghindari unduh ulang modul saat hanya
# kode yang berubah.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY . .
# TARGETOS/TARGETARCH diisi buildx dari --platform (CI: linux/amd64 saja, ADR-0011).
# Tetap dipakai, bukan di-hardcode: build manual di Mac Apple Silicon tanpa
# --platform linux/amd64 akan menghasilkan arm64 yang gagal di server.
ARG TARGETOS TARGETARCH VERSION=dev COMMIT=unknown
# CGO_ENABLED=0: biner statis, wajib untuk distroless (tidak ada libc di sana).
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# ── Runtime ────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab

ARG VERSION=dev COMMIT=unknown CREATED=unknown
LABEL org.opencontainers.image.source="https://github.com/endabean3/ionowu-sweet" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.title="ionowu-sweet pos-engine" \
      org.opencontainers.image.description="Jalur uang POS offline-first — checkout, shift, sync"

COPY --from=builder /out/api /api

# HEALTHCHECK (RUN-07) — diperbarui 2026-09-16, lihat ADR-0008 §2.
# Distroless tidak punya shell, wget, maupun curl, jadi pemeriksanya adalah
# biner ini sendiri (`/api healthcheck` → GET /health/ready). Bentuk exec
# (tanpa shell) jalan di distroless.
#
# Sebelumnya dokumen mengandalkan "probe HTTP di panel Dokploy" — tetapi
# health check aplikasi Swarm di Dokploy dijalankan DI DALAM kontainer,
# sehingga rencana itu tidak pernah bisa diterapkan dan rollback otomatis
# (DEP-07) tidak akan pernah terpicu.
#
# --retries 3 × 15s: kedipan database singkat tidak langsung membuat Swarm
# memulai ulang seluruh replika.

# RUN-01 — UID/GID standar Ionowu. Tag `nonroot` distroless memang sudah
# 65532, tetapi ditulis eksplisit agar terbaca linter dan tidak berubah
# diam-diam bila tag base bergeser.
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=3 \
  CMD ["/api", "healthcheck"]
ENTRYPOINT ["/api"]
