#!/usr/bin/env node
/**
 * Production 物件儲存前置檢查（`PRE-07` STEP 1 / `PRE-08` restore drill）。
 *
 * ## 為什麼不是「看一眼 dashboard 就好」
 *
 * NT$0 架構把三種敏感資產（已售教材、付款憑證、申訴證據）放進外部 bucket，
 * 而其中三個保護是**設定**而不是程式碼 —— 也就是說，它們可以被人在 dashboard 上
 * 一鍵關掉，而應用程式完全不會知道：
 *
 *   bucket 必須 private        → 一旦公開，教材／憑證的三套授權模型同時被繞過
 *   lifecycle 必須 Keep all versions → 一旦改成過期舊版本，誤刪就再也救不回來
 *   Object Lock 必須關閉        → 一旦開啟就無法關閉，且會擋掉合法的刪除路徑
 *
 * 這支腳本把那三件事變成**可重複執行的斷言**，而不是部署當天記得檢查的一次性動作。
 *
 * ## 預設唯讀；`--drill` 才會寫東西
 *
 *   node Backend/scripts/check-production-storage.js
 *       只讀設定與 bucket metadata，不寫入任何物件。
 *
 *   node Backend/scripts/check-production-storage.js --drill
 *       額外執行 `PRE-08` 的物件儲存還原演練：
 *         put → delete（不帶 versionId）→ 列出版本 → 取回前一版 → checksum 比對 → 清乾淨
 *       演練物件寫在 `drill/` 前綴下，**刻意不使用四個正式 namespace**，
 *       因此不可能與真實資產混淆，driver 的 key 驗證也永遠不會接受它。
 *
 * 設定來自與 backend 完全相同的環境變數（`PRIVATE_FILE_STORAGE_S3_*`），
 * 並刻意經由 `config/privateFileStorage.js` 建立 —— 這樣連「設定缺漏會不會 fail closed」
 * 都一併驗到了。**secret 永遠不會被印出來。**
 */

const crypto = require("crypto");
const {
  HeadBucketCommand,
  GetBucketVersioningCommand,
  GetObjectLockConfigurationCommand,
  GetBucketAclCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectVersionsCommand,
} = require("@aws-sdk/client-s3");

const { getPrivateFileStorage } = require("../config/privateFileStorage");

const problems = [];
const warnings = [];

