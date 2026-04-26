import type { Page, Route } from "@playwright/test";

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });
}

export async function installCoreApiMocks(page: Page) {
  await page.route("**/api/auth/login", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fallback();
    const body = req.postDataJSON() as { email?: string; password?: string };
    if (body.email === "parent@example.com" && body.password === "Password123!") {
      return json(route, {
        token: "e2e-parent-token",
        user: { role: "parent", email: "parent@example.com" },
      });
    }
    return json(route, { message: "登入失敗" }, 401);
  });

  await page.route("**/api/backend/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\/backend\//, "");
    const method = req.method();

    if (method === "POST" && /orders\/[^/]+\/upload-proof$/.test(path)) {
      return json(route, { ok: true });
    }

    if (method === "GET" && path.startsWith("download/")) {
      const materialId = decodeURIComponent(path.replace("download/", ""));
      return json(route, { signedUrl: `https://download.example.com/${materialId}.zip` });
    }

    if (method === "GET" && path === "admin/reports") {
      return json(route, [
        { id: "rep_001", status: "pending", material_id: "mat_mock_001", reason: "內容不符", reporter_id: "usr_parent_01" },
        { id: "rep_002", status: "reviewed", material_id: "mat_mock_002", reason: "品質不佳", reporter_id: "usr_parent_02" },
      ]);
    }

    if (method === "PATCH" && /admin\/reports\/[^/]+$/.test(path)) {
      return json(route, { ok: true });
    }

    if (method === "GET" && path.startsWith("admin/payment-proofs")) {
      return json(route, {
        items: [
          {
            id: "proof_001",
            review_status: "pending",
            order_id: "ord_mock_001",
            user_id: "usr_parent_01",
            uploaded_at: "2026-04-25T10:00:00Z",
          },
        ],
      });
    }

    if (method === "POST" && /admin\/payment-proofs\/[^/]+\/(approve|reject)$/.test(path)) {
      return json(route, { ok: true });
    }

    if (method === "GET" && path === "admin/materials/mat_mock_001/reports") {
      return json(route, [{ id: "rep_101", status: "pending", material_id: "mat_mock_001", reason: "描述不清", reporter_id: "usr_parent_03" }]);
    }

    if (method === "GET" && path === "materials/mat_mock_001/reports") {
      return json(route, [{ id: "rep_201", status: "pending", material_id: "mat_mock_001", reason: "教材有誤", reporter_id: "usr_parent_04" }]);
    }

    return route.fallback();
  });
}
