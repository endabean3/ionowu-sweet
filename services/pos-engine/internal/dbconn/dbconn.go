// Package dbconn membuka pgxpool dengan codec decimal.Decimal terdaftar.
//
// Tanpa ini, pgx tidak tahu cara meng-encode/decode github.com/shopspring/decimal
// (tipe hasil override sqlc.yaml untuk pg_catalog.numeric) — kueri yang
// mengombinasikan dua parameter numeric dalam satu ekspresi ARITMETIKA
// (mis. `variance = $5 - $4` di 30-data/queries/shift.sql) gagal dengan
// "operator is not unique: unknown - unknown" karena kedua parameter
// dikirim tanpa OID tipe. Ditemukan saat kueri ini benar-benar dijalankan
// untuk pertama kalinya (30-data/queries/README.md § "Belum diverifikasi").
package dbconn

import (
	"context"

	pgxdecimal "github.com/jackc/pgx-shopspring-decimal"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Open(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	poolCfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		pgxdecimal.Register(conn.TypeMap())
		return nil
	}
	return pgxpool.NewWithConfig(ctx, poolCfg)
}
