const nodemailer = require("nodemailer");
const db = require("../config/db");
const { writeActivityLog } = require("../utils/activityLog");
const { REVIEW_REASON_LABEL } = require("../utils/materialWorkflow");
const { formatBankInfoLine } = require("../config/paymentBankInfo");

let cachedTransporter = null;

/** 使用者輸入（例如 Admin 的退回說明）進到 HTML 信件前一律轉義。 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appBaseUrl() {
  const explicit = process.env.PUBLIC_WEB_URL || process.env.FRONTEND_URL || process.env.APP_BASE_URL;
  if (explicit && String(explicit).trim()) return String(explicit).replace(/\/$/, "");
  return "http://localhost:3001";
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("SMTP env missing: SMTP_HOST/SMTP_USER/SMTP_PASS are required");
  }
  cachedTransporter = nodemailer.createTransport({
    host: String(host),
    port,
    secure: port === 465,
    auth: { user: String(user), pass: String(pass) },
  });
  return cachedTransporter;
}

async function verifySmtpConnection() {
  const transporter = getTransporter();
  await transporter.verify();
}

async function sendSmtpTestEmail(to, subject = "SMTP test from Teaching Platform") {
  const target = String(to || "").trim();
  if (!target) {
    throw new Error("test recipient is required");
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const html = emailCard(
    "SMTP 測試成功",
    `<p>這封信代表 SMTP 連線與寄信流程正常。</p>
     <p>時間：${new Date().toLocaleString("zh-TW")}</p>`
  );
  await getTransporter().sendMail({
    from,
    to: target,
    subject,
    html,
    text: "SMTP test succeeded.",
  });
}

async function loadOrderEmailContext(orderId) {
  const orderResult = await db.query(
    `SELECT o.id, o.user_id, o.status, o.total_amount, o.created_at, u.email,
            o.promo_code, o.discount_amount, o.invoice_type, o.invoice_carrier
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE o.id = $1
     LIMIT 1`,
    [String(orderId)]
  );
  if (orderResult.rows.length === 0) throw new Error("order not found for email");
  const order = orderResult.rows[0];
  const itemsResult = await db.query(
    `SELECT title_snapshot AS title, quantity, COALESCE(subtotal, 0)::int AS subtotal
     FROM order_items
     WHERE order_id = $1
     ORDER BY created_at ASC, id ASC`,
    [String(orderId)]
  );
  return { order, items: itemsResult.rows };
}

function pageLinks(orderId) {
  const base = appBaseUrl();
  return {
    order: `${base}/me/orders/${encodeURIComponent(orderId)}`,
    orders: `${base}/me/orders`,
    materials: `${base}/me/materials`,
    paymentProof: `${base}/orders/${encodeURIComponent(orderId)}/payment-proof`,
  };
}

/**
 * 一般客服入口的絕對 URL（`PRE-14`）。
 *
 * 信件裡的文案先前寫「請聯繫平台客服」，但那個管道**不存在** —— 收信的人
 * 照著做也找不到任何地址。現在 `/support`（「聯絡平台」）是**匿名可讀**的，
 * 所以這裡給的是真的到得了的連結。
 *
 * 與其他信件連結共用 `appBaseUrl()`：`PUBLIC_WEB_URL` 未設時會落到 localhost，
 * 那是既有的 `REL-03`／`PRE-12` 問題，本項不另建第二套 base URL 邏輯。
 */
function supportUrl() {
  return `${appBaseUrl()}/support`;
}

