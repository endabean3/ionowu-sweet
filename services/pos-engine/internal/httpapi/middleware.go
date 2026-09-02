package httpapi

import (
	"context"
	"crypto/ed25519"
	"net/http"
)

// TenantMiddleware mengikuti pola SECURITY.md §2A: ekstrak klaim JWT, sisipkan
// tenant_id/role ke context.
//
// RBAC-MODEL.md §5 mencatat middleware ini TIDAK BOLEH mengasumsikan setiap
// request punya satu tenant_id — principal platform (super_admin) dan
// external (distributor) bisa lintas-tenant. Sesi ini hanya mengimplementasikan
// jalur tenant-staff (kasir/manager/owner/warehouse/sales_floor) secara penuh;
// principal lain ditolak eksplisit di bawah, BUKAN diam-diam diperlakukan
// seperti tenant-staff.
//
// TODO(platform, external): jalur super_admin dan distributor butuh
// middleware terpisah yang tidak mengasumsikan satu tenant_id tunggal —
// belum digarap, lihat RBAC-MODEL.md §5.
func TenantMiddleware(publicKey ed25519.PublicKey) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, err := ValidateJWT(r.Header.Get("Authorization"), publicKey)
			if err != nil {
				RespondError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Token tidak valid")
				return
			}

			if claims.PrincipalClass != PrincipalTenantStaff {
				RespondError(w, http.StatusForbidden, "FORBIDDEN_ROLE",
					"Kelas principal ini belum didukung endpoint tenant-staff")
				return
			}
			if claims.TenantID == "" || claims.Subject == "" {
				RespondError(w, http.StatusUnauthorized, "UNAUTHORIZED", "Token tidak valid")
				return
			}

			ctx := context.WithValue(r.Context(), tenantIDKey, claims.TenantID)
			ctx = context.WithValue(ctx, userIDKey, claims.Subject)
			ctx = context.WithValue(ctx, userRoleKey, claims.Role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
