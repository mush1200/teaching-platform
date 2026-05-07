const fs = require("fs");
const path = require("path");

const envPath =
  [path.join(__dirname, "..", ".env"), path.join(__dirname, ".env")].find((p) => fs.existsSync(p)) ??
  path.join(__dirname, "..", ".env");
require("dotenv").config({ path: envPath });

const { verifySmtpConnection, sendSmtpTestEmail } = require("../services/emailService");

async function main() {
  const to = process.env.SMTP_TEST_TO || process.argv[2];
  console.log("[smtp-smoke] verifying SMTP connection...");
  await verifySmtpConnection();
  console.log("[smtp-smoke] SMTP verify OK.");

  if (to) {
    console.log(`[smtp-smoke] sending test email to ${to} ...`);
    await sendSmtpTestEmail(to, "SMTP smoke test | Teaching Platform");
    console.log("[smtp-smoke] Test email sent successfully.");
  } else {
    console.log("[smtp-smoke] skip sendMail (set SMTP_TEST_TO or pass recipient as argv).");
  }
}

main().catch((err) => {
  console.error("[smtp-smoke] FAILED:", err?.message || err);
  process.exit(1);
});
