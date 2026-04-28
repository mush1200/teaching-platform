import fs from "node:fs/promises";
import path from "node:path";
import { test, type Page } from "@playwright/test";

const OUTPUT_DIR = path.resolve(process.cwd(), "screenshots", process.env.SCREENSHOT_BATCH_DIR ?? "all-ui");
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3010";

const ROUTES = {
  public: [
    "/",
    "/login",
    "/register",
    "/materials",
    "/materials/mat_demo_1",
    "/materials/mat_demo_1/reviews",
  ],
  parent: [
    "/cart",
    "/checkout",
    "/orders",
    "/orders/ord_mock_001/upload-proof",
    "/downloads",
    "/my-reviews",
  ],
  teacher: [
    "/teacher/materials",
    "/teacher/materials/new",
    "/teacher/materials/mat_demo_1/edit",
    "/teacher/materials/mat_demo_1/reviews",
    "/teacher/sales",
  ],
  admin: [
    "/admin",
    "/admin/materials",
    "/admin/orders",
    "/admin/reports",
    "/admin/payment-proofs",
    "/admin/activity-logs",
    "/admin/users",
    "/admin/settings",
    "/admin/reviews-hub",
  ],
} as const;

async function setAuth(page: Page, role: "parent" | "teacher" | "admin") {
  const token = `screenshot-${role}-token`;
  await page.context().addCookies([
    { name: "tp_token", value: token, url: BASE_URL },
    { name: "tp_role", value: role, url: BASE_URL },
  ]);
  await page.addInitScript(
    ({ t, r }) => {
      localStorage.setItem("tp_token", t);
      localStorage.setItem("tp_role", r);
      localStorage.setItem("tp_user_email", `${r}@example.com`);
    },
    { t: token, r: role }
  );
}

function safeName(route: string) {
  if (route === "/") return "home";
  return route.replace(/^\//, "").replace(/\//g, "__").replace(/[^a-zA-Z0-9_\-]/g, "_");
}

test.describe("Capture all UI screenshots", () => {
  test("capture all routes for each role", async ({ page }, testInfo) => {
    test.setTimeout(600000);
    const projectName = testInfo.project.name.includes("mobile") ? "mobile" : "desktop";
    const projectDir = path.join(OUTPUT_DIR, projectName);
    await fs.mkdir(projectDir, { recursive: true });
    const failures: Array<{ role: string; route: string; error: string }> = [];

    async function capture(role: string, route: string, filePrefix: string) {
      try {
        await page.goto(route, { waitUntil: "commit", timeout: 60000 });
        await page.waitForTimeout(600);
        const shotPath = path.join(projectDir, `${filePrefix}__${safeName(route)}.png`);
        const failedPath = path.join(projectDir, `${filePrefix}__${safeName(route)}__failed-state.png`);
        await page.screenshot({
          path: shotPath,
          fullPage: true,
        });
        // Avoid stale failure artifacts from earlier partial runs on the same machine.
        try {
          await fs.unlink(failedPath);
        } catch {
          // ignore missing file
        }
      } catch (error) {
        failures.push({
          role,
          route,
          error: error instanceof Error ? error.message : String(error),
        });
        try {
          await page.screenshot({
            path: path.join(projectDir, `${filePrefix}__${safeName(route)}__failed-state.png`),
            fullPage: true,
          });
        } catch {
          // ignore screenshot failure on failed navigation
        }
      }
    }

    for (const route of ROUTES.public) {
      await capture("public", route, "public");
    }

    for (const route of ROUTES.parent) {
      await setAuth(page, "parent");
      await capture("parent", route, "parent");
    }

    for (const route of ROUTES.teacher) {
      await setAuth(page, "teacher");
      await capture("teacher", route, "teacher");
    }

    for (const route of ROUTES.admin) {
      await setAuth(page, "admin");
      await capture("admin", route, "admin");
    }

    if (failures.length > 0) {
      await fs.writeFile(path.join(projectDir, "capture-failures.json"), JSON.stringify(failures, null, 2), "utf-8");
    }
  });
});
