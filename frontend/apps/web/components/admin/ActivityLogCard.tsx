"use client";

import { useState, type ReactNode } from "react";
import { describeActivity, describeActivityMeta } from "../../lib/admin-labels";
import type { ActivityLogRow } from "../../lib/api-types";

/**
 * 一筆活動紀錄的**唯一**呈現元件（IA-02）。
 *
 * 活動紀錄現在有五個使用點：全站列表、單筆詳情，以及教材／訂單／使用者三個
 * entity 紀錄頁。在 IA-02 之前，後四個各自渲染 `{log.action}`、`{log.actor_role}`、
 * `{target_type} / {target_id}` 與 `<pre>{JSON}</pre>` —— 也就是同一筆稽核事件
 * 有五種長相，其中四種要求 Admin 自己讀 raw payload。
 *
 * 這裡把 IA §6 的三層資訊架構收斂成一個元件：
 *
 *   第一層　`describeActivity()` 的人話句子 ＋ 對象 ＋ 時間
 *   第二層　`describeActivityMeta()` 的 meta 人話版（金額、原因、狀態轉移…）
 *   第三層　raw `action` / `log id` / `actor_id` / `actor_role` / `target_*` / 原始 JSON，
 *          **預設收合**
 *
 * **稽核能力不減**：第三層一個欄位都沒少，未登記的 meta key 也仍在原始 JSON 裡。
 * 降低 technical terminology 的 prominence ≠ 移除它。
 */

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * 第二層：`meta` 的人話版。
 *
 * 沒有任何可人話化的欄位時**不渲染** —— 一個空的「詳細內容」標題只會讓人
 * 以為資料掉了。未登記的 key 不在這裡出現，但它們仍在第三層的原始 JSON 中。
 */
export function ActivityMetaSummary({ log }: { log: ActivityLogRow }) {
  const described = describeActivityMeta(log);
  if (described.items.length === 0) return null;

  return (
    <dl
      data-testid="activity-log-meta"
      className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-body text-ds-body"
    >
      {described.items.map((item) => (
        <div key={item.key} className="min-w-0">
          <dt className="inline text-ds-textMuted">{item.label}：</dt>
          <dd className="inline break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 第三層：完整 technical metadata。
 *
 * `meta` 一律原樣輸出，因此**未登記的 key 不會被丟棄** —— 這是 IA-02 的硬性要求：
 * 人話化是加上一層解讀，不是取代稽核軌跡。
 */
export function ActivityRawDetails({ log }: { log: ActivityLogRow }) {
  return (
    <dl
      data-testid="activity-log-details"
      className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-xl bg-edu-page p-3 font-mono text-xs text-ds-textMuted sm:grid-cols-2"
    >
      <div>
        <dt className="inline">action：</dt>
        <dd className="inline">{log.action ?? "—"}</dd>
      </div>
      <div>
        <dt className="inline">log id：</dt>
        <dd className="inline">{log.id}</dd>
      </div>
      <div>
        <dt className="inline">actor_id：</dt>
        <dd className="inline">{log.actor_id ?? "—"}</dd>
      </div>
      <div>
        <dt className="inline">actor_role：</dt>
        <dd className="inline">{log.actor_role ?? "—"}</dd>
      </div>
      <div>
        <dt className="inline">target_type：</dt>
        <dd className="inline">{log.target_type ?? "—"}</dd>
      </div>
      <div>
        <dt className="inline">target_id：</dt>
        <dd className="inline">{log.target_id ?? "—"}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt>meta：</dt>
        <dd>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(log.meta ?? {}, null, 2)}
          </pre>
        </dd>
      </div>
    </dl>
  );
}

type Props = {
  log: ActivityLogRow;
  /** 這一列額外的導航（各頁不同）。放在「詳細資訊」開關左邊。 */
  links?: ReactNode;
  /**
   * 展開狀態。清單頁把它提到父層（換頁時一併收起）；
   * 沒有傳入時元件自己管理，單筆詳情頁與 entity 頁用這個模式。
   */
  expanded?: boolean;
  onToggle?: () => void;
};

export function ActivityLogCard({ log, links, expanded, onToggle }: Props) {
  const [selfExpanded, setSelfExpanded] = useState(false);
  const isControlled = expanded !== undefined;
  const open = isControlled ? Boolean(expanded) : selfExpanded;
  const toggle = isControlled ? onToggle : () => setSelfExpanded((v) => !v);

  const described = describeActivity(log);

  return (
    <article
      data-testid="activity-log-row"
      className="rounded-ds-card border border-ds-border bg-ds-surface p-4 shadow-ds-card-soft"
    >
      {/*
        `raw` 代表 catalog 沒有登記這個 action：句子會退回「其他（原始 code）」。
        改用等寬字型是誠實的提示 —— 這一句不是完整的中文描述，不要讓它看起來像。
      */}
      <p className={`text-title text-ds-heading ${described.raw ? "font-mono text-sm" : ""}`}>
        {described.sentence}
      </p>
      {described.target ? <p className="mt-0.5 text-body text-ds-body">{described.target}</p> : null}

      <ActivityMetaSummary log={log} />

      <p className="mt-1 text-meta text-ds-textMuted">{formatDateTime(log.created_at)}</p>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-meta">
        {links}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          data-testid="activity-log-details-toggle"
          className="font-medium text-ds-textMuted underline"
        >
          {open ? "隱藏詳細資訊" : "詳細資訊"}
        </button>
      </div>

      {open ? <ActivityRawDetails log={log} /> : null}
    </article>
  );
}
