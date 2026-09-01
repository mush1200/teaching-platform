const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { dispatchBestEffort } = require("../utils/bestEffortDispatch");

/**
 * `REL-02` —— 刻意 detached 的通知 promise 必須有明確的 rejection 邊界。
 *
 * 這一支不碰資料庫、不碰 SMTP：故障是**確定性注入**的。
 *
 * 要釘住的不變條件：
 *
 * ```text
 * 核心交易成功 → 非同步排程通知 → 通知失敗
 *   → 失敗被記錄
 *   → 沒有 unhandled rejection
 *   → 沒有 process 終止
 *   → 已成功的交易不受影響
 * ```
 */

/** 暫時攔截 `console.error`，回傳期間收集到的訊息。 */
async function captureConsoleError(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return lines;
}

/** 讓已排程的 microtask 跑完。 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

test("非同步 rejection 被接住，且不會變成 unhandled rejection", async () => {
  const lines = await captureConsoleError(async () => {
    dispatchBestEffort(() => Promise.reject(new Error("smtp exploded")), {
      operation: "order_created email",
      reference: "ord_123",
    });
    await flush();
  });

  assert.equal(lines.length, 1, "被接住的失敗必須留下紀錄，不得無聲消失");
  assert.match(lines[0], /order_created email/);
  assert.match(lines[0], /ord_123/);
  assert.match(lines[0], /smtp exploded/);
});

test("**同步** throw 也被接住 —— 這是收 thunk 而不是收 promise 的理由", async () => {
  const lines = await captureConsoleError(async () => {
    dispatchBestEffort(
      () => {
        throw new Error("threw before returning a promise");
      },
      { operation: "material_published email", reference: "mat_1" }
    );
    await flush();
  });

  assert.equal(lines.length, 1);
  assert.match(lines[0], /threw before returning a promise/);
});

test("`REL-02` 的核心情境：送信**之前**的 context 載入失敗（模擬 loadOrderEmailContext）", async () => {
  /*
   * 這正是 READINESS-02 `R2-008` 找到的路徑：四支訂單信一開頭就
   * `await loadOrderEmailContext(orderId)`，而那個查詢在任何 catch 之外。
   * SMTP 端的失敗**早就**被 `sendEmailWithLog()` 內部接住了；
   * 真正會逸出的是這一段，所以這條測試比「transporter reject」更重要。
   */
  async function senderWithPreSendDbFailure() {
    // 對應 loadOrderEmailContext() 內的 `throw new Error("order not found for email")`
    throw new Error("order not found for email");
  }

  const lines = await captureConsoleError(async () => {
    dispatchBestEffort(() => senderWithPreSendDbFailure(), {
      operation: "order_created email",
      reference: "ord_pre_send",
    });
    await flush();
  });

  assert.equal(lines.length, 1);
  assert.match(lines[0], /order not found for email/);
  assert.match(lines[0], /ord_pre_send/);
});

test("同步回傳、永不 throw —— 呼叫端的回應不會被通知延後或打斷", async () => {
  let businessResultReturned = false;

  function businessOperation() {
    // 交易已完成，接著排程通知，然後立刻回傳。
    dispatchBestEffort(() => Promise.reject(new Error("boom")), { operation: "x" });
    businessResultReturned = true;
    return { ok: true, orderId: "ord_9" };
  }

  const lines = await captureConsoleError(async () => {
    const result = businessOperation();
    // 通知尚未執行（microtask 還沒跑），但業務結果已經回來了
    assert.equal(businessResultReturned, true);
    assert.deepEqual(result, { ok: true, orderId: "ord_9" });
    await flush();
  });

  assert.equal(lines.length, 1, "通知確實失敗了，但業務結果不受影響");
});

test("傳入非函式不會 throw —— helper 本身也不得打斷主流程", async () => {
  const lines = await captureConsoleError(async () => {
    assert.doesNotThrow(() => dispatchBestEffort(undefined, { operation: "bad call" }));
    await flush();
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /thunk/);
});

test("不記錄敏感內容 —— 只有型別、識別碼與錯誤訊息", async () => {
  const lines = await captureConsoleError(async () => {
    dispatchBestEffort(() => Promise.reject(new Error("connection reset")), {
      operation: "payment_approved email",
      reference: "ord_secret_ref",
    });
    await flush();
  });
  const logged = lines.join("\n");
  // helper 只拿得到 operation / reference / message —— 結構上就無從記錄信件內文或個資。
  assert.match(logged, /payment_approved email/);
  assert.match(logged, /connection reset/);
  assert.doesNotMatch(logged, /password|<html|<p>|proof|storage_key/i);
});

/**
 * §12 Runtime proof —— 在**隔離的子 process** 裡證明 process 存活。
 *
 * 這條測試的價值在於：unhandled rejection 是 **process 層級**的行為，
 * 在測試 runner 內部無法忠實重現（runner 自己會攔截）。
 * 因此用真的子 process 跑一次「舊寫法 vs 新寫法」的對照。
 */
test("runtime: 舊的裸 void 會終止 process；dispatchBestEffort 不會", () => {
  const utilPath = path.resolve(__dirname, "..", "utils", "bestEffortDispatch.js").replace(/\\/g, "/");

  // (a) 舊寫法：裸 void —— 預期非零 exit（process 被終止）
  let bareVoidCrashed = false;
  try {
    execFileSync(
      process.execPath,
      ["-e", 'async function send(){ throw new Error("pre-send db failure"); } void send(); setTimeout(()=>{console.log("ALIVE")},50);'],
      { stdio: "pipe", timeout: 10000 }
    );
  } catch (err) {
    bareVoidCrashed = true;
  }
  assert.equal(bareVoidCrashed, true, "基準線：裸 void 的 unhandled rejection 應終止 process");

  // (b) 新寫法：同樣的故障，經由 dispatchBestEffort —— 預期存活並正常結束
  const out = execFileSync(
    process.execPath,
    [
      "-e",
      `const { dispatchBestEffort } = require(${JSON.stringify(utilPath)});` +
        'async function send(){ throw new Error("pre-send db failure"); }' +
        'dispatchBestEffort(() => send(), { operation: "order_created email", reference: "ord_1" });' +
        'setTimeout(()=>{console.log("ALIVE")},50);',
    ],
    { stdio: "pipe", timeout: 10000 }
  ).toString();

  assert.match(out, /ALIVE/, "同樣的故障經 dispatchBestEffort 後，process 必須存活");
});
