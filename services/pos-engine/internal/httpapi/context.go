package httpapi

import "context"

type contextKey string

const (
	tenantIDKey contextKey = "tenant_id"
	userIDKey   contextKey = "user_id"
	userRoleKey contextKey = "user_role"
)

// TenantID mengambil tenant_id yang disisipkan TenantMiddleware. Handler yang
// dipanggil setelah middleware boleh mengasumsikan nilai ini selalu ada —
// middleware sudah menolak request yang tidak punya principal tenant-staff.
func TenantID(ctx context.Context) string {
	v, _ := ctx.Value(tenantIDKey).(string)
	return v
}

// UserID mengambil id user (cashier_id / actor_user_id) dari konteks.
func UserID(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

// UserRole mengambil peran (owner/manager/cashier/warehouse/sales_floor).
func UserRole(ctx context.Context) string {
	v, _ := ctx.Value(userRoleKey).(string)
	return v
}
