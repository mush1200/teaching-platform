#!/usr/bin/env node
/**
 * 把 legacy 付款憑證從公開的 `Backend/uploads/payment-proofs/` 搬到私有儲存。
 *
 *   node scripts/migrate-payment-proofs-to-private.js                 # dry run（預設）
 *   node scripts/migrate-payment-proofs-to-private.js --apply
 *   node scripts/migrate-payment-proofs-to-private.js --apply --delete-public
 *   node scripts/migrate-payment-proofs-to-private.js --apply --delete-public --purge-orphans
 *
 * 先跑 schema migration（`migrations/20260823_payment_proof_private_storage.sql`，
 * 或啟動一次 Backend 讓 bootstrap 套用），這支才有欄位可以寫。
 *
 * ## 動作順序（**不可調換**）
 *
 *     複製到私有儲存 → 讀回來驗 SHA-256 → 更新 DB 指標 → （另一步）才刪公開檔
 *
 * 反過來（先刪公開檔再更新 DB）任何一步失敗都會讓憑證永久消失，而付款憑證是
 * 人工核帳的唯一證據。因此 `--delete-public` 是**獨立的旗標**：它只刪那些
 * 「DB 已標記 private、且私有物件的位元組與公開檔完全一致」的來源檔。
 *
 * ## 可重入
 *
 * 已經是 `private` 的列一律跳過，因此重跑不會產生第二份副本。判斷依據是 DB 狀態
 * 而不是檔案是否存在 —— 後者在「已搬移且已刪公開檔」之後會誤判成「來源不見了」。
 *
 * ## 找不到來源檔
 *
 * 不靜默丟棄。標記成 `legacy_missing` 並在報告中列出 order id 與 proof id，
 * 讓維運知道有幾筆憑證的實體檔案已經不在了。
 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const envPath =
  [path.join(__dirname, "..", ".env"), path.join(__dirname, "..", "..", ".env")].find((p) =>
    fs.existsSync(p)
  ) ?? path.join(__dirname, "..", ".env");
require("dotenv").config({ path: envPath });

const db = require("../config/db");
const { getPrivateFileStorage } = require("../config/privateFileStorage");
const { NAMESPACES } = require("../storage/privateFileStorage");

const PUBLIC_PROOF_DIR = path.join(__dirname, "..", "uploads", "payment-proofs");

/** `proof_url` 裡代表「這是我們自己的公開檔案」的路徑片段。 */
const PUBLIC_PATH_MARKER = "/uploads/payment-proofs/";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const DELETE_PUBLIC = args.has("--delete-public");
const PURGE_ORPHANS = args.has("--purge-orphans");

function log(...parts) {
  console.log(...parts);
}

/**
 * 從 `proof_url` 取出公開檔名。
 *
 * 只接受「本平台公開憑證目錄」的 URL，而且取出來的檔名必須是單純的檔名 ——
 * `basename` 之後再檢查一次形狀，避免 DB 裡被塞進 `../../` 這種東西時，
 * 這支維運腳本反而變成一個讀任意檔案的工具。
 */
