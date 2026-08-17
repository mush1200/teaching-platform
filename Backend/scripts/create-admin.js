#!/usr/bin/env node
/**
 * Maintenance CLI — create a platform admin account.
 *
 * Admin accounts are intentionally NOT creatable over HTTP: `POST /auth/register`
 * rejects `role: "admin"` with 403. This script is the only supported path, and it is
 * meant to be run locally / on the maintenance host by an operator who already has
 * database credentials.
 *
 * Usage (password via environment is preferred — CLI arguments are visible in the
 * process list and shell history):
 *
 *   ADMIN_EMAIL=ops@example.com ADMIN_PASSWORD='<secret>' npm run create-admin
 *   node scripts/create-admin.js --email ops@example.com        # ADMIN_PASSWORD from env
 *
 * The target database comes from the usual environment (DATABASE_URL, or PG*). The
 * resolved database name is printed before any write so the operator can confirm it.
 *
 * The admin password must be at least 16 characters (see MIN_ADMIN_PASSWORD_LENGTH).
 * This script never prints the password or the password hash.
 */
const fs = require("fs");
const path = require("path");

const envPath =
  [path.join(__dirname, "..", ".env"), path.join(__dirname, "..", "..", ".env")].find((p) =>
    fs.existsSync(p)
  ) ?? path.join(__dirname, "..", ".env");
require("dotenv").config({ path: envPath });

const bcrypt = require("bcrypt");
const db = require("../config/db");

/** Role is fixed. The caller cannot choose it. */
const ROLE = "admin";
/** Same cost factor as POST /auth/register. */
const BCRYPT_ROUNDS = 10;
/**
 * Minimum admin password length, enforced. This is deliberately stricter than public
 * registration (which currently has no password policy at all — pre-existing tech debt
 * tracked separately): an admin account is the highest-privilege operator credential.
 * Measured on the trimmed string so padding cannot satisfy the requirement; the password
 * itself is hashed as supplied, matching POST /auth/register.
 */
const MIN_ADMIN_PASSWORD_LENGTH = 16;

function fail(message, hint) {
  console.error(`create-admin: ${message}`);
  if (hint) console.error(`  hint: ${hint}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email" || arg === "-e") out.email = argv[++i];
    else if (arg === "--password" || arg === "-p") out.password = argv[++i];
    else if (arg === "--help" || arg === "-h") out.help = true;
  }
  return out;
}

function usage() {
  console.log(
    [
      "Usage:",
      "  ADMIN_EMAIL=<email> ADMIN_PASSWORD=<password> node scripts/create-admin.js",
      "  node scripts/create-admin.js --email <email> [--password <password>]",
      "",
      "Environment variables take the same names: ADMIN_EMAIL, ADMIN_PASSWORD.",
      "Prefer the environment for the password: CLI arguments are visible to other",
      "processes and are recorded in shell history.",
      "",
      "The password must be at least 16 characters.",
      "The role is always 'admin' and cannot be overridden.",
    ].join("\n")
  );
}

/** Mirrors newId("usr") in routes/auth.js. */
function newUserId() {
  return `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  // Same normalization as POST /auth/register: trim only (no case folding).
  const email = String(args.email ?? process.env.ADMIN_EMAIL ?? "").trim();
  const password = String(args.password ?? process.env.ADMIN_PASSWORD ?? "");

  if (!email) {
    fail("email is required.", "pass --email or set ADMIN_EMAIL");
    return;
  }
  if (!password) {
    fail("password is required.", "set ADMIN_PASSWORD (preferred) or pass --password");
    return;
  }
  if (password.trim().length < MIN_ADMIN_PASSWORD_LENGTH) {
    fail(
      `password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`,
      "use a long, randomly generated value"
    );
    return;
  }

  const target = await db.query("SELECT current_database() AS db");
  console.log(`create-admin: target database = ${target.rows[0].db}`);

  const existing = await db.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [email]);
  if (existing.rows.length > 0) {
    fail(`email already exists: ${email}`, "an account with this email is already registered");
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let created;
  try {
    created = await db.query(
      `INSERT INTO users(id, email, password_hash, role)
       VALUES($1, $2, $3, $4)
       RETURNING id, email, role, created_at`,
      [newUserId(), email, passwordHash, ROLE]
    );
  } catch (err) {
    // UNIQUE(email) backstop for the check-then-insert race above.
    if (err.code === "23505") {
      fail(`email already exists: ${email}`, "lost a race with a concurrent registration");
      return;
    }
    throw err;
  }

  const user = created.rows[0];
  console.log("create-admin: admin account created");
  console.log(`  id      : ${user.id}`);
  console.log(`  email   : ${user.email}`);
  console.log(`  role    : ${user.role}`);
  console.log(`  created : ${new Date(user.created_at).toISOString()}`);
}

main()
  .catch((err) => {
    console.error("create-admin: failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end().catch(() => {});
  });