function emailCard(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f2ff;color:#1f2937;font-family:Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px;border:1px solid #ece6ff;">
    <h2 style="margin:0 0 12px;color:#5b45d9;">${title}</h2>
    <div style="font-size:14px;line-height:1.7;">${bodyHtml}</div>
  </div></body></html>`;
}

function itemsHtml(items) {
  return `<ul>${items
    .map((item) => `<li>${item.title} x${item.quantity} - NT$${Number(item.subtotal || 0).toLocaleString()}</li>`)
    .join("")}</ul>`;
}

/**
 * 寄信 + 稽核紀錄。
 *
 * 原本是 order-centric（只吃 `orderId`）。教材審核也需要寄信給創作者，因此改成接受
 * `targetType` / `targetId`；**`orderId` 仍然完全相容**（未帶 targetType 時等同
 * `targetType: "order"`），既有的訂單信不需要任何改動。
 *
 * action 名稱刻意沿用 `order_email_sent` / `order_email_failed`：那兩個值在
 * `activity_logs` 裡已有大量歷史資料與既有的中文對照，為了新的 target type 再長出
 * 一組平行的 action 名稱，只會讓「平台寄過哪些信」變成要查兩個地方。
 * 信件屬於哪個領域由 `target_type` 與 `meta.type` 表達。
 */
async function sendEmailWithLog({ orderId, targetType, targetId, to, subject, html, metaType }) {
  const logTargetType = targetType || "order";
  const logTargetId = targetId ?? orderId ?? null;
  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await getTransporter().sendMail({ from, to, subject, html });
    await writeActivityLog({
      targetType: logTargetType,
      targetId: logTargetId,
      action: "order_email_sent",
      meta: { type: metaType, to },
    });
  } catch (err) {
    console.error("send email failed:", err);
    try {
      await writeActivityLog({
        targetType: logTargetType,
        targetId: logTargetId,
        action: "order_email_failed",
        meta: { type: metaType, to, error: String(err?.message || err) },
      });
    } catch (logErr) {
      console.error("record email failure log failed:", logErr);
    }
  }
}

async function sendOrderCreatedEmail(orderId) {
  const { order, items } = await loadOrderEmailContext(orderId);
  const links = pageLinks(orderId);
  const promoHtml = order.promo_code
    ? `<p>優惠代碼：${order.promo_code}（折抵 NT$${Number(order.discount_amount || 0).toLocaleString()}）</p>`
    : "";
  /*
   * 匯款資訊來自 `config/paymentBankInfo.js`（唯一來源）。
   * 未設定時**整段略過**而不是印出佔位帳號 —— 沒有匯款資訊的通知信只是少一段，
   * 印錯帳號則會讓買家把錢匯到不存在的地方。
   */
  const bankLine = formatBankInfoLine();
  /*
   * 未設定時的文案原本是「請聯繫平台客服」—— 一個不存在的管道（`PRE-14`）。
   * 現在指向真的到得了的 `/support`。**不承諾回覆時限**：平台沒有 SLA、
   * 沒有 ticket system，任何「多久內回覆」的字樣都會是另一個假承諾。
   */
  const bankInfoHtml = bankLine
    ? `<p>匯款資訊：${escapeHtml(bankLine)}</p>`
    : `<p>匯款資訊尚未設定，請先不要匯款。請至<a href="${supportUrl()}">聯絡平台</a>頁面查看聯絡方式，確認匯款方式後再付款。</p>`;
  const invoiceHtml =
    order.invoice_type === "carrier" && order.invoice_carrier
      ? `<p>電子發票資訊：<br/>手機載具：${order.invoice_carrier}</p>`
      : "";
  const html = emailCard(
    "訂單已成立，請完成匯款",
    `<p>訂單編號：${order.id}</p>
     <p>建立時間：${new Date(order.created_at).toLocaleString("zh-TW")}</p>
     ${itemsHtml(items)}
     <p>總金額：NT$${Number(order.total_amount || 0).toLocaleString()}</p>
     ${promoHtml}
     ${invoiceHtml}
     ${bankInfoHtml}
     <p><a href="${links.paymentProof}" style="color:#5b45d9;font-weight:700;">上傳付款憑證</a></p>
     <p><a href="${links.orders}" style="color:#5b45d9;">查看我的訂單</a></p>`
  );
  await sendEmailWithLog({ orderId, to: order.email, subject: "【教材平台】訂單成立通知", html, metaType: "order_created" });
}

async function sendProofUploadedEmail(orderId) {
  const { order } = await loadOrderEmailContext(orderId);
  const links = pageLinks(orderId);
  const html = emailCard(
    "已收到付款憑證，等待人工審核",
    `<p>訂單編號：${order.id}</p>
     <p>上傳時間：${new Date().toLocaleString("zh-TW")}</p>
     <p>審核狀態：pending</p>
     <p><a href="${links.order}" style="color:#5b45d9;">查看訂單狀態</a></p>`
  );
  await sendEmailWithLog({ orderId, to: order.email, subject: "【教材平台】付款憑證已送出", html, metaType: "proof_uploaded" });
}

async function sendPaymentApprovedEmail(orderId) {
  const { order, items } = await loadOrderEmailContext(orderId);
  const links = pageLinks(orderId);
  const html = emailCard(
    "付款審核成功，教材已開放下載",
    `<p>訂單編號：${order.id}</p>
     <p>審核時間：${new Date().toLocaleString("zh-TW")}</p>
     ${itemsHtml(items)}
     <p><a href="${links.materials}" style="color:#5b45d9;font-weight:700;">前往我的教材</a></p>
     <p><a href="${links.order}" style="color:#5b45d9;">查看我的訂單</a></p>`
  );
  await sendEmailWithLog({ orderId, to: order.email, subject: "【教材平台】付款審核通過", html, metaType: "payment_approved" });
}

async function sendPaymentRejectedEmail(orderId, reason) {
  const { order } = await loadOrderEmailContext(orderId);
  const links = pageLinks(orderId);
  const html = emailCard(
    "付款憑證審核未通過",
    `<p>訂單編號：${order.id}</p>
     <p>拒絕原因：${reason ? String(reason) : "未提供"}</p>
     <p><a href="${links.paymentProof}" style="color:#5b45d9;font-weight:700;">重新上傳付款憑證</a></p>
     <p><a href="${links.order}" style="color:#5b45d9;">查看我的訂單</a></p>`
  );
  await sendEmailWithLog({ orderId, to: order.email, subject: "【教材平台】付款憑證審核未通過", html, metaType: "payment_rejected" });
}

/* ------------------------------------------------------------------ *
 * 教材審核通知（Material Review MVP Phase 1）
 *
 * 平台**沒有**站內通知系統，也不打算為了這條流程建一個 notification center。
 * 因此只寄兩封 —— 都是由 Admin 觸發、有明確收件人、且創作者不主動來看就不會知道的
 * 終結事件。「送審成功」刻意不寄：創作者剛按下送出，畫面已經確認過了。
 * ------------------------------------------------------------------ */

/** 教材信的共用 context。教材不存在時丟例外，由 fire-and-forget 的呼叫端記錄。 */
async function loadMaterialEmailContext(materialId) {
  const result = await db.query(
    `SELECT m.id, m.title, m.status, m.review_reason_code, m.review_note, u.email
       FROM materials m
       JOIN users u ON u.id = m.teacher_id
      WHERE m.id = $1
      LIMIT 1`,
    [String(materialId)]
  );
  if (result.rows.length === 0) throw new Error("material not found for email");
  return result.rows[0];
}

function materialLinks(materialId) {
  const base = appBaseUrl();
  return {
    edit: `${base}/creator/materials/${encodeURIComponent(materialId)}/edit`,
    list: `${base}/creator/materials`,
    public: `${base}/materials/${encodeURIComponent(materialId)}`,
  };
}

/** 教材已上架 —— 創作者可以開始推廣了。 */
async function sendMaterialPublishedEmail(materialId) {
  try {
    const material = await loadMaterialEmailContext(materialId);
    const links = materialLinks(materialId);
    const html = emailCard(
      "教材已上架",
      `<p>你的教材《${material.title}》已通過審核，現在買家可以看到並購買了。</p>
       <p><a href="${links.public}" style="color:#5b45d9;font-weight:700;">查看教材頁面</a></p>
       <p><a href="${links.list}" style="color:#5b45d9;">回到我的教材</a></p>`
    );
    await sendEmailWithLog({
      targetType: "material",
      targetId: material.id,
      to: material.email,
      subject: "【教材平台】教材已上架",
      html,
      metaType: "material_published",
    });
  } catch (err) {
    console.error("send material published email failed:", err);
  }
}

/**
 * 教材需要修改 —— **這是整條流程最關鍵的一封信**。
 * 沒有站內通知，創作者不會知道要回來修改，教材就永遠卡在 changes_requested。
 */
async function sendMaterialChangesRequestedEmail(materialId) {
  try {
    const material = await loadMaterialEmailContext(materialId);
    const links = materialLinks(materialId);
    const reasonLabel =
      REVIEW_REASON_LABEL[material.review_reason_code] ?? material.review_reason_code ?? "未提供";
    const html = emailCard(
      "教材需要修改",
      `<p>你的教材《${material.title}》尚未通過審核，需要修改後重新送審。</p>
       <p><strong>退回原因：</strong>${reasonLabel}</p>
       <p><strong>審核說明：</strong>${escapeHtml(material.review_note || "")}</p>
       <p><a href="${links.edit}" style="color:#5b45d9;font-weight:700;">前往修改教材</a></p>
       <p style="color:#6b7280;font-size:13px;">修改完成後，請在編輯頁按「儲存並重新送審」，教材才會回到審核佇列。</p>`
    );
    await sendEmailWithLog({
      targetType: "material",
      targetId: material.id,
      to: material.email,
      subject: "【教材平台】教材需要修改",
      html,
      metaType: "material_changes_requested",
    });
  } catch (err) {
    console.error("send material changes-requested email failed:", err);
  }
}

module.exports = {
  verifySmtpConnection,
  sendSmtpTestEmail,
  sendOrderCreatedEmail,
  sendProofUploadedEmail,
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
  sendMaterialPublishedEmail,
  sendMaterialChangesRequestedEmail,
};
