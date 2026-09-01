const http = require("http");
const crypto = require("crypto");

/**
 * 記憶體內的 S3 測試替身。
 *
 * ## 為什麼需要它（而不是 mock 掉 SDK）
 *
 * `S3PrivateFileStorage` 真正容易出錯的地方不在「有沒有呼叫對的 command」，而在
 * **串流的接縫**：`openReadStream()` 必須同步回傳、GetObject 卻是非同步的；
 * Range 要能正確轉成 `bytes=a-b` 並吃到 206；probe 開了又立刻 destroy 時要中止請求。
 * 把 SDK stub 掉會把這些全部略過 —— 那樣的測試只證明我記得呼叫某個函式。
 *
 * 所以這裡起一個真的 HTTP server，讓真的 SDK 走真的 SigV4、真的 wire format 打過來。
 * 它**不驗證簽章**（測試替身不是安全邊界），其餘行為盡量貼近 S3。
 *
 * ## 有 versioning，因為那正是要驗的東西
 *
 * Backblaze B2 的 bucket 預設 lifecycle 是「Keep all versions」，而
 * `S3PrivateFileStorage.delete()` **不送 `versionId`** —— 依官方文件，那只會插入
 * delete marker，前一個版本仍可復原。這是整個 `PRE-08` 備份策略的地基。
 *
 * 因此這個替身實作了版本鏈：PUT 疊加新版本、不帶 versionId 的 DELETE 疊加 delete marker、
 * 帶 versionId 的 DELETE 才是真的抹掉。`scripts/check-production-storage.js --drill`
 * 的還原演練邏輯就是靠它先驗過一遍，才敢對真實 bucket 執行。
 *
 * **這不是在證明 B2 的行為**（那由官方文件與真實演練負責），
 * 而是在證明**我們的腳本正確地實作了那個行為所需的呼叫序列**。
 *
 * 支援的操作剛好是 driver 與檢查腳本會用到的那些，不多做：
 *   PutObject / GetObject（含 Range、versionId）/ HeadObject / DeleteObject（含 versionId）
 *   CreateMultipartUpload / UploadPart / CompleteMultipartUpload / AbortMultipartUpload
 *   HeadBucket / GetBucketVersioning / GetBucketAcl / GetObjectLockConfiguration
 *   ListObjectVersions
 */

