/**
 * Multipart 檔名編碼修正的單元測試（`DX-14`）。
 *
 * 這裡釘住的是**「什麼時候不該動」**跟「什麼時候該還原」一樣重要：
 * 無條件 `latin1 → utf8` 會破壞本來就正確的檔名，因此兩道條件都必須被測到。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeMultipartFilename,
  normalizeUploadedFilenames,
} = require("../utils/multipartFilename");

/** 模擬 busboy 的 latin1 解讀：把真實檔名的 UTF-8 bytes 逐位元組當成 latin1 字元。 */
const asBusboyWouldGiveIt = (real) => Buffer.from(real, "utf8").toString("latin1");

// ---------------------------------------------------------------------------
// 該還原的情況
// ---------------------------------------------------------------------------

test("中文檔名還原成原值", () => {
  const real = "匯款證明-2026年8月27日.png";
  assert.notEqual(asBusboyWouldGiveIt(real), real, "前提：busboy 確實會給出不同的字串");
  assert.equal(normalizeMultipartFilename(asBusboyWouldGiveIt(real)), real);
});

test("中文 ＋ 空白 ＋ 括號 ＋ # 一併還原，且標點原樣保留", () => {
  const real = "中文 空白 (測試) #1.png";
  assert.equal(normalizeMultipartFilename(asBusboyWouldGiveIt(real)), real);
});

test("重音拉丁字母還原", () => {
  const real = "café-naïve-résumé.png";
  assert.equal(normalizeMultipartFilename(asBusboyWouldGiveIt(real)), real);
});

test("emoji（BMP 外的字元）還原", () => {
  const real = "receipt-💸-2026.png";
  assert.equal(normalizeMultipartFilename(asBusboyWouldGiveIt(real)), real);
});

test("日文／韓文一併還原（不是只針對中文寫死）", () => {
  for (const real of ["領収書-2026年.png", "영수증-2026.png", "Ελληνικά.png", "Русский.png"]) {
    assert.equal(normalizeMultipartFilename(asBusboyWouldGiveIt(real)), real, real);
  }
});

// ---------------------------------------------------------------------------
// 不該動的情況（§12 no silent mutation）
// ---------------------------------------------------------------------------

test("純 ASCII 完全不變 —— 且是逐位元組相同", () => {
  for (const name of [
    "payment-proof-2026-08-27.png",
    "invoice.png",
    "a.png",
    "UPPER_CASE-123 (1).JPEG",
    "no-extension",
  ]) {
    const out = normalizeMultipartFilename(name);
    assert.equal(out, name, name);
    assert.deepEqual(Buffer.from(out, "utf8"), Buffer.from(name, "utf8"), `${name} 位元組須相同`);
  }
});

test("已經是正確 Unicode 的字串原樣返回（**冪等**）", () => {
  const real = "匯款證明-2026年8月27日.png";
  const once = normalizeMultipartFilename(asBusboyWouldGiveIt(real));
  assert.equal(once, real);
  // 再跑一次不得再被「還原」一輪
  assert.equal(normalizeMultipartFilename(once), real);
  assert.equal(normalizeMultipartFilename(normalizeMultipartFilename(once)), real);
});

test("真正的 latin1 文字（不是合法 UTF-8）原樣返回，不硬轉成亂碼", () => {
  // 單一 0xE9 在 cp1252 是「é」，但它不是合法的 UTF-8 起始序列。
  const latin1Only = Buffer.from([0x72, 0xe9, 0x73, 0x75, 0x6d, 0x65, 0x2e, 0x70, 0x6e, 0x67]).toString("latin1");
  assert.equal(normalizeMultipartFilename(latin1Only), latin1Only);
});

test("截斷的 UTF-8 序列原樣返回，不丟例外、不產生 U+FFFD", () => {
  // 「匯」的 UTF-8 是 E5 8C AF；只給前兩個位元組。
  const truncated = Buffer.from([0xe5, 0x8c]).toString("latin1") + ".png";
  const out = normalizeMultipartFilename(truncated);
  assert.equal(out, truncated);
  assert.equal(out.includes("�"), false, "不得產生替代字元");
});

