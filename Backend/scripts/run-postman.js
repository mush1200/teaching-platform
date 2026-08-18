#!/usr/bin/env node
/**
 * Runs the Postman collection with Newman, injecting the admin credentials from the
 * environment instead of storing them in the collection or the environment file.
 *
 * Public admin registration is blocked (403), so the collection signs in to a
 * pre-existing admin account. Create it once with `npm run create-admin`, then:
 *
 *   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npm run postman:newman
 *
 * Newman is invoked programmatically (it is already a devDependency) rather than through
 * the CLI: `--env-var` would place the password in the child process argv, where other
 * processes can read it. Values here stay in memory and are never logged.
 */
const path = require("path");
// Load Backend/.env explicitly, resolved from this file rather than process.cwd(),
// so the script behaves identically from the repo root and from Backend/.
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const newman = require("newman");

const POSTMAN_DIR = path.join(__dirname, "..", "..", "docs", "postman");
const COLLECTION = path.join(POSTMAN_DIR, "teaching-platform-backend.postman_collection.json");
const ENVIRONMENT = path.join(POSTMAN_DIR, "local.postman_environment.json");

function requireEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === "") {
    console.error(
      `run-postman: ${name} is not set.\n` +
        "  The collection signs in as an existing admin; it never creates one " +
        "(public admin registration returns 403).\n" +
        "  Create the account once with `npm run create-admin`, then export " +
        "TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD.\n" +
        "  Never commit these values."
    );
    process.exit(1);
  }
  return String(raw);
}

const testAdminEmail = requireEnv("TEST_ADMIN_EMAIL");
const testAdminPassword = requireEnv("TEST_ADMIN_PASSWORD");

console.log(`run-postman: admin account = ${testAdminEmail}`);

newman.run(
  {
    collection: COLLECTION,
    environment: ENVIRONMENT,
    // The upload-proof requests reference their fixtures as `fixtures/<name>`; Newman
    // resolves formdata file paths relative to workingDir, so pin it to docs/postman/
    // regardless of where npm was invoked from.
    workingDir: POSTMAN_DIR,
    envVar: [
      { key: "testAdminEmail", value: testAdminEmail },
      { key: "testAdminPassword", value: testAdminPassword },
    ],
    reporters: ["cli"],
    timeoutRequest: 60000,
  },
  (err, summary) => {
    if (err) {
      console.error("run-postman: newman failed to run:", err.message);
      process.exit(1);
    }
    const failures = summary && summary.run && summary.run.failures ? summary.run.failures.length : 0;
    if (failures > 0) {
      console.error(`run-postman: ${failures} assertion failure(s).`);
      process.exit(1);
    }
    console.log("run-postman: all Postman assertions passed.");
  }
);