const fail = (m) => { problems.push(m); console.log(`  FAIL  ${m}`); };
const warn = (m) => { warnings.push(m); console.log(`  WARN  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

function drain(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function main() {
  const runDrill = process.argv.includes("--drill");
  console.log(`Production object storage preflight${runDrill ? " + restore drill" : " (read-only)"}\n`);

  // --- 1. 設定 ---------------------------------------------------------------
  console.log("[1] driver configuration");
  let storage;
  try {
    storage = getPrivateFileStorage();
  } catch (err) {
    fail(`config refused to build a driver: ${err.message}`);
    console.log("\nRESULT: BLOCKED");
    process.exit(1);
  }
  if (storage.driver !== "s3") {
    fail(
      `driver is "${storage.driver}", expected "s3". ` +
        "Production must not use the local driver — no free tier offers a persistent volume."
    );
    console.log("\nRESULT: BLOCKED");
    process.exit(1);
  }
  pass(`driver = s3, bucket = ${storage.bucket}`);

  if (process.env.PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION) {
    warn(
      "PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION is set. It does nothing under the s3 " +
        "driver, but its presence suggests someone believes bytes still live on container disk. Remove it."
    );
  }
  if (process.env.PRIVATE_FILE_STORAGE_PATH) {
    warn("PRIVATE_FILE_STORAGE_PATH is set but unused under the s3 driver. Remove it.");
  }

  const client = storage.client;
  const Bucket = storage.bucket;

  // --- 2. 可達性 -------------------------------------------------------------
  console.log("\n[2] bucket reachability");
  try {
    await client.send(new HeadBucketCommand({ Bucket }));
    pass("bucket reachable and credentials accepted");
  } catch (err) {
    fail(`cannot reach bucket: ${err.name || err.message}`);
    console.log("\nRESULT: BLOCKED");
    process.exit(1);
  }

  // --- 3. Versioning（誤刪可復原的唯一來源）----------------------------------
  console.log("\n[3] versioning — the only thing that makes an accidental delete recoverable");
  try {
    const res = await client.send(new GetBucketVersioningCommand({ Bucket }));
    if (res.Status === "Enabled") {
      pass('versioning Enabled (B2 lifecycle "Keep all versions")');
    } else {
      fail(
        `versioning status is "${res.Status ?? "not set"}", expected "Enabled". ` +
          'Set the bucket lifecycle back to "Keep all versions" — with it off, ' +
          "delete() becomes permanent and sold materials / payment proofs cannot be recovered."
      );
    }
  } catch (err) {
    warn(`could not read versioning status (${err.name || err.message}) — verify manually in the dashboard`);
  }

  // --- 4. Object Lock（必須關閉）---------------------------------------------
  console.log("\n[4] object lock — must stay OFF");
  try {
    const res = await client.send(new GetObjectLockConfigurationCommand({ Bucket }));
    if (res.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled") {
      fail(
        "Object Lock is ENABLED. It cannot be disabled once on, and it blocks the two legitimate " +
          "delete paths (upload rollback and cleanupOrphans). This bucket should not be used."
      );
    } else {
      pass("object lock not enabled");
    }
  } catch (err) {
    // 沒設定時供應商回錯誤，這正是我們要的結果。
    const name = err.name || "";
    if (/ObjectLockConfigurationNotFound|NotImplemented|InvalidRequest|NoSuchObjectLock/i.test(name)) {
      pass(`object lock not enabled (${name})`);
    } else {
      warn(`could not determine object lock state (${name || err.message}) — verify manually`);
    }
  }

  // --- 5. Public access（必須關閉）-------------------------------------------
  console.log("\n[5] public access — must be OFF");
  try {
    const acl = await client.send(new GetBucketAclCommand({ Bucket }));
    const publicGrant = (acl.Grants || []).find((g) =>
      String(g.Grantee?.URI || "").includes("AllUsers")
    );
    if (publicGrant) {
      fail(
        "bucket grants access to AllUsers — it is PUBLIC. Every material file, payment proof and " +
          "complaint evidence file is readable by anyone with the URL. Make the bucket private immediately."
      );
    } else {
      pass("no public (AllUsers) grant found");
    }
  } catch (err) {
    warn(
      `could not read bucket ACL (${err.name || err.message}) — ` +
        'verify manually that "Files in Bucket are: Private" in the Backblaze dashboard'
    );
  }

  // --- 6. 還原演練 -----------------------------------------------------------
  if (runDrill) {
    console.log("\n[6] restore drill (PRE-08) — put → delete → recover → checksum");
    const key = `drill/${crypto.randomUUID()}`;
    const payload = crypto.randomBytes(2048);
    const expected = crypto.createHash("sha256").update(payload).digest("hex");
    let versionsToClean = [];

    try {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: payload }));
      pass(`uploaded ${key}`);

      // 不帶 versionId ＝ 應該只插入 delete marker，前一版本仍在。
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
      pass("deleted without versionId (expecting a delete marker, not a purge)");

      const listed = await client.send(
        new ListObjectVersionsCommand({ Bucket, Prefix: key })
      );
      const versions = listed.Versions || [];
      const markers = listed.DeleteMarkers || [];
      versionsToClean = [
        ...versions.map((v) => v.VersionId),
        ...markers.map((m) => m.VersionId),
      ].filter(Boolean);

      if (markers.length === 0) {
        fail("no delete marker found — this bucket does not behave as documented; deletes may be permanent");
      } else {
        pass(`delete marker present (${markers.length})`);
      }
      if (versions.length === 0) {
        fail("prior version is GONE — accidental deletes are NOT recoverable on this bucket");
      } else {
        pass(`prior version retained (${versions.length})`);

        const recovered = await client.send(
          new GetObjectCommand({ Bucket, Key: key, VersionId: versions[0].VersionId })
        );
        const bytes = await drain(recovered.Body);
        const actual = crypto.createHash("sha256").update(bytes).digest("hex");
        if (actual === expected) {
          pass("recovered bytes match the original SHA-256 — RESTORE PATH VERIFIED");
        } else {
          fail("recovered bytes do NOT match the original checksum");
        }
      }
    } catch (err) {
      fail(`drill failed: ${err.name || err.message}`);
    } finally {
      // 演練物件必須清乾淨 —— 帶 versionId 才是真正的永久刪除。
      for (const VersionId of versionsToClean) {
        await client
          .send(new DeleteObjectCommand({ Bucket, Key: key, VersionId }))
          .catch(() => {});
      }
      if (versionsToClean.length) pass(`cleaned up ${versionsToClean.length} drill version(s)`);
    }
  }

  console.log("");
  if (problems.length > 0) {
    console.log(`RESULT: BLOCKED — ${problems.length} problem(s), ${warnings.length} warning(s)`);
    process.exit(1);
  }
  console.log(`RESULT: PASS — 0 problems, ${warnings.length} warning(s)`);
}

main().catch((err) => {
  console.error("preflight crashed:", err.message);
  process.exit(1);
});
