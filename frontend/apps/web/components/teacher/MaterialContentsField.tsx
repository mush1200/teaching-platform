"use client";

/**
 * 教材內容（`contents[]`）的結構化輸入欄（`P1-10`）。
 *
 * ## 為什麼不是 textarea
 *
 * 先前創作者必須在一個 textarea 裡**手打管線分隔的機器格式**：
 *
 * ```
 * flashcard|地點圖卡|4|醫院/消防局/警察局
 * ```
 *
 * 那是把序列化格式直接暴露給使用者。真實創作者不會可靠地產出它，
 * 而且任何一個少打的 `|` 都會安靜地把欄位錯位（`name` 變成 `count`）。
 *
 * **Backend 的契約本來就是結構化陣列**（`Backend/routes/materials.js` 的
 * `normalizeContents()` 收 `{ type, name, count, description }[]`），
 * 所以這裡不需要任何 adapter —— 管線字串從頭到尾只是 UI 的產物，直接拿掉即可。
 *
 * ## 行為
 *
 * - 每列獨立 trim；空白列在送出前被丟棄（見 `cleanMaterialContents`）。
 * - `type` / `name` 必填由呼叫端驗證（維持既有 `validatePayload` 的訊息）。
 * - `count` 是選填正整數；空字串代表「沒有數量」而不是 0。
 * - 可新增、可刪除；至少保留一列以免畫面變成空的。
 */

export type MaterialContentRow = {
  type: string;
  name: string;
  count: string;
  description: string;
};

export const EMPTY_CONTENT_ROW: MaterialContentRow = { type: "", name: "", count: "", description: "" };

/** API 形狀：與 Backend `normalizeContents()` 一致。 */
export type MaterialContentPayload = { type: string; name: string; count?: number; description?: string };

/** 既有教材（編輯頁）→ 表單列。`count` 轉成字串，`null` 變空字串而不是 "null"。 */
export function toContentRows(
  contents: ReadonlyArray<{ type?: unknown; name?: unknown; count?: unknown; description?: unknown }> | null | undefined,
): MaterialContentRow[] {
  const rows = (contents ?? []).map((c) => ({
    type: c?.type == null ? "" : String(c.type),
    name: c?.name == null ? "" : String(c.name),
    count: c?.count == null || c.count === "" ? "" : String(c.count),
    description: c?.description == null ? "" : String(c.description),
  }));
  return rows.length > 0 ? rows : [{ ...EMPTY_CONTENT_ROW }];
}

/**
 * 表單列 → API payload。
 *
 * **完全空白的列直接丟掉**：使用者按了「新增一項」卻沒填，不該變成一筆空內容送到後端。
 * 只填了一部分的列會保留，讓既有的必填驗證去報錯（而不是在這裡靜默吞掉使用者的輸入）。
 */
export function cleanMaterialContents(rows: ReadonlyArray<MaterialContentRow>): MaterialContentPayload[] {
  const out: MaterialContentPayload[] = [];
  for (const row of rows) {
    const type = row.type.trim();
    const name = row.name.trim();
    const description = row.description.trim();
    const countText = row.count.trim();
    if (!type && !name && !description && !countText) continue;
    const item: MaterialContentPayload = { type, name };
    const count = Number(countText);
    if (countText && Number.isFinite(count)) item.count = count;
    if (description) item.description = description;
    out.push(item);
  }
  return out;
}

type Props = {
  idPrefix: string;
  rows: MaterialContentRow[];
  onChange: (rows: MaterialContentRow[]) => void;
  disabled?: boolean;
};

export function MaterialContentsField({ idPrefix, rows, onChange, disabled }: Props) {
  function updateRow(index: number, patch: Partial<MaterialContentRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    onChange([...rows, { ...EMPTY_CONTENT_ROW }]);
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index);
    // 永遠留一列，否則整個區塊會消失、使用者不知道還能不能加
    onChange(next.length > 0 ? next : [{ ...EMPTY_CONTENT_ROW }]);
  }

  const inputCls = "rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50";

  return (
    <fieldset className="rounded-2xl border border-slate-200 p-3" data-testid={`${idPrefix}-contents-field`}>
      <legend className="px-1 text-sm font-medium text-slate-800">教材內容 *</legend>
      <p className="mb-2 text-xs text-slate-500">列出這份教材實際包含的東西，例如「圖卡 / 地點圖卡 / 4 張」。</p>

      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[1fr_1fr_88px_1.5fr_auto]"
            data-testid={`${idPrefix}-content-row`}
          >
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>形式 *</span>
              <input
                aria-label={`第 ${index + 1} 項教材內容的形式`}
                value={row.type}
                onChange={(e) => updateRow(index, { type: e.target.value })}
                placeholder="例如：圖卡"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>名稱 *</span>
              <input
                aria-label={`第 ${index + 1} 項教材內容的名稱`}
                value={row.name}
                onChange={(e) => updateRow(index, { name: e.target.value })}
                placeholder="例如：地點圖卡"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>數量</span>
              <input
                aria-label={`第 ${index + 1} 項教材內容的數量`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={row.count}
                onChange={(e) => updateRow(index, { count: e.target.value })}
                placeholder="4"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span>說明</span>
              <input
                aria-label={`第 ${index + 1} 項教材內容的說明`}
                value={row.description}
                onChange={(e) => updateRow(index, { description: e.target.value })}
                placeholder="選填"
                disabled={disabled}
                className={inputCls}
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => removeRow(index)}
                disabled={disabled}
                aria-label={`刪除第 ${index + 1} 項教材內容`}
                className="h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-600 hover:bg-white disabled:opacity-50"
              >
                刪除
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        disabled={disabled}
        data-testid={`${idPrefix}-add-content`}
        className="mt-3 h-11 rounded-xl border border-dashed border-slate-400 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        ＋ 新增一項
      </button>
    </fieldset>
  );
}
