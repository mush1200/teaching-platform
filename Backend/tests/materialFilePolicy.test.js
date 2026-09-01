const test = require("node:test");
const assert = require("node:assert/strict");

const policy = require("../utils/materialFilePolicy");

/**
 * 教材本體檔案型別政策的單元測試。
 *
 * 重點不是「allowlist 裡有幾個副檔名」，而是**三層驗證各自真的擋得住什麼**：
 * 副檔名擋不了改名，宣告 MIME 也擋不了 —— 只有 magic bytes 擋得住。
 * 這些測試把「把 .exe 改名成 .pdf」這類真實攻擊寫成回歸案例。
 */

const PDF_HEAD = Buffer.from("%PDF-1.7\n", "latin1");
const ZIP_HEAD = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
// MZ = Windows 可執行檔
const EXE_HEAD = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

test("接受 allowlist 內的格式", () => {
  for (const type of policy.ALLOWED_MATERIAL_FILE_TYPES) {
    const result = policy.validateDeclaredFile({
      originalFilename: `教材${type.extension}`,
      declaredMimeType: type.mimeTypes[0],
    });
    assert.equal(result.valid, true, `${type.extension} should be allowed`);
    assert.equal(result.type.extension, type.extension);
  }
});

test("明確封鎖的副檔名回 blocked_file_type 而不是泛用的不支援", () => {
  for (const extension of policy.EXPLICITLY_BLOCKED_EXTENSIONS) {
    const result = policy.validateDeclaredFile({
      originalFilename: `payload${extension}`,
      declaredMimeType: "application/octet-stream",
    });
    assert.equal(result.valid, false);
    assert.equal(result.code, "blocked_file_type", `${extension} should be explicitly blocked`);
  }
});

test("圖片不能當作教材本體", () => {
  for (const name of ["cover.png", "photo.jpg", "scan.webp"]) {
    const result = policy.validateDeclaredFile({ originalFilename: name, declaredMimeType: "image/png" });
    assert.equal(result.valid, false);
    assert.equal(result.code, "unsupported_file_type");
  }
});

test("沒有副檔名一律拒絕", () => {
  const result = policy.validateDeclaredFile({ originalFilename: "material", declaredMimeType: "application/pdf" });
  assert.equal(result.valid, false);
  assert.equal(result.code, "unsupported_file_type");
});

test("副檔名與宣告 MIME 不一致時拒絕", () => {
  const result = policy.validateDeclaredFile({
    originalFilename: "material.pdf",
    declaredMimeType: "application/x-msdownload",
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, "mime_mismatch");
});

test("client 沒有宣告 MIME 時不因此拒絕（後面還有 magic bytes 把關）", () => {
  const result = policy.validateDeclaredFile({ originalFilename: "material.pdf", declaredMimeType: "" });
  assert.equal(result.valid, true);
});

test("改名的執行檔過得了前兩層，但過不了 magic bytes", () => {
  // 攻擊者完全控制檔名與宣告的 MIME，所以前兩層一定會放行。
  const declared = policy.validateDeclaredFile({
    originalFilename: "教材.pdf",
    declaredMimeType: "application/pdf",
  });
  assert.equal(declared.valid, true, "第一、二層本來就擋不住改名");

  const signature = policy.validateFileSignature(declared.type, EXE_HEAD);
  assert.equal(signature.valid, false);
  assert.equal(signature.code, "signature_mismatch");
});

test("真的 PDF / ZIP 通得過 magic bytes", () => {
  const pdf = policy.validateDeclaredFile({ originalFilename: "a.pdf", declaredMimeType: "application/pdf" });
  assert.equal(policy.validateFileSignature(pdf.type, PDF_HEAD).valid, true);

  const zip = policy.validateDeclaredFile({ originalFilename: "a.zip", declaredMimeType: "application/zip" });
  assert.equal(policy.validateFileSignature(zip.type, ZIP_HEAD).valid, true);
});

test("OOXML 只驗到「是 zip 容器」—— 這是已知且刻意的邊界", () => {
  const pptx = policy.validateDeclaredFile({
    originalFilename: "slides.pptx",
    declaredMimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  // 一個普通 zip 的開頭會通過 pptx 的檢查：要再往下分辨得解壓縮讀 [Content_Types].xml。
  assert.equal(policy.validateFileSignature(pptx.type, ZIP_HEAD).valid, true);
  assert.equal(pptx.type.signature, "zip");
});

test("PDF 的宣告 MIME 不接受 zip 家族的值（型別之間不互通）", () => {
  const result = policy.validateDeclaredFile({
    originalFilename: "a.pdf",
    declaredMimeType: "application/zip",
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, "mime_mismatch");
});

test("副檔名比對不分大小寫", () => {
  const result = policy.validateDeclaredFile({ originalFilename: "MATERIAL.PDF", declaredMimeType: "application/pdf" });
  assert.equal(result.valid, true);

  const blocked = policy.validateDeclaredFile({ originalFilename: "Payload.EXE", declaredMimeType: "" });
  assert.equal(blocked.code, "blocked_file_type");
});

test("多個點的檔名以最後一段為準（.pdf.exe 是執行檔）", () => {
  const result = policy.validateDeclaredFile({ originalFilename: "教材.pdf.exe", declaredMimeType: "application/pdf" });
  assert.equal(result.valid, false);
  assert.equal(result.code, "blocked_file_type");
});

test("錯誤訊息會列出支援格式，讓創作者知道該怎麼辦", () => {
  const result = policy.validateDeclaredFile({ originalFilename: "a.rar", declaredMimeType: "" });
  assert.match(result.message, /PDF/);
  assert.match(result.message, /ZIP/);
});

test("比 probe 長度還短的內容不會被誤判為通過", () => {
  const pdf = policy.validateDeclaredFile({ originalFilename: "a.pdf", declaredMimeType: "application/pdf" });
  assert.equal(policy.validateFileSignature(pdf.type, Buffer.from("%PD", "latin1")).valid, false);
});

test("canonicalMimeType 回傳平台自己的值，不是 client 宣告的值", () => {
  const zip = policy.validateDeclaredFile({
    originalFilename: "a.zip",
    declaredMimeType: "application/x-zip-compressed",
  });
  assert.equal(policy.canonicalMimeType(zip.type), "application/zip");
});
