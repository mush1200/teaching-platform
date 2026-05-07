import type { Page, Route } from "@playwright/test";

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });
}

export async function installCoreApiMocks(page: Page) {
  const handleLogin = async (route: Route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.fallback();
    const body = req.postDataJSON() as { email?: string; password?: string };
    if (body.email === "parent@example.com" && body.password === "Password123!") {
      return json(route, {
        token: "e2e-parent-token",
        user: {
          id: "usr_parent_e2e",
          role: "parent",
          email: "parent@example.com",
          created_at: "2026-05-01T00:00:00.000Z",
        },
      });
    }
    return json(route, { message: "登入失敗" }, 401);
  };

  await page.route("**/api/auth/login", handleLogin);
  await page.route("**/api/backend/auth/login", handleLogin);

  await page.route("**/api/backend/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api\/backend\//, "");
    const method = req.method();

    if (method === "POST" && /orders\/[^/]+\/(upload-proof|payment-proof)$/.test(path)) {
      return json(route, { ok: true });
    }

    if (method === "POST" && path === "orders/promo/validate") {
      const body = (req.postDataJSON() || {}) as { code?: string; subtotal?: number };
      const code = String(body.code || "").toUpperCase();
      const subtotal = Math.max(0, Number(body.subtotal || 0));
      if (code === "WELCOME100") {
        return json(route, { code, discount_amount: Math.min(100, subtotal) });
      }
      return json(route, { message: "優惠代碼不存在" }, 400);
    }

    if (method === "POST" && path === "cart/items") {
      return json(route, { ok: true });
    }

    if (method === "GET" && path === "cart") {
      return json(route, {
        items: [
          {
            id: "ci_mock_001",
            material_id: "mat_demo_1",
            title: "示範教材",
            qty: 1,
            price: 199,
            subtotal: 199,
          },
        ],
      });
    }

    if (method === "POST" && path === "orders") {
      return json(route, {
        message: "Order created successfully",
        data: { order: { id: "ord_mock_001", status: "pending_payment", total_amount: 199 }, items: [] },
      });
    }

    if (method === "GET" && path === "materials") {
      return json(route, {
        items: [
          {
            id: "mat_demo_1",
            title: "示範教材",
            price: 199,
            status: "published",
            cover_image_url: "https://picsum.photos/seed/mat_demo_1/640/480",
          },
        ],
      });
    }

    if (method === "GET" && (path === "orders/my" || path === "me/orders")) {
      return json(route, {
        items: [
          {
            id: "ord_mock_001",
            status: "pending_payment",
            total_amount: 199,
            created_at: "2026-05-01T00:00:00.000Z",
            payment_proof_pending_review_count: 0,
            payment_proof_uploaded_count: 1,
            payment_proof_latest_status: "pending",
          },
        ],
      });
    }

    if (method === "GET" && (path === "orders/ord_mock_001" || path === "me/orders/ord_mock_001")) {
      return json(route, {
        order: {
          id: "ord_mock_001",
          status: "pending_payment",
          total_amount: 199,
          created_at: "2026-05-01T00:00:00.000Z",
          payment_proof_pending_review_count: 0,
          payment_proof_uploaded_count: 1,
          payment_proof_latest_status: "pending",
          payment_proof_rejected_note: null,
        },
        items: [
          {
            id: "oi_mock_001",
            order_id: "ord_mock_001",
            material_id: "mat_demo_1",
            material_title: "示範教材",
            quantity: 1,
            subtotal: 199,
          },
        ],
      });
    }

    if (method === "GET" && path.startsWith("download/")) {
      const materialId = decodeURIComponent(path.replace("download/", ""));
      return json(route, { signedUrl: `https://download.example.com/${materialId}.zip` });
    }

    if (method === "GET" && path === "me/materials") {
      return json(route, {
        items: [
          {
            materialId: "mat_demo_1",
            title: "示範教材",
            coverImageUrl: null,
            materialUpdatedAt: "2026-05-01T00:00:00Z",
            purchasedAt: "2026-04-20T00:00:00Z",
            authorName: "teacher",
          },
        ],
      });
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
