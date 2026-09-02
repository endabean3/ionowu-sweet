# pos-engine — jalur uang. Target <25 MB (PRD §4), scratch/distroless
# (DOCKER.md §2). Dibangun di GitHub Actions, TIDAK di VPS (ADR-0004).

# ── Build ──────────────────────────────────────────────────────────────
FROM golang:1.26-bookworm AS builder
WORKDIR /src

# Layer dependensi dipisah dari kode: `go.mod`/`go.sum` jarang berubah,
# kode berubah tiap commit — urutan ini menghindari unduh ulang modul saat
# hanya kode yang berubah (DOCKER.md §1b aturan #4).
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# CGO_ENABLED=0: biner statis, wajib untuk jalan di scratch/distroless
# (tidak ada libc di sana). GOOS/GOARCH default ke platform target buildx.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# ── Runtime ────────────────────────────────────────────────────────────
# distroless, bukan literal `scratch`: sudah menyertakan ca-certificates
# (wajib untuk sslmode Postgres/TLS keluar) dan user non-root bawaan —
# DOCKER.md §2 mengizinkan keduanya ("scratch ATAU distroless").
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=builder /out/api /api

# CATATAN HEALTHCHECK: distroless tidak punya shell/wget, jadi
# `HEALTHCHECK CMD` tidak bisa dieksekusi di sini (beda dari image web/
# Alpine yang punya wget). Endpoint /healthz tetap ada (lihat
# internal/httpapi/router.go) — pemeriksaan kesiapan dilakukan Traefik di
# level HTTP, bukan lewat Docker HEALTHCHECK. Ini penyimpangan yang
# didokumentasikan dari DOCKER.md §2, bukan diam-diam dilewati.

USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/api"]
