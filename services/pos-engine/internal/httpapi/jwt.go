package httpapi

import (
	"crypto/ed25519"
	"errors"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// PrincipalClass mengikuti tiga kelas RBAC-MODEL.md §1. Sesi ini hanya
// mengimplementasikan jalur tenant-staff secara penuh (lihat middleware.go).
type PrincipalClass string

const (
	PrincipalTenantStaff PrincipalClass = "tenant_staff"
	PrincipalPlatform    PrincipalClass = "platform"
	PrincipalExternal    PrincipalClass = "external"
)

// Claims adalah isi access token JWT (EdDSA, SECURITY.md §4B).
type Claims struct {
	jwt.RegisteredClaims
	TenantID       string         `json:"tenant_id"`
	Role           string         `json:"role"`
	PrincipalClass PrincipalClass `json:"principal_class"`
}

var errMissingBearerToken = errors.New("header Authorization tidak ada atau bukan format Bearer")

// ValidateJWT mem-parse dan memverifikasi access token EdDSA, mengikuti pola
// SECURITY.md §2A.
func ValidateJWT(authorizationHeader string, publicKey ed25519.PublicKey) (*Claims, error) {
	const prefix = "Bearer "
	if !strings.HasPrefix(authorizationHeader, prefix) {
		return nil, errMissingBearerToken
	}
	raw := strings.TrimPrefix(authorizationHeader, prefix)

	claims := &Claims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodEd25519); !ok {
			return nil, errors.New("algoritma token tidak didukung")
		}
		return publicKey, nil
	}, jwt.WithValidMethods([]string{"EdDSA"}))
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("token tidak valid")
	}
	return claims, nil
}
