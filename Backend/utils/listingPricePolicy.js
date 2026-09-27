/**
 * 教材／上架價格政策（canonical）。
 *
 * **這裡是唯一的定義來源。** route、service、測試都從這裡取值與判斷，
 * **不得**在任何地方重寫 `30`，也不得就地自行判斷整數性。
 *
 * ## 已拍板的兩條規則
 *
 * | 決策 | 值 | 依據 |
 * | --- | --- | --- |
 * | 價格必須為**正整數 TWD** | 無小數 | `DEC-34`（2026-09-13） |
 * | 最低上架價 | **NT$30** | `DEC-39`（2026-09-27） |
 *
 * 合併後的 MVP 判準：**`Number.isInteger(price) && price >= 30`**。
 *
 * ## Fail-fast：**絕不**靜默正規化
 *
 * `DEC-34` 明文禁止把不合法的價格靜默轉成合法值。因此本模組**不** floor、
 * 不 ceil、不 round、不 clamp、不 coerce —— 只回報「可接受」或「為什麼不可接受」。
 * **儲存與顯示的價格，必須等於使用者明確被接受的那個值。**
 *
 * ### `orderService.js` 的 `floorMoney` 不是本政策
 *
 * 建單時 `floorMoney(row.price)` 會把 legacy 小數價格靜默下取整。那是**歷史相容行為**，
 * **不是** pricing 政策，且依 `COR-09` V8 **不得**在歷史價格 census／對帳完成前移除 ——
 * 先移除會讓未經對帳的 legacy 小數列在結帳時直接失敗。順序見 tracker `COR-09` V8。
 *
 * ## Error code 穩定性
 *
 * 三個 code 是 API 契約的一部分，呼叫端可據以分流，**不得**隨文案調整而改動。
 */

/** 最低上架價（NT$）。`DEC-39`。 */
const MIN_LISTING_PRICE = 30;

/**
 * 穩定的驗證錯誤碼。**新增時只能往後加，不得改動既有值。**
 */
const LISTING_PRICE_ERROR = Object.freeze({
  INVALID: "price_invalid",
  NOT_INTEGER: "price_not_integer",
  BELOW_MINIMUM: "price_below_minimum",
});

/**
 * 對應的使用者可見訊息。沿用本 repo 既有的英文短句風格
 * （見 `routes/materials.js` 的其他驗證訊息）。
 */
const LISTING_PRICE_MESSAGE = Object.freeze({
  [LISTING_PRICE_ERROR.INVALID]: "price must be a number",
  [LISTING_PRICE_ERROR.NOT_INTEGER]: "price must be an integer amount in TWD",
  [LISTING_PRICE_ERROR.BELOW_MINIMUM]: `price must be at least ${MIN_LISTING_PRICE}`,
});

/**
 * 驗證一個上架價格。
 *
 * **只有在合法時才回傳 `value`** —— 呼叫端必須寫入這個 `value`，
 * 而不是原始的 request body 值。（`COR-09` 的既有缺陷正是「驗證一個值、寫入另一個值」。）
 *
 * @param {unknown} raw 來自 request body 的原始值。
 * @returns {{ok: true, value: number} | {ok: false, code: string, message: string}}
 */
function validateListingPrice(raw) {
  // `Number("")` 是 0、`Number(null)` 也是 0 —— 兩者都不該被當成「填了 0 元」。
  if (raw === undefined || raw === null || raw === "") {
    return fail(LISTING_PRICE_ERROR.INVALID);
  }
  if (typeof raw === "boolean" || Array.isArray(raw)) {
    return fail(LISTING_PRICE_ERROR.INVALID);
  }

  const n = Number(raw);
  if (!Number.isFinite(n)) return fail(LISTING_PRICE_ERROR.INVALID);

  // 整數性先於下限：`29.5` 回 `price_not_integer` 而非 `price_below_minimum`，
  // 這樣錯誤碼才對應到實際違反的那一條規則。
  if (!Number.isInteger(n)) return fail(LISTING_PRICE_ERROR.NOT_INTEGER);

  if (n < MIN_LISTING_PRICE) return fail(LISTING_PRICE_ERROR.BELOW_MINIMUM);

  return { ok: true, value: n };
}

function fail(code) {
  return { ok: false, code, message: LISTING_PRICE_MESSAGE[code] };
}

/**
 * 判斷一個**已存在**的價格是否符合現行政策。
 *
 * 供 Phase 0 census 與日後對帳使用 —— 它接受已從 DB 讀出的值，
 * **不做任何轉換，也不回傳正規化結果**。
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isCompliantListingPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n >= MIN_LISTING_PRICE;
}

module.exports = {
  MIN_LISTING_PRICE,
  LISTING_PRICE_ERROR,
  LISTING_PRICE_MESSAGE,
  validateListingPrice,
  isCompliantListingPrice,
};
