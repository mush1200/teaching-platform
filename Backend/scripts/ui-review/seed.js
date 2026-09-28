"use strict";

/**
 * UI Review 的 **reset ＋ seed**。
 *
 * ```
 *   node scripts/ui-review/seed.js            # reset + seed
 *   node scripts/ui-review/seed.js --verify   # 只驗證護欄與現況，不寫入
 * ```
 *
 * ## 安全
 *
 * **第一件事就是 `guard.connectVerified()`** —— 四層 fail-closed 護欄未全數通過時
 * 直接 throw，且在那之前不會執行任何 SQL 寫入。詳見 `guard.js`。
 *
 * ## Determinism
 *
 * id 與內容全部固定（`fixtures.js`），時間則以「相對於執行時刻的固定偏移」表示：
 * 「三天前的訂單」在任何一天執行都仍然是三天前。因此 reset → seed 兩次，
 * UI 的版面與資料密度完全一致，截圖才比較得出差異。
 *
 * ## 憑證
 *
 * fixture 密碼**不寫進任何 tracked file**（`CLAUDE.md` §8 明文包含測試腳本）。
 * 來源依序：`UI_REVIEW_PASSWORD` 環境變數 → 隨機產生並寫入 git-ignored 的
 * `Backend/.ui-review-credentials.txt`。腳本**不把密碼印到 stdout**。
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { connectVerified, printProof, UI_REVIEW_DB_NAME } = require("./guard");
const { USERS, MATERIALS, LONG_CREATOR_NAME } = require("./fixtures");
const { ensureCoreTables } = require("../../models/bootstrapModel");

const CREDENTIALS_FILE = path.join(__dirname, "..", "..", ".ui-review-credentials.txt");
const VERIFY_ONLY = process.argv.includes("--verify");

/** 相對於執行時刻的固定偏移，維持 determinism。 */
const SEEDED_AT = new Date();
function at(daysAgo, hour = 10) {
  const d = new Date(SEEDED_AT);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/**
 * 取得 fixture 密碼。
 *
 * 這是一個**只存在於本機一次性資料庫**的憑證：護欄保證它永遠不會被寫進
 * production，而 production 的使用者資料表與本 DB 無關。即便如此仍不入版控。
 */
function resolveFixturePassword() {
  const fromEnv = (process.env.UI_REVIEW_PASSWORD || "").trim();
  if (fromEnv) {
    if (fromEnv.length < 12) {
      throw new Error("UI_REVIEW_PASSWORD 太短（至少 12 字元）。");
    }
    return { password: fromEnv, source: "UI_REVIEW_PASSWORD 環境變數" };
  }

  if (fs.existsSync(CREDENTIALS_FILE)) {
    const existing = fs.readFileSync(CREDENTIALS_FILE, "utf8");
    const match = existing.match(/^password:\s*(\S+)\s*$/m);
    if (match) return { password: match[1], source: `既有的 ${path.basename(CREDENTIALS_FILE)}` };
  }

  // `base64url` 避免產生會被 shell 或 URL 轉義的字元。
  const generated = `uir-${crypto.randomBytes(12).toString("base64url")}`;
  return { password: generated, source: "本次隨機產生" };
}

function writeCredentialsFile(password) {
  const body = [
    "# UI Review fixture credentials —— 本檔為 git-ignored，請勿加入版控。",
    `# 資料庫：${UI_REVIEW_DB_NAME}（本機、可拋棄）。這些帳號在 production 不存在。`,
    "",
    `password: ${password}`,
    "",
    "accounts:",
    ...USERS.map((u) => `  ${u.email.padEnd(30)} ${u.role.padEnd(8)} ${u.label}`),
    "",
  ].join("\n");
  fs.writeFileSync(CREDENTIALS_FILE, body, "utf8");
}

/**
 * 只清空 UI Review 自己建立的資料。
 *
 * 用 `TRUNCATE ... CASCADE` 而不是逐表 DELETE：外鍵關係複雜，逐表刪除的順序
 * 只要錯一個就會留下孤兒列，而孤兒列會讓下一次 seed 的 UNIQUE 撞上。
 */
async function resetData(client) {
  const tables = [
    "settlement_hold_allocations", "settlement_holds", "payout_allocations", "payout_items",
    "creator_payable_slices", "creator_ledger_entries", "creator_cycle_statements",
    "creator_fault_classifications", "unattributed_suspense_entries",
    "reconciliation_dispositions", "reconciliation_runs", "payout_cycles",
    "report_events", "reports", "review", "user_favorites", "cart_items",
    "material_download_tokens", "refund_remedy_cases",
    "consumer_complaint_evidence", "consumer_complaint_events", "consumer_complaints",
    "privacy_request_events", "privacy_requests", "consent_records",
    "manual_payment_proofs", "order_items", "orders",
    "material_contents", "material_images", "material_media_files",
    "material_rights_reviews",
    "activity_logs", "legal_documents", "promotions",
  ];

  // 先把 materials 的檔案指標解開，否則 material_files 的 FK 擋住 TRUNCATE。
  const present = [];
  for (const t of tables) {
    const { rows } = await client.query("SELECT to_regclass($1) IS NOT NULL AS ok", [`public.${t}`]);
    if (rows[0].ok) present.push(t);
  }

  await client.query("BEGIN");
  try {
    await client.query("UPDATE materials SET approved_file_id = NULL, pending_file_id = NULL");
    if (present.length) {
      await client.query(`TRUNCATE TABLE ${present.join(", ")} RESTART IDENTITY CASCADE`);
    }
    await client.query("TRUNCATE TABLE material_files, materials, users RESTART IDENTITY CASCADE");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function seedUsers(client, passwordHash) {
  for (const u of USERS) {
    await client.query(
      `INSERT INTO users (id, email, password_hash, role, created_at, account_status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [u.id, u.email, passwordHash, u.role, at(60)]
    );
  }
}

/** 教材本體檔案：`deliverable` 的 published 教材才有，否則買不了（§21A.1.1）。 */
async function seedMaterialFile(client, material, creatorId, adminId) {
  const fileId = `uir_file_${material.id.replace(/^uir_mat_/, "")}`;
  const storageKey = `ui-review/${fileId}.pdf`;
  await client.query(
    `INSERT INTO material_files
       (id, material_id, storage_key, original_filename, mime_type, size_bytes,
        checksum_sha256, status, uploaded_by, approved_by, uploaded_at, approved_at)
     VALUES ($1, $2, $3, $4, 'application/pdf', $5, $6, 'approved', $7, $8, $9, $10)`,
    [
      fileId, material.id, storageKey, `${material.id}.pdf`,
      // 固定的假大小與 checksum —— 內容不會被 UI 讀到，只是讓狀態合法。
      1024 * (64 + (material.price % 512)),
      crypto.createHash("sha256").update(material.id).digest("hex"),
      creatorId, adminId, at(30), at(28),
    ]
  );
  await client.query("UPDATE materials SET approved_file_id = $2 WHERE id = $1", [material.id, fileId]);
}

async function seedMaterials(client, byKey) {
  const creatorId = byKey.creator.id;
  const adminId = byKey.admin.id;

  for (const m of MATERIALS) {
    const publishedAt = m.status === "published" ? at(20) : null;
    await client.query(
      `INSERT INTO materials
         (id, title, description, short_description, price, category, age_range,
          material_features, cover_image_url, teacher_id, status,
          ip_declaration_accepted, ip_declaration_at,
          review_reason_code, review_note, reviewed_by, reviewed_at, published_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12,$13,$14,$15,$16,$17,$18)`,
      [
        m.id, m.title, m.description, m.shortDescription, m.price, m.category, m.ageRange,
        m.tags ?? [],
        m.cover ? `/uploads/ui-review/${m.cover}` : null,
        creatorId, m.status, at(45),
        m.reviewReasonCode ?? null, m.reviewNote ?? null,
        m.reviewReasonCode ? adminId : null, m.reviewReasonCode ? at(10) : null,
        publishedAt, at(45),
      ]
    );

    if (m.deliverable) await seedMaterialFile(client, m, creatorId, adminId);
  }
}

/**
 * 訂單 fixture —— 四種狀態，各自對應 buyer 端不同的 UI。
 *
 * 只使用 `deliverable` 的 published 教材：那是唯一能合法成為已付商品的狀態。
 */
async function seedOrders(client, byKey) {
  const buyer = byKey.buyer.id;
  const creator = byKey.creator.id;

  const specs = [
    {
      id: "uir_ord_approved", status: "approved", daysAgo: 14, paid: true,
      items: ["uir_mat_baseline", "uir_mat_long_title_zh"],
    },
    {
      id: "uir_ord_pending_payment", status: "pending_payment", daysAgo: 2, paid: false,
      items: ["uir_mat_mixed_lang"],
    },
    {
      id: "uir_ord_pending_review", status: "pending_review", daysAgo: 5, paid: false,
      items: ["uir_mat_high_price"],
    },
    {
      id: "uir_ord_rejected", status: "rejected", daysAgo: 8, paid: false,
      items: ["uir_mat_min_price", "uir_mat_no_tags"],
    },
  ];

  const materialById = new Map(MATERIALS.map((m) => [m.id, m]));

  for (const spec of specs) {
    const items = spec.items.map((id) => materialById.get(id));
    const total = items.reduce((sum, m) => sum + m.price, 0);

    await client.query(
      `INSERT INTO orders
         (id, user_id, status, payment_mode, total_amount, total_price, discount_amount,
          invoice_type, paid_at, created_at, updated_at)
       VALUES ($1,$2,$3,'manual_transfer',$4,$4,0,'none',$5,$6,$6)`,
      [spec.id, buyer, spec.status, total, spec.paid ? at(spec.daysAgo - 1) : null, at(spec.daysAgo)]
    );

    for (const m of items) {
      await client.query(
        `INSERT INTO order_items
           (id, order_id, material_id, title_snapshot, price_snapshot, quantity,
            seller_id, subtotal, created_at)
         VALUES ($1,$2,$3,$4,$5::numeric,1,$6,$7::integer,$8)`,
        [
          `uir_oi_${spec.id}_${m.id}`, spec.id, m.id, m.title,
          m.price, creator, m.price, at(spec.daysAgo),
        ]
      );
    }
  }
}

async function seedBuyerActivity(client, byKey) {
  const buyer = byKey.buyer.id;

  for (const id of ["uir_mat_no_image", "uir_mat_long_title_en", "uir_mat_bulk_03"]) {
    await client.query(
      "INSERT INTO user_favorites (user_id, material_id, created_at) VALUES ($1,$2,$3)",
      [buyer, id, at(9)]
    );
  }

  for (const id of ["uir_mat_bulk_07", "uir_mat_long_tag"]) {
    await client.query(
      "INSERT INTO cart_items (user_id, material_id, quantity, created_at, updated_at) VALUES ($1,$2,1,$3,$3)",
      [buyer, id, at(1)]
    );
  }

  // 教學回饋只給**已購買**（approved 訂單內）的教材，避免製造無效狀態。
  await client.query(
    "INSERT INTO review (material_id, parent_id, rating, comment, created_at) VALUES ($1,$2,$3,$4,$5)",
    [
      "uir_mat_baseline", buyer, 5,
      "練習單的難度分層做得很好，班上不同程度的孩子都能找到適合的題目。已經連續用了三週。",
      at(10),
    ]
  );
  await client.query(
    "INSERT INTO review (material_id, parent_id, rating, comment, created_at) VALUES ($1,$2,$3,$4,$5)",
    ["uir_mat_long_title_zh", buyer, 4, "內容很完整，不過第 8 週的學習單份量偏多。", at(6)]
  );
}

/** 檢舉：唯一入口是教材詳情頁，UNIQUE (material_id, reporter_id) 由 DB 保證。 */
async function seedReports(client, byKey) {
  await client.query(
    `INSERT INTO reports (id, material_id, reporter_id, reason, status, created_at)
     VALUES ($1,$2,$3,$4,'pending',$5)`,
    [
      "uir_rep_pending", "uir_mat_no_tags", byKey.buyer.id,
      "教材內第 12 頁的插圖疑似取自網路圖庫，未標示授權來源，想請平台確認。",
      at(4),
    ]
  );
  await client.query(
    `INSERT INTO reports (id, material_id, reporter_id, reason, status, created_at)
     VALUES ($1,$2,$3,$4,'investigating',$5)`,
    [
      "uir_rep_investigating", "uir_mat_min_price", byKey.buyerEmpty.id,
      "短語卡的音標標示與教育部公布的版本不一致。",
      at(7),
    ]
  );
}

async function main() {
  console.log("");
  console.log("  UI REVIEW — RESET + SEED");
  console.log("  ────────────────────────");

  const { client, identity, target } = await connectVerified();
  try {
    printProof(identity, target);

    if (VERIFY_ONLY) {
      const { rows } = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM users) AS users,
           (SELECT COUNT(*)::int FROM materials) AS materials,
           (SELECT COUNT(*)::int FROM orders) AS orders`
      );
      console.log("\n  --verify：未寫入任何資料。目前內容：", rows[0]);
      return;
    }

    // schema 以正式 bootstrap 建立，UI Review 不維護第二套建表邏輯。
    console.log("\n  [1/5] bootstrap schema …");
    process.env.PGDATABASE = UI_REVIEW_DB_NAME;
    await ensureCoreTables();

    console.log("  [2/5] reset 既有資料 …");
    await resetData(client);

    const { password, source } = resolveFixturePassword();
    const passwordHash = await bcrypt.hash(password, 10);

    console.log("  [3/5] seed 使用者 …");
    const byKey = Object.fromEntries(USERS.map((u) => [u.key, u]));
    await client.query("BEGIN");
    try {
      await seedUsers(client, passwordHash);
      console.log("  [4/5] seed 教材與檔案 …");
      await seedMaterials(client, byKey);
      console.log("  [5/5] seed 訂單、收藏、購物車、回饋、檢舉 …");
      await seedOrders(client, byKey);
      await seedBuyerActivity(client, byKey);
      await seedReports(client, byKey);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    writeCredentialsFile(password);

    const { rows } = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users) AS users,
         (SELECT COUNT(*)::int FROM materials) AS materials,
         (SELECT COUNT(*)::int FROM materials WHERE status='published') AS published,
         (SELECT COUNT(*)::int FROM material_files) AS files,
         (SELECT COUNT(*)::int FROM orders) AS orders,
         (SELECT COUNT(*)::int FROM order_items) AS order_items,
         (SELECT COUNT(*)::int FROM user_favorites) AS favorites,
         (SELECT COUNT(*)::int FROM cart_items) AS cart,
         (SELECT COUNT(*)::int FROM review) AS reviews,
         (SELECT COUNT(*)::int FROM reports) AS reports`
    );

    console.log("\n  ✔ SEED 完成");
    console.table(rows[0]);
    console.log(`  密碼來源：${source}`);
    console.log(`  帳號與密碼已寫入（git-ignored）：${path.relative(process.cwd(), CREDENTIALS_FILE)}`);
    console.log("");
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { main };
