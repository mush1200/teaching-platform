import type { Page, Route } from "@playwright/test";

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });
}

/** 付款審核的共用 fixture：清單與詳情必須是同一筆，否則兩邊會顯示不同的金額。 */
const PENDING_PROOF = {
  id: "proof_001",
  review_status: "pending",
  order_id: "ord_mock_001",
  user_id: "usr_parent_01",
  buyer_email: "parent@example.com",
  order_status: "pending_payment",
  order_total_amount: 299,
  order_payment_mode: "manual_transfer",
  order_created_at: "2026-04-24T10:00:00Z",
  order_payment_due_at: "2026-04-27T10:00:00Z",
  order_proof_count: 1,
  proof_url: "",
  original_filename: "proof.png",
  proof_size_bytes: 20480,
  uploaded_at: "2026-04-25T10:00:00Z",
};

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

    if (method === "GET" && path.startsWith("admin/materials") && !path.includes("/reports") && !path.includes("/activity-logs")) {
      return json(route, {
        items: [{ id: "mat_mock_001", title: "示範教材", status: "pending_review", price: 299, teacher_id: "usr_t1" }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        statusCounts: { total: 1, pending_review: 1, published: 0, unpublished: 0 },
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

    /*
     * 檢舉案件佇列（`/admin/report-cases`）。舊的 `GET /admin/reports` 仍保留在上面 ——
     * 它是 legacy 端點，形狀沒有改變。
     */
    if (method === "GET" && /^admin\/report-cases\/[^/]+\/[a-z-]+$/.test(path)) {
      return route.fallback();
    }
    if (method === "POST" && /^admin\/report-cases\/[^/]+\/[a-z-]+$/.test(path)) {
      return json(route, { ok: true });
    }
    if (method === "GET" && /^admin\/report-cases\/[^/]+$/.test(path)) {
      return json(route, {
        report: {
          id: "rep_001",
          material_id: "mat_mock_001",
          material_title: "示範教材",
          material_status: "published",
          creator_email: "creator@example.com",
          reporter_email: "parent@example.com",
          reason: "內容不符",
          status: "pending",
          created_at: "2026-04-25T10:00:00Z",
        },
        events: [],
        availableResolutions: ["dismissed", "warning", "request_changes", "unpublish_material"],
        allowedTransitions: ["investigating", "awaiting_creator", "resolved", "dismissed", "reviewed"],
      });
    }
    if (method === "GET" && path.startsWith("admin/report-cases")) {
      return json(route, {
        items: [
          {
            id: "rep_001",
            material_id: "mat_mock_001",
            material_title: "示範教材",
            creator_email: "creator@example.com",
            reporter_email: "parent@example.com",
            reason: "內容不符",
            status: "pending",
            created_at: "2026-04-25T10:00:00Z",
            event_count: 0,
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        statusCounts: { pending: 1, investigating: 0, awaiting_creator: 0, resolved: 1, dismissed: 0 },
      });
    }

    if (method === "GET" && /^admin\/payment-proofs\/[^/]+$/.test(path)) {
      return json(route, {
        proof: PENDING_PROOF,
        orderItems: [
          {
            id: "oi_1",
            material_id: "mat_demo_1",
            material_title: "小學數學思維訓練",
            quantity: 1,
            unit_price: 299,
            subtotal: 299,
          },
        ],
        otherProofs: [],
      });
    }

    if (method === "GET" && path.startsWith("admin/payment-proofs")) {
      return json(route, {
        items: [PENDING_PROOF],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        statusCounts: { total: 1, pending: 1, approved: 0, rejected: 0 },
      });
    }

    if (method === "POST" && /admin\/payment-proofs\/[^/]+\/approve$/.test(path)) {
      return json(route, { proofId: "proof_001", order: { id: "ord_mock_001", status: "approved" } });
    }

    /*
     * 退件的必填驗證在 Backend（`utils/paymentProofReview.js`）。
     * mock 忠實複製它：少了 rejection_reason 就回 400，UI 不能靠自己「大概擋一下」。
     */
    if (method === "POST" && /admin\/payment-proofs\/[^/]+\/reject$/.test(path)) {
      const body = (req.postDataJSON() || {}) as { rejection_reason?: string; note?: string };
      if (!body.rejection_reason) {
        return json(route, { message: "rejection_reason is required" }, 400);
      }
      if (body.rejection_reason === "other" && !body.note) {
        return json(route, { message: 'note is required when rejection_reason is "other"' }, 400);
      }
      return json(route, {
        proof: { id: "proof_001", review_status: "rejected", ...body },
      });
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
