/**
 * 教材行銷素材的型別／大小政策測試（`utils/materialMediaPolicy.js`）。
 *
 * 這裡鎖的是搬進私有儲存**之前不存在**的那一層防線：舊實作只讀 client 宣告的
 * `file.mimetype`，把任意檔案改名並宣告成 `image/png` 就能寫進伺服器磁碟，
 * 而且落在 `express.static` 無條件公開的目錄底下。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const policy = require("../utils/materialMediaPolicy");

/** 造一個「開頭是正確 magic bytes」的假檔案內容。 */
function head(...parts) {
  return Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p, "latin1"))));
}

const JPEG = head(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "JFIF\0\0\0\0");
const PNG = head(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "IHDR");
const GIF = head("GIF89a", Buffer.alloc(6));
const WEBP = head("RIFF", Buffer.from([0x10, 0, 0, 0]), "WEBPVP8 ");
const MP4 = head(Buffer.from([0, 0, 0, 0x18]), "ftypisom", Buffer.alloc(4));
const WEBM = head(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(8));

/* ---------------------------------------------------------------- *
 * kind 與型別家族是綁在一起的
 * ---------------------------------------------------------------- */

test("kind 只有三個合法值", () => {
  assert.deepEqual(policy.KINDS, ["cover", "detail", "demo"]);
  for (const kind of policy.KINDS) assert.equal(policy.isValidKind(kind), true);
  assert.equal(policy.isValidKind("video"), false);
  assert.equal(policy.isValidKind(""), false);
  assert.equal(policy.isValidKind(undefined), false);
});

