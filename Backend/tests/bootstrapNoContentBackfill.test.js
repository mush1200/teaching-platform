/**
 * `SEC-04` —— backend 啟動（bootstrap）不得替教材資料補值，尤其不得寫入第三方網址。
 *
 * 2026-09-30 之前 `runIdempotentMigrations()` 在**每次啟動**（含 production）都執行
 *   UPDATE materials SET cover_image_url = 'https://picsum.photos/…' WHERE cover_image_url IS NULL …
 * 這裡以原始碼掃描釘住「那段寫入不得回來」—— 不需要資料庫，因此跑在 `test:unit`／CI。
 * 真的跑一次 bootstrap 的驗證在 `bootstrapNoContentBackfill.db.test.js`。
 *
 * 掃描前先去掉註解：說明這個缺陷的註解本身會提到 `picsum`，那不是可執行的寫入。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "models", "bootstrapModel.js"), "utf8");

/** 去掉 `/* … *\/` 區塊註解與 `//` 行註解（保留字串內容以外的程式碼）。 */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const CODE = stripComments(SOURCE);

test("bootstrap code does not reference any third-party placeholder image host", () => {
  for (const host of ["picsum.photos", "placeholder.com", "placehold.co", "unsplash.com", "loremflickr"]) {
    assert.equal(CODE.includes(host), false, `bootstrapModel.js 不得在可執行程式碼中出現 ${host}`);
  }
});

test("bootstrap code never assigns materials.cover_image_url", () => {
  // 任何 `UPDATE materials … SET … cover_image_url =`（跨行）都算。
  const updates = CODE.match(/UPDATE\s+materials\b[\s\S]*?(?:;|`)/gi) ?? [];
  const offending = updates.filter((stmt) => /\bSET\b[\s\S]*\bcover_image_url\s*=/i.test(stmt));
  assert.deepEqual(offending, [], "啟動時不得改寫教材封面（SEC-04）");
});

test("the historical picsum migration is marked do-not-run", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "migrations", "20260503_material_cover_placeholder_urls.sql"),
    "utf8"
  );
  assert.match(migration, /DO NOT RUN/, "歷史 migration 必須明示不得套用");
});

test("stripComments keeps executable SQL visible (negative control)", () => {
  const sample = "/* picsum.photos */\nawait db.query(`UPDATE materials SET cover_image_url = 'https://picsum.photos/x' WHERE id = 1`);";
  const code = stripComments(sample);
  assert.equal(code.includes("picsum.photos"), true, "註解之外的 picsum 必須被看見");
  const updates = code.match(/UPDATE\s+materials\b[\s\S]*?(?:;|`)/gi) ?? [];
  assert.equal(updates.some((stmt) => /\bSET\b[\s\S]*\bcover_image_url\s*=/i.test(stmt)), true);
});