test("非字串／空值一律得到空字串，不丟例外", () => {
  for (const v of [undefined, null, 0, 123, {}, [], true]) {
    assert.equal(normalizeMultipartFilename(v), "");
  }
  assert.equal(normalizeMultipartFilename(""), "");
});

// ---------------------------------------------------------------------------
// 安全不變條件（§6）—— 還原不得憑空生出注入字元
// ---------------------------------------------------------------------------

test("**不可能生出新的 ASCII 字元** —— 路徑分隔符／NUL／CRLF 皆無法被製造", () => {
  // UTF-8 多位元組序列的每個位元組都 >= 0x80，因此解碼結果不含任何新的 ASCII。
  const real = "匯款證明.png";
  const out = normalizeMultipartFilename(asBusboyWouldGiveIt(real));
  for (const ch of ["/", "\\", "\0", "\r", "\n", "..", ":"]) {
    assert.equal(out.includes(ch), false, `還原後不得含 ${JSON.stringify(ch)}`);
  }
});

test("輸入本來就有的 ASCII 特殊字元原樣通過，不被新增也不被移除", () => {
  // 本函式只負責編碼，**不負責 sanitization** —— header 安全由 contentDisposition() 處理。
  for (const name of ["a/b.png", "a\\b.png", "..\\..\\x.png", "a\rb.png", "a\nb.png", "a\0b.png"]) {
    assert.equal(normalizeMultipartFilename(name), name, JSON.stringify(name));
  }
});

test("不做 slugify／轉寫／強制 ASCII／改副檔名／加時間戳", () => {
  const real = "匯款 證明 FINAL(2).PNG";
  const out = normalizeMultipartFilename(asBusboyWouldGiveIt(real));
  assert.equal(out, real);
  assert.ok(out.endsWith(".PNG"), "副檔名大小寫不變");
  assert.ok(out.includes(" "), "空白不被替換");
  assert.equal(/\d{10,}/.test(out), false, "不得加上時間戳");
});

test("不放大檔名長度（no amplification）", () => {
  const real = "匯款證明-2026年8月27日.png";
  const busboyValue = asBusboyWouldGiveIt(real);
  const out = normalizeMultipartFilename(busboyValue);
  assert.ok(out.length <= busboyValue.length, "還原後的字元數不應超過輸入");
});

// ---------------------------------------------------------------------------
// middleware
// ---------------------------------------------------------------------------

test("middleware 修正 req.file（.single）", () => {
  const real = "匯款證明.png";
  const req = { file: { originalname: asBusboyWouldGiveIt(real) } };
  let called = false;
  normalizeUploadedFilenames(req, {}, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(req.file.originalname, real);
});

test("middleware 修正 req.files 陣列（.array），逐一處理且不動其他欄位", () => {
  const names = ["匯款證明.png", "ascii.png", "café.png"];
  const req = {
    files: names.map((n) => ({ originalname: asBusboyWouldGiveIt(n), mimetype: "image/png", size: 9 })),
  };
  normalizeUploadedFilenames(req, {}, () => {});
  assert.deepEqual(req.files.map((f) => f.originalname), names);
  assert.deepEqual(req.files.map((f) => f.mimetype), ["image/png", "image/png", "image/png"]);
  assert.deepEqual(req.files.map((f) => f.size), [9, 9, 9]);
});

test("middleware 處理 .fields() 形式的 req.files 物件", () => {
  const real = "匯款證明.png";
  const req = { files: { proofs: [{ originalname: asBusboyWouldGiveIt(real) }] } };
  normalizeUploadedFilenames(req, {}, () => {});
  assert.equal(req.files.proofs[0].originalname, real);
});

test("middleware 在沒有檔案時安全通過", () => {
  let called = 0;
  for (const req of [{}, { file: null }, { files: null }, { files: [] }]) {
    normalizeUploadedFilenames(req, {}, () => {
      called += 1;
    });
  }
  assert.equal(called, 4);
});