test("非法的 kind 直接拒絕，不會默默退回 cover", () => {
  const result = policy.validateDeclaredFile({
    kind: "video",
    originalFilename: "a.mp4",
    declaredMimeType: "video/mp4",
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, "invalid_media_kind");
});

test("封面／詳情圖只收圖片，試看影片只收影片", () => {
  const imageOnDemo = policy.validateDeclaredFile({
    kind: "demo",
    originalFilename: "cover.png",
    declaredMimeType: "image/png",
  });
  assert.equal(imageOnDemo.valid, false);
  assert.equal(imageOnDemo.code, "unsupported_media_type");

  const videoOnCover = policy.validateDeclaredFile({
    kind: "cover",
    originalFilename: "clip.mp4",
    declaredMimeType: "video/mp4",
  });
  assert.equal(videoOnCover.valid, false);
  assert.equal(videoOnCover.code, "unsupported_media_type");
});

test("四種圖片與兩種影片各自在對的 kind 上通過宣告層", () => {
  for (const [filename, mime] of [
    ["a.jpg", "image/jpeg"],
    ["a.jpeg", "image/jpeg"],
    ["a.png", "image/png"],
    ["a.gif", "image/gif"],
    ["a.webp", "image/webp"],
  ]) {
    for (const kind of ["cover", "detail"]) {
      const r = policy.validateDeclaredFile({ kind, originalFilename: filename, declaredMimeType: mime });
      assert.equal(r.valid, true, `${kind}/${filename} 應該通過：${JSON.stringify(r)}`);
    }
  }
  for (const [filename, mime] of [
    ["a.mp4", "video/mp4"],
    ["a.m4v", "video/mp4"],
    ["a.webm", "video/webm"],
  ]) {
    const r = policy.validateDeclaredFile({ kind: "demo", originalFilename: filename, declaredMimeType: mime });
    assert.equal(r.valid, true, `demo/${filename} 應該通過：${JSON.stringify(r)}`);
  }
});

/* ---------------------------------------------------------------- *
 * 副檔名 vs 宣告 MIME
 * ---------------------------------------------------------------- */

test("副檔名不在 allowlist 內一律拒絕", () => {
  for (const filename of ["payload.exe", "shell.php", "note.txt", "noextension"]) {
    const r = policy.validateDeclaredFile({
      kind: "cover",
      originalFilename: filename,
      declaredMimeType: "image/png",
    });
    assert.equal(r.valid, false, filename);
    assert.equal(r.code, "unsupported_media_type");
  }
});

test("副檔名與宣告 MIME 不一致 → mismatch，不是靜默採用其中一個", () => {
  const r = policy.validateDeclaredFile({
    kind: "cover",
    originalFilename: "a.png",
    declaredMimeType: "image/jpeg",
  });
  assert.equal(r.valid, false);
  assert.equal(r.code, "media_mime_mismatch");
});

test("沒有宣告 MIME 也拒絕（不猜）", () => {
  const r = policy.validateDeclaredFile({
    kind: "cover",
    originalFilename: "a.png",
    declaredMimeType: "",
  });
  assert.equal(r.valid, false);
  assert.equal(r.code, "unsupported_media_type");
});

/* ---------------------------------------------------------------- *
 * 第三層：magic bytes —— 舊實作完全沒有的一層
 * ---------------------------------------------------------------- */

test("magic bytes 認得六種合法內容", () => {
  const cases = [
    ["a.jpg", "image/jpeg", "cover", JPEG],
    ["a.png", "image/png", "cover", PNG],
    ["a.gif", "image/gif", "detail", GIF],
    ["a.webp", "image/webp", "detail", WEBP],
    ["a.mp4", "video/mp4", "demo", MP4],
    ["a.webm", "video/webm", "demo", WEBM],
  ];
  for (const [filename, mime, kind, bytes] of cases) {
    const declared = policy.validateDeclaredFile({ kind, originalFilename: filename, declaredMimeType: mime });
    assert.equal(declared.valid, true, filename);
    const signature = policy.validateFileSignature(declared.type, bytes);
    assert.equal(signature.valid, true, `${filename} 的 magic bytes 應被接受：${JSON.stringify(signature)}`);
  }
});

test("改了副檔名的可執行檔擋在第三層（前兩層都會被騙過）", () => {
  // MZ = Windows PE 執行檔開頭。副檔名與 MIME 都宣告成 PNG。
  const executable = head(Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(8));
  const declared = policy.validateDeclaredFile({
    kind: "cover",
    originalFilename: "totally-a-cover.png",
    declaredMimeType: "image/png",
  });
  assert.equal(declared.valid, true, "前兩層本來就擋不住改名 —— 這正是需要第三層的理由");

  const signature = policy.validateFileSignature(declared.type, executable);
  assert.equal(signature.valid, false);
  assert.equal(signature.code, "media_signature_mismatch");
});

test("RIFF 容器不是 WebP 就不通過（只比對開頭前綴會漏掉）", () => {
  // "RIFF" + size + "WAVE" —— 一個 .wav 檔
  const wav = head("RIFF", Buffer.from([0x10, 0, 0, 0]), "WAVEfmt ");
  const declared = policy.validateDeclaredFile({
    kind: "cover",
    originalFilename: "a.webp",
    declaredMimeType: "image/webp",
  });
  assert.equal(declared.valid, true);
  assert.equal(policy.validateFileSignature(declared.type, wav).valid, false);
});

test("MP4 的 ftyp 在 offset 4，不能用前綴比對", () => {
  assert.equal(policy.matchesSignature("mp4", MP4), true);
  // 同樣的位元組放在 offset 0 反而不是合法的 MP4 開頭
  assert.equal(policy.matchesSignature("mp4", Buffer.from("ftypisom0000", "latin1")), false);
});

test("GIF87a 與 GIF89a 兩種版本都認得", () => {
  assert.equal(policy.matchesSignature("gif", head("GIF87a", Buffer.alloc(6))), true);
  assert.equal(policy.matchesSignature("gif", head("GIF89a", Buffer.alloc(6))), true);
  assert.equal(policy.matchesSignature("gif", head("GIF00a", Buffer.alloc(6))), false);
});

test("位元組不足時不會誤判為通過", () => {
  assert.equal(policy.matchesSignature("webp", Buffer.from("RIFF", "latin1")), false);
  assert.equal(policy.matchesSignature("png", Buffer.alloc(0)), false);
  assert.equal(policy.matchesSignature("jpeg", undefined), false);
});

test("SIGNATURE_PROBE_BYTES 足以判斷所有已登記的 signature", () => {
  // WebP 的第二段結束在第 12 個 byte —— probe 長度不能比它短，否則
  // 「檔案比 probe 短」的 flush 分支會拿不到足夠的位元組。
  assert.ok(policy.SIGNATURE_PROBE_BYTES >= 12);
});

test("canonical MIME 取型別定義的第一個值，不採用 client 宣告值", () => {
  const declared = policy.validateDeclaredFile({
    kind: "cover",
    originalFilename: "a.jpeg",
    declaredMimeType: "image/jpeg",
  });
  assert.equal(policy.canonicalMimeType(declared.type), "image/jpeg");
});