function publicFilenameOf(proofUrl) {
  const url = String(proofUrl ?? "");
  const at = url.indexOf(PUBLIC_PATH_MARKER);
  if (at < 0) return null;
  const tail = url.slice(at + PUBLIC_PATH_MARKER.length).split(/[?#]/)[0];
  const decoded = (() => {
    try {
      return decodeURIComponent(tail);
    } catch {
      return tail;
    }
  })();
  const base = path.basename(decoded);
  if (!base || base !== decoded || base === "." || base === "..") return null;
  if (!/^[A-Za-z0-9._-]+$/.test(base)) return null;
  return base;
}

async function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function sha256OfStorageObject(storage, storageKey) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = storage.openReadStream(storageKey);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function main() {
  const dbNameResult = await db.query("SELECT current_database() AS name");
  const dbName = dbNameResult.rows[0].name;
  const storage = getPrivateFileStorage();

  log("=".repeat(72));
  log("payment proof → private storage migration");
  log(`  target database : ${dbName}`);
  log(`  public source   : ${PUBLIC_PROOF_DIR}`);
  log(`  private root    : ${storage.root}/${NAMESPACES.PAYMENT_PROOFS}`);
  log(`  mode            : ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  log(`  delete public   : ${DELETE_PUBLIC ? "yes (verified sources only)" : "no"}`);
  log(`  purge orphans   : ${PURGE_ORPHANS ? "yes" : "no"}`);
  log("=".repeat(72));

  // 這支腳本會改 DB 也會刪檔案。跑之前確認目標資料庫，不接受意外的資料庫。
  if (!["teaching_platform", "teaching_platform_security_test"].includes(dbName)) {
    throw new Error(`ABORT: unexpected target database ${JSON.stringify(dbName)}`);
  }

  const { rows } = await db.query(
    `SELECT id, order_id, proof_url, storage_key, storage_status,
            proof_size_bytes, original_filename
       FROM manual_payment_proofs
      ORDER BY created_at ASC, id ASC`
  );

  const report = {
    dbReferences: rows.length,
    alreadyPrivate: 0,
    migrated: 0,
    externalUrl: 0,
    missingSource: 0,
    failed: 0,
    duplicateSourceReuse: 0,
    missing: [],
    failures: [],
  };

  /** 同一個公開檔案被多列引用時的計數（每一列仍各自產生自己的私有物件）。 */
  const sourceUsage = new Map();
  /** 已成功搬移並驗證過的來源檔名 → 可安全刪除。 */
  const verifiedSources = new Set();
  /** 仍被 legacy 列引用、但尚未成功搬移的來源檔名 → 絕對不能刪。 */
  const unresolvedSources = new Set();

  for (const row of rows) {
    if (row.storage_status === "private" && row.storage_key) {
      report.alreadyPrivate += 1;
      const name = publicFilenameOf(row.proof_url);
      if (name) verifiedSources.add(name);
      continue;
    }

    const filename = publicFilenameOf(row.proof_url);
    if (!filename) {
      /*
       * `proof_url` 不是本平台的公開憑證路徑（seed / fixture 的外部網址）。
       * 平台從來沒有這個檔案，沒有東西可以搬 —— 重新分類讓報表誠實，不當成失敗。
       */
      report.externalUrl += 1;
      if (APPLY && row.storage_status !== "legacy_external") {
        await db.query(
          `UPDATE manual_payment_proofs SET storage_status = 'legacy_external', updated_at = NOW()
            WHERE id = $1`,
          [row.id]
        );
      }
      continue;
    }

    sourceUsage.set(filename, (sourceUsage.get(filename) ?? 0) + 1);
    if (sourceUsage.get(filename) > 1) report.duplicateSourceReuse += 1;

    const sourcePath = path.join(PUBLIC_PROOF_DIR, filename);
    if (!fs.existsSync(sourcePath)) {
      report.missingSource += 1;
      report.missing.push({ proofId: row.id, orderId: row.order_id, filename });
      if (APPLY && row.storage_status !== "legacy_missing") {
        await db.query(
          `UPDATE manual_payment_proofs SET storage_status = 'legacy_missing', updated_at = NOW()
            WHERE id = $1`,
          [row.id]
        );
      }
      continue;
    }

    if (!APPLY) {
      report.migrated += 1;
      continue;
    }

    let storageKey = null;
    try {
      const sourceHash = await sha256OfFile(sourcePath);
      const sourceStat = await fsp.stat(sourcePath);

      const stored = await storage.put(fs.createReadStream(sourcePath), {
        namespace: NAMESPACES.PAYMENT_PROOFS,
      });
      storageKey = stored.storageKey;

      // 寫入時算的 hash 與來源一致嗎？
      if (stored.checksumSha256 !== sourceHash || stored.sizeBytes !== sourceStat.size) {
        throw new Error(
          `checksum/size mismatch on write (source ${sourceHash}/${sourceStat.size}, ` +
            `stored ${stored.checksumSha256}/${stored.sizeBytes})`
        );
      }

      // 再從私有儲存**讀回來**算一次 —— 只信寫入時的計算等於沒有驗證讀取路徑。
      const readBackHash = await sha256OfStorageObject(storage, storageKey);
      if (readBackHash !== sourceHash) {
        throw new Error(`read-back checksum mismatch (${readBackHash} != ${sourceHash})`);
      }

      await db.query(
        `UPDATE manual_payment_proofs
            SET storage_key = $2,
                checksum_sha256 = $3,
                storage_status = 'private',
                proof_size_bytes = COALESCE(proof_size_bytes, $4),
                updated_at = NOW()
          WHERE id = $1`,
        [row.id, storageKey, sourceHash, stored.sizeBytes]
      );

      report.migrated += 1;
      verifiedSources.add(filename);
      log(`  migrated ${row.id} (order ${row.order_id}) ← ${filename}`);
    } catch (err) {
      // DB 沒更新成功就不該留下孤兒物件 —— 沒有任何一列指向它。
      if (storageKey) await storage.delete(storageKey).catch(() => {});
      report.failed += 1;
      report.failures.push({ proofId: row.id, orderId: row.order_id, filename, message: err.message });
      unresolvedSources.add(filename);
      console.error(`  FAILED ${row.id}: ${err.message}`);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 公開副本的清理                                                          */
  /* ---------------------------------------------------------------------- */

  const publicFiles = fs.existsSync(PUBLIC_PROOF_DIR) ? await fsp.readdir(PUBLIC_PROOF_DIR) : [];
  const referenced = new Set([...sourceUsage.keys(), ...verifiedSources]);
  const orphanFiles = publicFiles.filter((f) => !referenced.has(f));

  report.publicFilesOnDisk = publicFiles.length;
  report.orphanPublicFiles = orphanFiles.length;
  report.publicCopiesRemoved = 0;
  report.orphanPublicFilesRemoved = 0;

  if (DELETE_PUBLIC) {
    if (!APPLY) {
      log("\n--delete-public ignored: it only runs together with --apply.");
    } else if (report.failed > 0) {
      log(`\n--delete-public skipped: ${report.failed} row(s) failed to migrate. Fix them first.`);
    } else {
      for (const filename of verifiedSources) {
        if (unresolvedSources.has(filename)) continue;
        const target = path.join(PUBLIC_PROOF_DIR, filename);
        if (!fs.existsSync(target)) continue;
        await fsp.unlink(target);
        report.publicCopiesRemoved += 1;
      }
      if (PURGE_ORPHANS) {
        /*
         * 沒有任何 DB 列引用的公開檔案。它們是失敗上傳／已刪訂單留下的殘骸，
         * 但它們**仍然是真實的付款憑證影像**，放在公開目錄本身就是問題。
         * 需要明確的旗標才刪，因為「沒有引用」也可能是這支腳本的查詢漏了什麼。
         */
        for (const filename of orphanFiles) {
          await fsp.unlink(path.join(PUBLIC_PROOF_DIR, filename));
          report.orphanPublicFilesRemoved += 1;
        }
      }
    }
  }

  log("\n" + "-".repeat(72));
  log("summary");
  log(`  DB proof references        : ${report.dbReferences}`);
  log(`  already private (skipped)  : ${report.alreadyPrivate}`);
  log(`  migrated${APPLY ? "                   " : " (would migrate)   "}: ${report.migrated}`);
  log(`  external URL (not ours)    : ${report.externalUrl}`);
  log(`  missing source file        : ${report.missingSource}`);
  log(`  failed                     : ${report.failed}`);
  log(`  duplicate source reuse     : ${report.duplicateSourceReuse}`);
  log(`  public files on disk       : ${report.publicFilesOnDisk}`);
  log(`  orphan public files        : ${report.orphanPublicFiles}`);
  log(`  public copies removed      : ${report.publicCopiesRemoved}`);
  log(`  orphan public removed      : ${report.orphanPublicFilesRemoved}`);
  if (report.missing.length > 0) {
    log("\n  missing legacy proof (DB pointer without a file on disk):");
    for (const m of report.missing) {
      log(`    proof ${m.proofId}  order ${m.orderId}  file ${m.filename}`);
    }
  }
  if (report.failures.length > 0) {
    log("\n  failures:");
    for (const f of report.failures) {
      log(`    proof ${f.proofId}  order ${f.orderId}  ${f.message}`);
    }
  }
  log("-".repeat(72));
  if (!APPLY) log("\nDry run only. Re-run with --apply to write.");

  return report.failed === 0 ? 0 : 1;
}

main()
  .then((code) => db.pool.end().then(() => process.exit(code)))
  .catch(async (err) => {
    console.error("migration failed:", err);
    await db.pool.end().catch(() => {});
    process.exit(1);
  });
