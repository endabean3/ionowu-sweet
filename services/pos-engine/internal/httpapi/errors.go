package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/oklog/ulid/v2"
)

// errorBody mengikuti format terpadu docs/20-api/API-GUIDELINES.md §4
// (RFC 7807-ish, kode mesin di `code`, pesan manusia di `message`).
type errorBody struct {
	Error struct {
		Code      string `json:"code"`
		Message   string `json:"message"`
		RequestID string `json:"request_id"`
		Timestamp string `json:"timestamp"`
	} `json:"error"`
}

// RespondError menulis error terstandar. Kode WAJIB berasal dari
// docs/20-api/ERROR-CATALOG.md — kode baru harus masuk katalog itu dulu sebelum
// dipakai di sini (aturan §6.4).
func RespondError(w http.ResponseWriter, status int, code, message string) {
	body := errorBody{}
	body.Error.Code = code
	body.Error.Message = message
	body.Error.RequestID = "req_" + ulid.Make().String()
	body.Error.Timestamp = time.Now().UTC().Format(time.RFC3339)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// RespondJSON menulis respons sukses.
func RespondJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
