#!/usr/bin/env node
/**
 * Git pre-push: blocks push when backend behavior-related paths changed but
 * canonical docs were not updated in the same push range.
 *
 * Bypass: SKIP_CANONICAL_DOC_CHECK=1 git push
 */

import { execSync } from "node:child_process";

const ZERO = "0".repeat(40);

const FUNCTIONAL_PREFIXES = [
  "Backend/routes/",
  "Backend/models/",
  "Backend/services/",
  "Backend/repositories/",
  "Backend/migrations/",
  "Backend/middlewares/",
];

const FUNCTIONAL_FILES = new Set(["Backend/index.js", "Backend/config/db.js"]);

const CANONICAL_DOCS = new Set([
  "docs/mvp_rules.md",
  "docs/teaching-platform-mvp-spec-v1.4.md",
  "db/db_schema.sql",
]);

function git(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd: opts.cwd,
      ...opts,
    }).trim();
  } catch {
    return null;
  }
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on("data", (d) => chunks.push(d));
    process.stdin.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf8"))
    );
  });
}

function listChangedFiles(localSha, remoteSha) {
  if (remoteSha !== ZERO && remoteSha) {
    const out = git(`git diff --name-only ${remoteSha}..${localSha}`);
    return out ? out.split("\n").filter(Boolean) : [];
  }

  const bases = [];
  for (const b of ["origin/main", "origin/master"]) {
    const rev = git(`git rev-parse ${b}`);
    if (rev) bases.push(rev);
  }

  let mb = null;
  for (const base of bases) {
    const m = git(`git merge-base ${localSha} ${base}`);
    if (m) {
      mb = m;
      break;
    }
  }

  if (mb) {
    const out = git(`git diff --name-only ${mb}..${localSha}`);
    return out ? out.split("\n").filter(Boolean) : [];
  }

  const single = git(`git rev-parse ${localSha}^`);
  if (!single) {
    const tree = git(`git diff-tree --no-commit-id --name-only -r ${localSha}`);
    return tree ? tree.split("\n").filter(Boolean) : [];
  }

  const out = git(`git diff --name-only ${single}..${localSha}`);
  return out ? out.split("\n").filter(Boolean) : [];
}

function isFunctionalPath(file) {
  if (FUNCTIONAL_FILES.has(file)) return true;
  return FUNCTIONAL_PREFIXES.some((p) => file.startsWith(p));
}

async function main() {
  if (process.env.SKIP_CANONICAL_DOC_CHECK === "1") {
    process.exit(0);
  }

  const input = await readStdin();
  const lines = input.split("\n").filter((l) => l.trim());

  if (!lines.length) {
    process.exit(0);
  }

  let blocked = false;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [, localSha, , remoteSha] = parts;
    if (!localSha || localSha === ZERO) continue;

    const files = listChangedFiles(localSha, remoteSha);
    const functional = files.some(isFunctionalPath);
    const touchedCanonical = files.some((f) => CANONICAL_DOCS.has(f));

    if (functional && !touchedCanonical) {
      blocked = true;
      break;
    }
  }

  if (!blocked) {
    process.exit(0);
  }

  console.error(`
[pre-push] Canonical documentation must be updated together with backend behavior changes.

Include at least one of in this push (aligned with current behavior):
  - docs/mvp_rules.md
  - docs/teaching-platform-mvp-spec-v1.4.md
  - db/db_schema.sql

Override (not recommended): SKIP_CANONICAL_DOC_CHECK=1 git push
`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
