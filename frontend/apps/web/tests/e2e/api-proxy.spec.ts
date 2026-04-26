import { expect, test } from "@playwright/test";
import { API_ROUTES } from "./helpers/routes";

test.describe("API and Proxy Routes", () => {
  test("backend proxy health route is reachable", async ({ request }) => {
    await test.step("GET /api/backend/health", async () => {
      const res = await request.get("/api/backend/health");
      expect(res.status()).toBeLessThan(500);
      // TODO(assert): assert response schema once backend health contract is stable.
    });
  });

  test("auth proxy endpoints basic contract TODO", async ({ request }) => {
    await test.step("POST /api/auth/login", async () => {
      const res = await request.post("/api/auth/login", {
        data: { email: "e2e@example.com", password: "wrong-password" },
      });
      expect([200, 400, 401]).toContain(res.status());
      // TODO(assert): verify normalized auth error body structure.
    });

    await test.step("POST /api/auth/register", async () => {
      const res = await request.post("/api/auth/register", {
        data: { email: "e2e-register@example.com", password: "Password123!" },
      });
      expect([200, 201, 400, 409]).toContain(res.status());
      // TODO(assert): verify success response and redirect coupling contract.
    });
  });

  test("api route list smoke", async ({ request }) => {
    for (const route of API_ROUTES) {
      await test.step(`request ${route}`, async () => {
        const method = route === "/api/backend/health" ? "get" : "post";
        const res =
          method === "get"
            ? await request.get(route)
            : await request.post(route, { data: { email: "smoke@example.com", password: "12345678" } });
        expect(res.status()).toBeGreaterThan(0);
      });
    }
  });
});
