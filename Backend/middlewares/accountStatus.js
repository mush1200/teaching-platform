/**
 * 帳號狀態閘門（P1-09 Gate 1）。
 *
 * ## 為什麼不放在 `requireAuth` 裡
 *
 * `middlewares/auth.js` 的 `requireAuth` **完全不碰資料庫** —— `req.user` 全部來自
 * 已驗簽的 JWT payload。這讓讀取路徑非常便宜，是刻意的設計。
 *
 * 但帳號凍結**必須即時生效**（應記載事項第十二點：「**立即**暫停該帳號所生交易之
 * 處理及後續利用」），而 JWT 有效期是 **7 天** ——
 * 把狀態塞進 token 會讓凍結延遲至多 7 天，等於沒有凍結。
 *
 * 因此本中介層做**即時 DB 查詢**，並且**只掛在敏感寫入路徑**：
 *   - 讀取路徑不付出額外查詢成本
 *   - 被保護的範圍是**明確列舉、可稽核**的，而不是散落在各 route 的 `if` 判斷
 *
 * ## fail-closed
 *
 * 查不到使用者、或查詢失敗時，一律**拒絕**而非放行。
 * 這是安全閘門該有的姿態，也與本 repo 既有慣例一致
 * （`config/privateFileStorage.js` 在 production + local driver 時 fail-closed 拒絕啟動）。
 *
 * ## 判準：哪些操作該擋
 *
 * 凍結所禁止的是**會產生金錢後果、授權後果，或對外不可逆之公開內容**的寫入。
 * 依此判準：
 *   擋   建立訂單／提交付款資訊／建立與修改教材／換教材檔／重新送審／教材檔案上傳／發表評價
 *   不擋 購物車與收藏（不是「交易」，且無金錢或授權後果，擋了只是把失敗點提前）
 *   不擋 檢舉（送往 Admin 的**非公開**通報管道；擋掉可能妨礙正當的安全通報）
 *   不擋 登入與所有讀取（使用者必須看得到自己被凍結、看得到既有訂單與客服資訊）
 *
 * Admin 路徑刻意不掛此閘門：admin 帳號只能由維運 CLI 建立，
 * 且把 admin 鎖在門外會讓解凍本身變得不可能。
 */

const db = require("../config/db");

/*
 * 對外訊息必須指向**真的存在**的入口（`BUY-02` dead-copy reconciliation，2026-08-27）。
 *
 * 舊文案是「請聯繫客服」，但平台**沒有客服系統** —— 被凍結的人因此拿到一個
 * 死路訊息，而他正是最需要提出異議的人。
 *
 * 指向消費申訴是安全的，因為本檔**刻意不把申訴列入凍結封鎖範圍**
 * （見下方判準；`routes/complaints.js` 也明文不套 `requireActiveAccount`）：
 * 凍結帳號仍可登入、仍可讀取、**仍可提出申訴**。
 * 買家外殼的「申訴與消費爭議」入口即為該流程的全域入口。
 */
const FROZEN_RESPONSE = Object.freeze({
  code: "account_frozen",
  message: "此帳號目前已被暫停交易處理。如需提出異議，請於登入後前往「申訴與消費爭議」。",
});

/**
 * 要求帳號處於 `active`。必須掛在 `requireAuth` **之後**。
 */
async function requireActiveAccount(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  let row;
  try {
    const { rows } = await db.query(
      `SELECT account_status FROM users WHERE id = $1`,
      [String(userId)]
    );
    row = rows[0];
  } catch (err) {
    // fail-closed：狀態不明時不得放行敏感寫入。
    console.error("account status check failed:", err);
    return res.status(503).json({
      code: "account_status_unavailable",
      message: "無法確認帳號狀態，請稍後再試。",
    });
  }

  if (!row) {
    // token 有效但使用者已不存在 —— 同樣不得放行。
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (row.account_status !== "active") {
    return res.status(403).json(FROZEN_RESPONSE);
  }

  return next();
}

module.exports = { requireActiveAccount, FROZEN_RESPONSE };
