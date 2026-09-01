const test = require("node:test");
const assert = require("node:assert/strict");

const policy = require("../utils/paymentProofPolicy");

/**
 * 付款憑證型別政策的單元測試。
 *
 * 這一層擋的是「把任意檔案改名成 .png 傳上來」。改名之前的實作只看
 * `file.mimetype`（client 宣告值），所以第三層 magic bytes 是這裡最重要的斷言。
 */

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG_HEAD = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8)]);
const WEBP_HEAD = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
]);

test("允許的型別只有 JPG / PNG / WebP —— 憑證不是文件", () => {
  assert.deepEqual(
    [...policy.ALLOWED_MIME_TYPES].sort(),
    ["image/jpeg", "image/png", "image/webp"]
  );
  // 教材本體的格式一個都不該通過憑證的驗證
  for (const [name, mime] of [
    ["a.pdf", "application/pdf"],
    ["a.zip", "application/zip"],
    ["a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ]) {
    const result = policy.validateDeclaredFile({ originalFilename: name, declaredMimeType: mime });
    assert.equal(result.valid, false, `${name} must be rejected`);
  }
});

test("副檔名不在 allowlist → 拒絕（即使宣告成 image/png）", () => {
  for (const name of ["payload.exe", "payload.svg", "payload.gif", "noextension"]) {
    const result = policy.validateDeclaredFile({
      originalFilename: name,
      declaredMimeType: "image/png",
    });
    assert.equal(result.valid, false, `${name} must be rejected`);
    assert.equal(result.code, "unsupported_proof_type");
  }
});

test("副檔名與宣告 MIME 不一致 → mime_mismatch", () => {
  const result = policy.validateDeclaredFile({
    originalFilename: "proof.png",
    declaredMimeType: "image/jpeg",
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, "proof_mime_mismatch");
});

test("宣告值正確時通過前兩層，並回傳 canonical MIME", () => {
  for (const [name, mime, canonical] of [
    ["proof.png", "image/png", "image/png"],
    ["proof.jpg", "image/jpeg", "image/jpeg"],
    ["proof.jpeg", "image/jpeg", "image/jpeg"],
    ["proof.WEBP", "image/webp", "image/webp"],
  ]) {
    const result = policy.validateDeclaredFile({
      originalFilename: name,
      declaredMimeType: mime,
    });
    assert.equal(result.valid, true, `${name} should pass`);
    assert.equal(policy.canonicalMimeType(result.type), canonical);
  }
});

test("magic bytes：真的圖片通過", () => {
  const png = policy.validateDeclaredFile({ originalFilename: "a.png", declaredMimeType: "image/png" });
  assert.equal(policy.validateFileSignature(png.type, PNG_HEAD).valid, true);

  const jpg = policy.validateDeclaredFile({ originalFilename: "a.jpg", declaredMimeType: "image/jpeg" });
  assert.equal(policy.validateFileSignature(jpg.type, JPEG_HEAD).valid, true);

  const webp = policy.validateDeclaredFile({ originalFilename: "a.webp", declaredMimeType: "image/webp" });
  assert.equal(policy.validateFileSignature(webp.type, WEBP_HEAD).valid, true);
});

test("magic bytes：改了副檔名的假圖片被擋下 —— 這是唯一 client 偽造不了的一層", () => {
  const png = policy.validateDeclaredFile({ originalFilename: "a.png", declaredMimeType: "image/png" });

  // Windows PE（.exe）改名成 .png 並宣告成 image/png
  const fakeExe = Buffer.concat([Buffer.from("MZ", "ascii"), Buffer.alloc(10)]);
  const result = policy.validateFileSignature(png.type, fakeExe);
  assert.equal(result.valid, false);
  assert.equal(result.code, "proof_signature_mismatch");

  // HTML（XSS 載體）改名成 .png
  assert.equal(
    policy.validateFileSignature(png.type, Buffer.from("<html><script>", "ascii")).valid,
    false
  );
});

test("WebP 的識別字在 offset 8：只有 RIFF 開頭不算數", () => {
  const webp = policy.validateDeclaredFile({ originalFilename: "a.webp", declaredMimeType: "image/webp" });
  // RIFF 容器但不是 WEBP（例如 .wav）
  const riffWave = Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from("WAVE", "ascii"),
  ]);
  assert.equal(policy.validateFileSignature(webp.type, riffWave).valid, false);
});

test("probe 長度足以判斷所有支援的型別", () => {
  assert.ok(policy.SIGNATURE_PROBE_BYTES >= 12, "WebP 的第二段結束於第 12 byte");
});

test("findTypeByMimeType 只認 allowlist 內的宣告值", () => {
  assert.ok(policy.findTypeByMimeType("image/png"));
  assert.ok(policy.findTypeByMimeType("IMAGE/JPEG"));
  assert.equal(policy.findTypeByMimeType("image/gif"), null);
  assert.equal(policy.findTypeByMimeType("application/pdf"), null);
  assert.equal(policy.findTypeByMimeType(undefined), null);
});