function etagOf(buffer) {
  return `"${crypto.createHash("md5").update(buffer).digest("hex")}"`;
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';

function xml(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/xml",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function xmlError(res, status, code, message) {
  xml(res, status, `${XML_DECL}<Error><Code>${code}</Code><Message>${message}</Message></Error>`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * @param {{bucket?: string, publicAcl?: boolean, versioning?: boolean, objectLock?: boolean}} [options]
 *   後三個旗標讓測試可以模擬「設定被改壞」的 bucket，
 *   驗證 check-production-storage.js 真的會擋下來。
 */
async function startFakeS3Server({
  bucket = "test-bucket",
  publicAcl = false,
  versioning = true,
  objectLock = false,
} = {}) {
  /** key -> 版本鏈（**最新在前**）。每個項目：{ versionId, body, isDeleteMarker } */
  const versions = new Map();
  /** uploadId -> Map<partNumber, Buffer> */
  const uploads = new Map();
  const requests = [];

  const chainOf = (key) => versions.get(key) || [];
  const latest = (key) => chainOf(key)[0] || null;

  function addVersion(key, entry) {
    const chain = versions.get(key) || [];
    chain.unshift({ versionId: crypto.randomUUID(), ...entry });
    versions.set(key, chain);
    return chain[0];
  }

  /** 對外只呈現「目前可見的物件」，讓 standalone harness 的計數符合直覺。 */
  const objects = {
    get size() {
      let n = 0;
      for (const key of versions.keys()) {
        const head = latest(key);
        if (head && !head.isDeleteMarker) n += 1;
      }
      return n;
    },
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const segments = url.pathname.replace(/^\//, "").split("/");
    const requestBucket = segments.shift();
    const key = segments.join("/");
    const uploadId = url.searchParams.get("uploadId");
    const versionId = url.searchParams.get("versionId");

    requests.push({ method: req.method, key, range: req.headers.range });

    if (requestBucket !== bucket) return xmlError(res, 404, "NoSuchBucket", "bucket not found");

    // ---- bucket 層（key 為空）------------------------------------------
    if (!key) {
      if (req.method === "HEAD") {
        // Content-Length 必須明寫：HEAD ＋ 200 ＋ 沒有長度時，Node 會走 chunked，
        // 而 SDK 會一直等一個永遠不會來的 body（實測 HeadBucket 直接卡住）。
        res.writeHead(200, { "Content-Length": "0" });
        return res.end();
      }
      if (req.method === "GET" && url.searchParams.has("versioning")) {
        return xml(
          res,
          200,
          `${XML_DECL}<VersioningConfiguration>${versioning ? "<Status>Enabled</Status>" : ""}</VersioningConfiguration>`
        );
      }
      if (req.method === "GET" && url.searchParams.has("object-lock")) {
        if (!objectLock) {
          return xmlError(
            res,
            404,
            "ObjectLockConfigurationNotFoundError",
            "Object Lock configuration does not exist for this bucket"
          );
        }
        return xml(
          res,
          200,
          `${XML_DECL}<ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled></ObjectLockConfiguration>`
        );
      }
      if (req.method === "GET" && url.searchParams.has("acl")) {
        const grant = publicAcl
          ? '<Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="Group">' +
            "<URI>http://acs.amazonaws.com/groups/global/AllUsers</URI></Grantee>" +
            "<Permission>READ</Permission></Grant>"
          : "";
        return xml(
          res,
          200,
          `${XML_DECL}<AccessControlPolicy><Owner><ID>fake</ID></Owner>` +
            `<AccessControlList>${grant}</AccessControlList></AccessControlPolicy>`
        );
      }
      if (req.method === "GET" && url.searchParams.has("versions")) {
        const prefix = url.searchParams.get("prefix") || "";
        let body = `${XML_DECL}<ListVersionsResult><Name>${bucket}</Name>`;
        for (const [k, chain] of versions) {
          if (!k.startsWith(prefix)) continue;
          for (const v of chain) {
            const tag = v.isDeleteMarker ? "DeleteMarker" : "Version";
            body +=
              `<${tag}><Key>${k}</Key><VersionId>${v.versionId}</VersionId>` +
              `<IsLatest>${chain[0] === v}</IsLatest>` +
              (v.isDeleteMarker ? "" : `<Size>${v.body.length}</Size><ETag>${etagOf(v.body)}</ETag>`) +
              `</${tag}>`;
          }
        }
        return xml(res, 200, body + "</ListVersionsResult>");
      }
      return xmlError(res, 405, "MethodNotAllowed", "unsupported bucket operation in the test double");
    }

    // ---- multipart -----------------------------------------------------
    if (req.method === "POST" && url.searchParams.has("uploads")) {
      await readBody(req);
      const id = crypto.randomUUID();
      uploads.set(id, new Map());
      return xml(
        res,
        200,
        `${XML_DECL}<InitiateMultipartUploadResult><Bucket>${bucket}</Bucket>` +
          `<Key>${key}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`
      );
    }
    if (req.method === "PUT" && uploadId) {
      const parts = uploads.get(uploadId);
      if (!parts) return xmlError(res, 404, "NoSuchUpload", "no such upload");
      parts.set(Number(url.searchParams.get("partNumber")), await readBody(req));
      res.writeHead(200, { ETag: etagOf(Buffer.from("part")) });
      return res.end();
    }
    if (req.method === "POST" && uploadId) {
      await readBody(req);
      const parts = uploads.get(uploadId);
      if (!parts) return xmlError(res, 404, "NoSuchUpload", "no such upload");
      const ordered = [...parts.keys()].sort((a, b) => a - b).map((n) => parts.get(n));
      const merged = Buffer.concat(ordered);
      addVersion(key, { body: merged, isDeleteMarker: false });
      uploads.delete(uploadId);
      return xml(
        res,
        200,
        `${XML_DECL}<CompleteMultipartUploadResult><Bucket>${bucket}</Bucket>` +
          `<Key>${key}</Key><ETag>${etagOf(merged)}</ETag></CompleteMultipartUploadResult>`
      );
    }
    if (req.method === "DELETE" && uploadId) {
      uploads.delete(uploadId);
      res.writeHead(204);
      return res.end();
    }

    // ---- 單一物件 -------------------------------------------------------
    if (req.method === "PUT") {
      const data = await readBody(req);
      const v = addVersion(key, { body: data, isDeleteMarker: false });
      res.writeHead(200, { ETag: etagOf(data), "x-amz-version-id": v.versionId });
      return res.end();
    }

    /** 取出要服務的版本；null 代表「對外看起來不存在」。 */
    function resolveVersion() {
      if (versionId) {
        const found = chainOf(key).find((v) => v.versionId === versionId);
        return found && !found.isDeleteMarker ? found : null;
      }
      const head = latest(key);
      return head && !head.isDeleteMarker ? head : null;
    }

    if (req.method === "HEAD") {
      const v = resolveVersion();
      if (!v) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { "Content-Length": String(v.body.length), ETag: etagOf(v.body) });
      return res.end();
    }

    if (req.method === "GET") {
      const v = resolveVersion();
      if (!v) return xmlError(res, 404, "NoSuchKey", "key not found");

      const range = /^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range || ""));
      if (range) {
        const start = Number(range[1]);
        const end = Math.min(Number(range[2]), v.body.length - 1);
        if (start > end || start >= v.body.length) {
          res.writeHead(416, { "Content-Range": `bytes */${v.body.length}` });
          return res.end();
        }
        const slice = v.body.subarray(start, end + 1);
        res.writeHead(206, {
          "Content-Length": String(slice.length),
          "Content-Range": `bytes ${start}-${end}/${v.body.length}`,
        });
        return res.end(slice);
      }
      res.writeHead(200, { "Content-Length": String(v.body.length) });
      return res.end(v.body);
    }

    if (req.method === "DELETE") {
      if (versionId) {
        // 帶 versionId ＝ 真正永久刪除該版本。
        const chain = chainOf(key).filter((v) => v.versionId !== versionId);
        if (chain.length) versions.set(key, chain);
        else versions.delete(key);
      } else if (latest(key)) {
        // 不帶 versionId ＝ 只插入 delete marker，前一版本留著。
        addVersion(key, { body: null, isDeleteMarker: true });
      }
      res.writeHead(204);
      return res.end();
    }

    return xmlError(res, 405, "MethodNotAllowed", "unsupported in the test double");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    objects,
    versions,
    requests,
    /*
     * `closeAllConnections()` 是必要的，不是保險。SDK 用 keep-alive，
     * 單純 `server.close()` 會一直等到那些 socket 自己逾時（實測每個 case 多 5 秒），
     * 把一支本來 2 秒的測試拖成 50 秒。
     */
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

module.exports = { startFakeS3Server };
