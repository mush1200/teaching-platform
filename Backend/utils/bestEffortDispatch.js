/**
 * `REL-02` —— 刻意 detached 的 best-effort 副作用的**唯一**發射點。
 *
 * ## 這個模組解決的問題
 *
 * 通知信是 best-effort 副作用：訂單已經成立、HTTP 201 已經回傳之後才寄。
 * 因此呼叫端一律不 `await` 它 —— 那是對的，**寄信失敗不該讓已經成功的交易失敗**。
 *
 * 但「不 await」在 Node 18 有一個致命的預設行為：
 *
 * ```text
 * void someAsyncFn();      // 沒有人接住 rejection
 *   → unhandled rejection
 *   → Node 18 預設 --unhandled-rejections=throw
 *   → **整個 process 被終止**
 * ```
 *
 * 而它會在**交易已經 commit、回應已經送出之後**發生 ——
 * 使用者看到成功，服務卻整個掛掉。實測見 `docs/readiness-audit-round-2-2026-08-31.md` `R2-008`。
 *
 * ## 為什麼邊界放在「分離點」而不是各自的函式裡
 *
 * 修這件事有兩種寫法：
 *
 *   1. 每一支 `sendXxxEmail()` 自己用 try/catch 包好
 *   2. 在**刻意分離 promise 的那一行**建立 rejection 邊界
 *
 * 現況正好證明了 (1) 為什麼不夠：六支 sender 裡，兩支教材信**已經**自己包了 try/catch，
 * 四支訂單信**沒有** —— 它們一開頭就 `await loadOrderEmailContext()`，
 * 那個查詢會 `throw`，而且在任何 catch 之外。
 * 也就是說 (1) 的不變條件靠「每個作者都記得包」維持，少包一支就破功，而且破功的方式是**整個服務中斷**。
 *
 * 把邊界放在分離點，不變條件就變成結構性的：
 * **只要是用這個 helper 發射的，rejection 一定被接住**，與被呼叫者的內部寫法無關。
 *
 * ## 為什麼收 thunk 而不是 promise
 *
 * `dispatchBestEffort(sendEmail(x))` 會**先求值** `sendEmail(x)`。
 * 目前六支 sender 都是 `async function`，所以同步 throw 會自動變成 rejection，傳 promise 也安全。
 * 但那個安全性依賴「被呼叫者永遠是 async」這個外部條件 ——
 * 哪天有人把某支改成一般函式並在取參數時就 throw，例外會在 helper 拿到東西**之前**逸出。
 *
 * 收 thunk（`() => sendEmail(x)`）就沒有這個縫：`Promise.resolve().then(task)` 會把
 * **同步 throw 與非同步 rejection 收斂成同一條路徑**，兩者都被同一個 `.catch()` 接住。
 *
 * ## 這個模組**不是**什麼
 *
 * 不是 queue、不是 retry、不是 job worker、不是 notification framework。
 * 它只有一個職責：**讓刻意分離的 promise 有一個明確的失敗歸屬。**
 * 需要重試或保證投遞時，那是另一個層次的設計，不該從這裡長出來。
 */

/**
 * 記錄被接住的失敗。
 *
 * 用 `console.error` 是**刻意**的，理由有二：
 *
 *   1. repo 沒有 logger 抽象（`emailService.js` 自己也是 `console.error`），
 *      為了這件事引入 logging framework 是 scope creep。
 *   2. **不能在這裡寫 `activity_logs`。** 觸發這條路徑最典型的原因就是資料庫故障 ——
 *      在資料庫壞掉的當下再去寫一筆稽核，多半也會失敗，於是在錯誤處理裡再製造一個
 *      未被接住的 rejection，正好回到本 ticket 要修的那個問題。
 *      成功送達／送達失敗的稽核由 `sendEmailWithLog()` 在它拿得到控制權時負責
 *      （`order_email_sent` / `order_email_failed`）。
 *
 * **不記錄**信件內文、收件地址以外的個資、付款憑證內容或教材內容 —— 只記型別、識別碼與錯誤訊息。
 */
function logContainedFailure(context, error) {
  const label = context && context.operation ? context.operation : "best-effort task";
  const ref = context && context.reference ? ` (${context.reference})` : "";
  const message = error && error.message ? error.message : String(error);
  console.error(`best-effort ${label}${ref} failed and was contained:`, message);
}

/**
 * 發射一個**刻意不等待**的 best-effort 任務，並保證它的失敗被接住。
 *
 * ```js
 * dispatchBestEffort(() => sendOrderCreatedEmail(order.id), {
 *   operation: "order_created email",
 *   reference: order.id,
 * });
 * ```
 *
 * 同步回傳 `undefined`，**永遠不 throw**，也不會延後呼叫端的回應。
 *
 * @param {() => (Promise<unknown> | unknown)} task 要執行的工作。**同步 throw 與 rejection 都會被接住。**
 * @param {{operation?: string, reference?: string}} [context] 失敗時要記錄的非敏感脈絡。
 */
function dispatchBestEffort(task, context = {}) {
  if (typeof task !== "function") {
    // 傳錯型別是呼叫端的程式錯誤，但這裡仍然不 throw ——
    // 這個 helper 存在的理由就是「絕不讓副作用打斷主流程」。
    logContainedFailure(context, new Error("dispatchBestEffort expects a function (thunk)"));
    return;
  }

  // `.then(task)` 讓 task 內的同步 throw 也變成 rejection，與非同步 rejection 走同一條路。
  Promise.resolve()
    .then(task)
    .catch((error) => logContainedFailure(context, error));
}

module.exports = { dispatchBestEffort };
