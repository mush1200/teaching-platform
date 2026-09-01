"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ActivityLogRow } from "../../../../lib/api-types";
import { apiFetch, parseApiErrorMessage } from "../../../../lib/api-client";
import { activityTargetHref, describeActivity } from "../../../../lib/admin-labels";
import { ActivityLogCard } from "../../../../components/admin/ActivityLogCard";
import { AccentTextLink, EmptyState, ErrorState, LoadingState, PageHeader } from "../../../../components/ds";

/**
 * 單筆活動紀錄（IA-02）。
 *
 * ## 修正前
 *
 * 這一頁把後端 payload 逐欄印出來：`{log.action}`、`{log.actor_role}`（也就是畫面上
 * 直接出現 `admin` / `parent` 這種 role 字面值）、`{target_type} / {target_id}`，
 * 最後接一塊 `<pre>{JSON.stringify(meta)}</pre>`。全站列表早就人話化了，這一頁沒有
 * 用上任何一個既有 formatter —— 同一筆事件在兩個地方長得完全不一樣，而這裡是
 * **要求 Admin 自己讀 raw audit payload** 的那一個。樣式也還停在 slate / indigo。
 *
 * ## 現在
 *
 * 與全站列表、三個 entity 紀錄頁共用 `ActivityLogCard`：人話句子在第一層、
 * `meta` 人話版在第二層、raw 欄位與原始 JSON 收在第三層。**沒有任何欄位被移除。**
 *
 * ## 這一頁的定位
 *
 * IA §6：Admin 的問題是 entity-centric（這張訂單／這個人／這份教材發生過什麼）。
 * 因此這裡的主要出口是「跳進對象的時間軸」，而不是停在單一事件上。
 * route 保留可直達 —— 它是列表「單筆詳情」的目的地，也是既有連結的落點。
 */

export default function AdminActivityLogDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "").trim();
  const [log, setLog] = useState<ActivityLogRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`admin/activity-logs/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setLog(null);
        setError(await parseApiErrorMessage(res));
        return;
      }
      setLog((await res.json()) as ActivityLogRow);
    } catch {
      setLog(null);
      setError("無法連線至伺服器，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const backLink = (
    <AccentTextLink href="/admin/activity-logs" className="text-sm">
      ← 返回活動紀錄
    </AccentTextLink>
  );

  if (!id) {
    return (
      <section className="flex w-full flex-col gap-4">
        <PageHeader title="活動紀錄" breadcrumb={backLink} />
        <EmptyState title="缺少紀錄 ID" description="這個網址沒有帶到紀錄編號，請從活動紀錄列表進入。" />
      </section>
    );
  }

  const targetHref = log ? activityTargetHref(log) : null;
  const described = log ? describeActivity(log) : null;

  return (
    <section className="flex w-full flex-col gap-4">
      <PageHeader
        title="活動紀錄詳情"
        description={described && !described.raw ? described.sentence : "單一稽核事件的完整內容。"}
        breadcrumb={backLink}
      />

      {loading ? <LoadingState title="載入中…" /> : null}
      {!loading && error ? <ErrorState title="載入失敗" description={error} onRetry={() => void load()} /> : null}

      {!loading && !error && log ? (
        <>
          <ActivityLogCard
            log={log}
            links={
              <>
                {/*
                  對象入口一律走 `activityTargetHref()`，與 Dashboard「需要注意的活動」
                  同一個 mapping —— 教材／訂單／使用者進 entity 時間軸，檢舉進案件正式入口。
                */}
                {targetHref ? (
                  <Link href={targetHref} className="font-medium text-edu-primary underline">
                    查看此對象的完整紀錄
                  </Link>
                ) : null}
                {log.actor_id ? (
                  <Link
                    href={`/admin/users/${encodeURIComponent(log.actor_id)}/activity-logs`}
                    className="font-medium text-edu-primary underline"
                  >
                    此操作者紀錄
                  </Link>
                ) : null}
              </>
            }
          />
          <p className="text-caption text-ds-textSubtle">
            單一事件只是切片。要判斷發生了什麼，通常要看同一個對象的完整時間軸。
          </p>
        </>
      ) : null}
    </section>
  );
}
