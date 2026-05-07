export const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/register",
  "/materials",
  "/materials/mat_mock_001",
  "/materials/mat_mock_001/reviews",
  "/403",
] as const;

export const PARENT_ROUTES = [
  "/cart",
  "/checkout",
  "/me/orders",
  "/orders/ord_mock_001/payment-proof",
  "/me/materials",
  "/my-reviews",
] as const;

export const TEACHER_ROUTES = [
  "/teacher/materials",
  "/teacher/materials/new",
  "/teacher/materials/mat_mock_001/edit",
] as const;

export const ADMIN_ROUTES = [
  "/admin",
  "/admin/materials",
  "/admin/orders",
  "/admin/reports",
  "/admin/payment-proofs",
  "/admin/activity-logs",
  "/admin/activity-logs/log_mock_001",
  "/admin/users/usr_mock_001/activity-logs",
  "/admin/orders/ord_mock_001/activity-logs",
  "/admin/materials/mat_mock_001/activity-logs",
  "/admin/materials/mat_mock_001/reports",
  "/admin/users",
  "/admin/settings",
  "/admin/reviews-hub",
] as const;

export const API_ROUTES = [
  "/api/backend/health",
  "/api/auth/login",
  "/api/auth/register",
] as const;
