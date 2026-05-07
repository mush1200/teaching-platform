const nodemailer = require("nodemailer");
const db = require("../config/db");
const { writeActivityLog } = require("../utils/activityLog");

let cachedTransporter = null;

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

async function sendEmailWithLog({ orderId, to, subject, html, metaType }) {
  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    await getTransporter().sendMail({ from, to, subject, html });
    await writeActivityLog({
      targetType: "order",
      targetId: orderId,
      action: "order_email_sent",
      meta: { type: metaType, to },
    });
  } catch (err) {
    console.error("send email failed:", err);
    try {
      await writeActivityLog({
        targetType: "order",
        targetId: orderId,
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
     <p>匯款資訊：銀行代碼 812 / 戶名 Teaching Platform / 帳號 1234-5678-9012-3456</p>
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

module.exports = {
  verifySmtpConnection,
  sendSmtpTestEmail,
  sendOrderCreatedEmail,
  sendProofUploadedEmail,
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
};
