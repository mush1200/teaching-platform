/**
 * Admin reporting period 的前端 canonical 表示。
 *
 * 這裡處理的是 **URL state 與輸入驗證**，不是統計視窗本身：
 * 真正的期間解析由 Backend（`Backend/utils/reportingRange.js`）負責，並在 response 中
 * 以 `periodFrom` / `periodTo` / `periodTimezone` 回傳。UI 顯示的區間文字一律採用那份
 * metadata，確保「畫面上寫的期間」＝「後端真正查的期間」。
 *
 * 語意（與 Backend 一致，見 docs/mvp_rules.md §15）：
 *
 *   Timezone   Asia/Taipei（固定；不跟隨 browser 時區）
 *   from / to  inclusive calendar date，格式一律 `YYYY-MM-DD`
 *   查詢邊界    half-open [from 00:00, to+1 00:00)（由 Backend 換算）
 *
 * 刻意不使用的危險寫法：
 *   - `new Date("2026-08-20")`     → 那是 UTC 午夜，不是台北日曆日
 *   - `toISOString().slice(0,10)`  → 那是 UTC 日曆日，台北 00:00–08:00 會算成前一天
 *   - `setHours(23,59,59,999)`     → 閉區間 + 毫秒精度
 *
 * 日期運算全部在 UTC 曆面上進行（`Date.UTC` / `getUTC*`），只當成「日曆日字串」處理，
 * 因此與執行環境時區無關；唯一需要時區的是「台北的今天是哪一天」，由 `Intl` 取得。
 */

export const REPORTING_TIMEZONE = "Asia/Taipei";

/** 預設期間。無參數或參數不合法時一律回到這裡。 */
export const DEFAULT_PRESET = "30d" as const;

/** custom 期間的上限，與 Backend 的 `MAX_RANGE_DAYS` 對齊。 */
export const MAX_RANGE_DAYS = 365;

export type RangePreset = "today" | "7d" | "30d" | "this_month" | "custom";

export type RangeSelection =
  | { preset: Exclude<RangePreset, "custom">; from?: undefined; to?: undefined }
  | { preset: "custom"; from: string; to: string };

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: "今日",
  "7d": "近 7 天",
  "30d": "近 30 天",
  this_month: "本月",
  custom: "自訂",
};

/** 選單顯示順序。 */
export const PRESET_ORDER: RangePreset[] = ["today", "7d", "30d", "this_month", "custom"];

/**
 * 比較基準期的文案。
 *
 * 每個 preset 的比較對象不同，**不能**全部叫「較上週」：
 *   today → 昨天、7d → 前 7 天、30d → 前 30 天、
 *   this_month → 上月同期（不是整個上月）、custom → 緊鄰前一等長期間。
 * 實際的期間值由 API 的 `previousPeriodFrom` / `previousPeriodTo` 提供。
 */
export const COMPARISON_LABELS: Record<RangePreset, string> = {
  today: "較昨日",
  "7d": "較前 7 天",
  "30d": "較前 30 天",
  this_month: "較上月同期",
  custom: "較前期",
};

/** API 回傳的 `periodPreset` 可能是任意字串；未知值退回中性文案。 */
export function comparisonLabel(preset: string | undefined | null): string {
  return preset != null && preset in COMPARISON_LABELS
    ? COMPARISON_LABELS[preset as RangePreset]
    : COMPARISON_LABELS.custom;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 嚴格檢查 `YYYY-MM-DD`，並排除日曆上不存在的日期（如 `2026-02-31`）。 */
export function isIsoDate(value: unknown): value is string {
  const raw = String(value ?? "").trim();
  if (!ISO_DATE_RE.test(raw)) return false;
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toEpochDay(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 日曆日加減；`n` 可為負。 */
export function addDays(dateStr: string, n: number): string {
  const dt = new Date(toEpochDay(dateStr) + n * 86400000);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** `to - from` 的日曆日差；同一天為 0。 */
export function diffDays(fromDate: string, toDate: string): number {
  return Math.round((toEpochDay(toDate) - toEpochDay(fromDate)) / 86400000);
}

/**
 * 台北「今天」的日曆日期。
 *
 * 用 `Intl` 取分量再自行組裝，不經過 `toISOString()`；`now` 可注入以利測試。
 */
export function todayInTaipei(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * 從 URL query 解析期間選擇。
 *
 * **任何不合法的輸入都安全退回 `30d`**，不做推測（例如 custom 只給 from 時不會自行補 to）。
 * 這裡刻意不丟例外：URL 是使用者可任意編輯的輸入，dashboard 不應因此崩潰。
 */
export function parseRangeSelection(params: URLSearchParams | null, now: Date = new Date()): RangeSelection {
  const fallback: RangeSelection = { preset: DEFAULT_PRESET };
  if (!params) return fallback;

  const raw = params.get("range");
  const preset = raw != null && raw.trim() !== "" ? raw.trim().toLowerCase() : null;

  if (preset === null) return fallback;
  if (preset === "today" || preset === "7d" || preset === "30d" || preset === "this_month") {
    return { preset };
  }
  if (preset !== "custom") return fallback;

  const from = params.get("from");
  const to = params.get("to");
  if (!isIsoDate(from) || !isIsoDate(to)) return fallback;
  if (validateCustomRange(from, to, now) != null) return fallback;
  return { preset: "custom", from, to };
}

/**
 * 驗證 custom 期間。合法回傳 `null`，否則回傳可直接顯示的中文訊息。
 *
 * 與 Backend 的驗證規則一致；前端先擋是為了「不合法就不送 API」（見任務 §41）。
 */
export function validateCustomRange(from: string, to: string, now: Date = new Date()): string | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return "請選擇完整的開始與結束日期。";
  if (diffDays(from, to) < 0) return "開始日期不可晚於結束日期。";
  const today = todayInTaipei(now);
  if (diffDays(to, today) < 0) return "結束日期不可晚於今日。";
  if (diffDays(from, today) < 0) return "開始日期不可晚於今日。";
  if (diffDays(from, to) + 1 > MAX_RANGE_DAYS) return `日期區間最多 ${MAX_RANGE_DAYS} 天。`;
  return null;
}

/** 期間選擇 → query string。URL 與 API 使用同一組參數，兩邊不會各自漂移。 */
export function toRangeQuery(selection: RangeSelection): string {
  const params = new URLSearchParams({ range: selection.preset });
  if (selection.preset === "custom") {
    params.set("from", selection.from);
    params.set("to", selection.to);
  }
  return params.toString();
}

/** `2026-08-20` → `2026/08/20`。純字串轉換，不經過 `Date`（避免時區陷阱）。 */
export function formatIsoDateForDisplay(value: string): string {
  return isIsoDate(value) ? value.replace(/-/g, "/") : value;
}
