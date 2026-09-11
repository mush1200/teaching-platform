"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { apiFetch, parseApiErrorMessage } from "../../../lib/api-client";
import {
  AdminReviewPlaceholder,
  AdminReviewWorkspace,
} from "../../../components/admin/AdminReviewWorkspace";
import {
  DataToolbar,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  RefreshControl,
  StatusPill,
  SurfaceCard,
} from "../../../components/ds";
import { Button } from "../../../components/ui/Button";
import { FormField } from "../../../components/ui/FormField";
import { Select } from "../../../components/ui/Select";
import { Textarea } from "../../../components/ui/Textarea";
import { Input } from "../../../components/ui/Input";
import type { StatusTone } from "../../../lib/status-tone";

/**
 * `IA-10` —— 退款／補救案件的 Admin 操作介面。
 *
 * ## 為什麼需要它
 *
 * backend 能力自 Gate 14 起就完整（`refundRemedy.service.js` ＋ `routes/admin.js`），
 * 但前台沒有任何入口 —— 上線後若依法或依契約必須退款，**維運者只能直打 API**。
 * 這一頁把那條路徑變成產品內可操作、可稽核的流程。
 *
 * ## 與 `/admin/reports` 的分界（`docs/admin-information-architecture.md`）
 *
 * `reports` 是**內容檢舉**（moderation）：對象是教材，結論是下架／警告。
 * 這一頁是**消費者救濟**：對象是訂單，結論涉及**金錢**。兩者不共用資料表，
 * 也刻意不共用畫面 —— 把它們混在一起會讓「已處理」這個詞同時代表兩件事。
 *
 * ## 狀態機**不在這裡**
 *
 * completion criteria 明文要求狀態機一律沿用 `refundRemedy.service.js` 的 `TRANSITIONS`，
 * **不得在前端另寫一份**。因此這一頁**不判斷**哪個轉移合法：它把所有狀態列出來，
 * 由 backend 裁決；被拒絕時 backend 會回 409 並附上 `from` 與 `allowed`，
 * 前端**照實把 `allowed` 顯示出來**。
 *
 * 這樣做的好處不只是少寫一份 enum —— 而是**前端永遠不可能與 backend 的狀態機不一致**，
 * 因為它根本沒有自己的版本。代價是使用者可能先選到一個非法轉移，
 * 但錯誤訊息會直接告訴他此刻允許哪些，比灰掉一個沒有解釋的選項更有用。
 *
 * ## 三段式語意（`docs/mvp_rules.md` §12.8.2／§12.8.6）
 *
 *   approved（已核准）  ≠  completed（案件完成）  ≠  退款已實際執行
 *
 * `approved → completed` 在 backend 被刻意禁止，必須經 `remedy_pending`。
 * 金錢退款的「實際執行」只能透過 execute-refund 記錄，而那是**記錄行外已完成的匯款**，
 * 系統不會匯錢。這一頁的文案必須守住這個區別，不得讓任何按鈕看起來像「按下去就退款」。
 *
 * ## 這一頁涵蓋的五項能力
 *
 *   1. 瀏覽佇列（`GET admin/remedy-cases`，可依狀態過濾）
 *   2. 開啟詳情與稽核歷程（`GET admin/remedy-cases/:id`）
 *   3. 狀態轉移（`POST admin/remedy-cases/:id/transition`）
 *   4. **建立案件**（`POST orders/:orderId/remedy-cases`）
 *   5. **記錄退款執行**（`POST admin/remedy-cases/:id/execute-refund`）
 *
 * (4) 與 (5) 少了任何一個，這一頁都還是「只能看，不能把案件走完」——
 * 沒有 (4) 就得叫維運者直打 API 開案（IA-10 要解決的正是這件事），
 * 沒有 (5) 則案件永遠卡在「待執行補救」，因為 `remedy_pending → completed`
 * 在 backend 只能由 execute-refund 原子寫入（`refundRemedy.service.js:211-217`）。
 *
 * ### Admin 代為開案 vs. 檢舉
 *
 * `CLAUDE.md` §5 寫的「沒有、也不會有『Admin 代開案件』的端點」講的是**內容檢舉**
 * （`/reports`，唯一入口是教材詳情頁）。**補救案件不適用**：
 * `Backend/routes/order.js:466` 明文允許 `req.user.role === "admin"` 代訂單擁有者開案
 * （電話／email 申訴進來時，維運者必須有地方登錄）。兩者是不同的 domain。
 *
 * ### 所有驗證仍以 backend 為準
 *
 * 前端只擋「必填欄位空白」這種送出前就知道的事，**不複製任何業務規則**：
 * 金額上限（`amount_exceeds_approved`）、金錢／非金錢（`non_cash_remedy`）、
 * 重複執行（`already_executed`）、案件狀態（`invalid_state`）、案件類型 allowlist
 * （`invalid_case_type`）、品項歸屬（`order_item_mismatch`）一律送出去讓 backend 裁決，
 * 回什麼就顯示什麼。理由與狀態機相同：前端沒有自己的版本，就不可能與 backend 不一致。
 */

type RemedyStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "remedy_pending"
  | "completed"
  | "rejected"
  | "cancelled";

const ALL_STATUSES: RemedyStatus[] = [
  "requested",
  "under_review",
  "approved",
  "remedy_pending",
  "completed",
  "rejected",
  "cancelled",
];

const STATUS_LABEL: Record<RemedyStatus, string> = {
  requested: "已提出",
  under_review: "調查中",
  approved: "已核准",
  remedy_pending: "待執行補救",
  completed: "已完成",
  rejected: "已駁回",
  cancelled: "已取消",
};

/** 語意色沿用 canonical `StatusTone`，不另造色票（`UI-CONS-12`）。 */
const STATUS_TONE: Record<RemedyStatus, StatusTone> = {
  requested: "info",
  under_review: "warning",
  approved: "info",
  remedy_pending: "warning",
  completed: "success",
  rejected: "danger",
  cancelled: "neutral",
};

/**
 * 案件類型 —— 值必須與 `refundRemedy.service.js` 的 `CASE_TYPES`（:33-42）逐字一致。
 *
 * 這**不是**業務規則的複製，而是一份 enum 的選單呈現：backend 仍會以
 * `invalid_case_type` 裁決任何不在 allowlist 內的值。列出來只是為了讓維運者不必背字串
 * ——（若兩邊真的分歧，送出時就會被 backend 擋下並顯示 allowlist，不會靜默寫入錯值）。
 */
const CASE_TYPES = [
  "statutory_rescission",
  "duplicate_payment",
  "wrong_material",
  "corrupted_or_unusable_file",
  "access_failure",
  "material_takedown",
  "platform_nonperformance",
  "other",
] as const;

const CASE_TYPE_LABEL: Record<string, string> = {
  statutory_rescission: "法定解除契約",
  duplicate_payment: "重複付款",
  wrong_material: "教材錯誤／與描述不符",
  corrupted_or_unusable_file: "檔案毀損或無法使用",
  access_failure: "無法取得或下載",
  material_takedown: "教材已下架",
  platform_nonperformance: "平台未履行",
  other: "其他",
};

/** 未知類型照原值顯示 —— 歷史資料可能帶著已不在 allowlist 的值，不得吞掉。 */
function caseTypeLabel(v: string) {
  return CASE_TYPE_LABEL[v] ?? v;
}

type RemedyCase = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  buyer_id: string;
  case_type: string;
  status: RemedyStatus;
  requested_at: string;
  decision_at: string | null;
  completed_at: string | null;
  requested_amount: number | null;
  approved_amount: number | null;
  refund_amount: number | null;
  refund_method: string | null;
  refund_reference: string | null;
  refund_paid_at: string | null;
  buyer_statement: string | null;
  admin_note: string | null;
  entitlement_action: string | null;
};

type HistoryEntry = {
  id?: string;
  action?: string;
  actor_role?: string | null;
  created_at?: string;
  meta?: Record<string, unknown> | null;
};

type DetailResponse = { case: RemedyCase; history: HistoryEntry[] };

function fmtAmount(v: number | null) {
  return v == null ? "—" : `NT$${v}`;
}

function fmtTime(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("zh-TW");
}

export default function AdminRemedyCasesPage() {
  return (
    <Suspense fallback={<LoadingState title="載入補救案件…" />}>
      <RemedyCasesView />
    </Suspense>
  );
}

function RemedyCasesView() {
  const router = useRouter();
  const params = useSearchParams();
  const statusFilter = params.get("status") ?? "";
  const selectedId = params.get("case") ?? "";

  const [items, setItems] = useState<RemedyCase[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await apiFetch(`admin/remedy-cases${query}`);
      if (!res.ok) {
        setListError(await parseApiErrorMessage(res));
        setItems(null);
        return;
      }
      const data = (await res.json()) as { items: RemedyCase[] };
      setItems(data.items ?? []);
      setUpdatedAt(new Date());
    } catch {
      setListError("無法載入補救案件清單。");
      setItems(null);
    } finally {
      setListLoading(false);
    }
  }, [statusFilter]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await apiFetch(`admin/remedy-cases/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setDetailError(await parseApiErrorMessage(res));
        setDetail(null);
        return;
      }
      setDetail((await res.json()) as DetailResponse);
    } catch {
      setDetailError("無法載入案件詳情。");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  function setQuery(next: { status?: string; case?: string }) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.replace(`/admin/remedy-cases${sp.toString() ? `?${sp.toString()}` : ""}`);
  }

  const list = (
    <div className="flex min-h-0 flex-col gap-4">
    <CreateCasePanel
      onCreated={(created) => {
        // 不做 optimistic 插入 —— 重新向 backend 取，並把新案件選起來。
        // 前端憑空造一列會讓「畫面上的案件」與「DB 的案件」出現短暫分歧。
        void loadList();
        setQuery({ status: "", case: created.id });
      }}
    />
    <SurfaceCard className="flex min-h-0 flex-col p-4">
      <DataToolbar
        filters={
          <FormField label="狀態" htmlFor="remedy-status-filter">
            <Select
              id="remedy-status-filter"
              data-testid="remedy-status-filter"
              value={statusFilter}
              onChange={(e) => setQuery({ status: e.target.value, case: "" })}
            >
              <option value="">全部狀態</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </FormField>
        }
        trailing={<RefreshControl updatedAt={updatedAt} onRefresh={() => void loadList()} />}
      />

      {listLoading ? (
        <LoadingState title="載入補救案件…" />
      ) : listError ? (
        <ErrorState title="清單載入失敗" description={listError} onRetry={() => void loadList()} />
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon="💸"
          title="沒有符合條件的補救案件"
          description="買家提出退款或補救請求後，案件會出現在這裡。"
        />
      ) : (
        <ul className="mt-3 space-y-2" data-testid="admin-remedy-list">
          {items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                data-testid="admin-remedy-row"
                onClick={() => setQuery({ case: c.id })}
                aria-current={c.id === selectedId ? "true" : undefined}
                className={`w-full rounded-ds-card border px-4 py-3 text-left transition ${
                  c.id === selectedId
                    ? "border-ds-borderStrong bg-ds-surfaceSubtle font-medium"
                    : "border-ds-border bg-ds-surface hover:bg-ds-surfaceSubtle"
                }`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span data-testid="remedy-status-chip">
                    <StatusPill tone={STATUS_TONE[c.status]} label={STATUS_LABEL[c.status] ?? c.status} />
                  </span>
                  <span className="text-meta text-ds-textMuted">{caseTypeLabel(c.case_type)}</span>
                </span>
                <span className="mt-1 block text-body text-ds-heading">訂單 {c.order_id}</span>
                <span className="mt-0.5 block text-meta text-ds-textMuted">
                  請求 {fmtAmount(c.requested_amount)} ・ 提出於 {fmtTime(c.requested_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
    </div>
  );

  return (
    <div className="w-full" data-testid="admin-remedy-cases-page">
      <PageHeader
        title="退款／補救案件"
        description="消費者救濟案件的處置與稽核。這裡只記錄行外已完成的退款，系統不會匯錢。"
      />
      <AdminReviewWorkspace
        listLabel="補救案件佇列"
        detailLabel="案件詳情"
        onBackToList={() => setQuery({ case: "" })}
        list={list}
        detail={
          selectedId ? (
            /*
              只有**還沒有這個案件的資料**時才整塊換成 LoadingState。
              動作成功後的 refetch（`onChanged`）走的是同一個 `loadDetail`，
              若在那時也把詳情換掉，`CaseDetail` 會被卸載 ——
              操作者剛看到的「狀態已更新」／「已記錄退款執行」會在同一瞬間消失，
              等於做完一個涉及金錢的動作卻沒有任何回饋留在畫面上。
              refetch 期間保留現有內容，資料回來後原地更新。
            */
            detailLoading && detail?.case.id !== selectedId ? (
              <LoadingState title="載入案件詳情…" />
            ) : detailError ? (
              <ErrorState
                title="詳情載入失敗"
                description={detailError}
                onRetry={() => void loadDetail(selectedId)}
              />
            ) : detail ? (
              /*
                `key` 讓切換案件時整棵詳情重新掛載。少了它，表單狀態（處置理由、
                退款金額、交易參考）會跨案件殘留 —— 在一個結論是金錢的畫面上，
                那等於「在 A 案打的字可能被送到 B 案」。
              */
              <CaseDetail
                key={detail.case.id}
                detail={detail}
                onChanged={() => {
                  void loadDetail(selectedId);
                  void loadList();
                }}
              />
            ) : null
          ) : null
        }
        placeholder={
          <AdminReviewPlaceholder
            title="選擇一個案件"
            description="從左側佇列挑一個補救案件，這裡會顯示詳情、處置動作與稽核歷程。"
          />
        }
      />
    </div>
  );
}

function CaseDetail({ detail, onChanged }: { detail: DetailResponse; onChanged: () => void }) {
  const c = detail.case;

  const [toStatus, setToStatus] = useState<RemedyStatus | "">("");
  const [note, setNote] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<string[] | null>(null);

  // 終局狀態沒有任何合法轉移（backend `TRANSITIONS` 中為空陣列）。
  const terminal = c.status === "completed" || c.status === "rejected" || c.status === "cancelled";

  async function submitTransition() {
    if (!toStatus) {
      setMessage("請先選擇要轉移到的狀態。");
      return;
    }
    if (!note.trim()) {
      setMessage("請填寫處置理由 —— 這會寫進稽核歷程。");
      return;
    }
    setBusy(true);
    setMessage(null);
    setAllowed(null);
    try {
      const res = await apiFetch(`admin/remedy-cases/${encodeURIComponent(c.id)}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: toStatus,
          note: note.trim(),
          approvedAmount: approvedAmount.trim() === "" ? null : Number(approvedAmount),
        }),
      });
      if (!res.ok) {
        // 409 `invalid_transition` 會附上 `allowed` —— 照實顯示，
        // 前端不自行判斷合法性（見檔頭說明）。
        let body: { message?: string; code?: string; allowed?: string[] } = {};
        try {
          body = await res.clone().json();
        } catch {
          /* 下面用 parseApiErrorMessage 兜底 */
        }
        setAllowed(Array.isArray(body.allowed) ? body.allowed : null);
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      setToStatus("");
      setNote("");
      setApprovedAmount("");
      setMessage("狀態已更新。");
      onChanged();
    } catch {
      setMessage("操作失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="admin-remedy-detail">
      <SurfaceCard className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="remedy-detail-status">
            <StatusPill tone={STATUS_TONE[c.status]} label={STATUS_LABEL[c.status] ?? c.status} />
          </span>
          <span className="text-meta text-ds-textMuted">{caseTypeLabel(c.case_type)}</span>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Row label="案件編號" value={c.id} testid="remedy-case-id" />
          <Row label="訂單" value={c.order_id} />
          <Row label="品項" value={c.order_item_id ?? "（整張訂單）"} />
          <Row label="請求金額" value={fmtAmount(c.requested_amount)} />
          <Row label="核准金額" value={fmtAmount(c.approved_amount)} testid="remedy-approved-amount" />
          <Row label="實際退款金額" value={fmtAmount(c.refund_amount)} testid="remedy-refund-amount" />
          <Row label="退款執行時間" value={fmtTime(c.refund_paid_at)} testid="remedy-refund-paid-at" />
          <Row label="提出時間" value={fmtTime(c.requested_at)} />
          <Row label="決定時間" value={fmtTime(c.decision_at)} />
          <Row label="完成時間" value={fmtTime(c.completed_at)} />
        </dl>
        {c.buyer_statement ? (
          <div className="mt-4">
            <p className="text-meta text-ds-textMuted">買家陳述</p>
            <p className="mt-1 whitespace-pre-wrap text-body text-ds-heading">{c.buyer_statement}</p>
          </div>
        ) : null}
      </SurfaceCard>

      {/*
        三段式語意的提醒放在動作區的正上方，而不是埋在說明頁 ——
        會誤判的人正是在按下按鈕的那一刻。
      */}
      <SurfaceCard className="p-5">
        <h2 className="text-title text-ds-heading">處置</h2>
        <p className="mt-1 text-meta text-ds-textMuted">
          「已核准」不等於「已完成」，也不等於「錢已經退出去」。金錢退款必須先進入
          「待執行補救」，實際匯款在行外完成後再另行記錄。
        </p>

        {terminal ? (
          <p className="mt-4 text-body text-ds-textMuted" data-testid="remedy-terminal-notice">
            這個案件已進入終局狀態（{STATUS_LABEL[c.status]}），沒有可用的後續轉移。
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <FormField label="轉移到" htmlFor="remedy-to-status">
              <Select
                id="remedy-to-status"
                data-testid="remedy-to-status"
                value={toStatus}
                onChange={(e) => setToStatus(e.target.value as RemedyStatus | "")}
                disabled={busy}
              >
                <option value="">選擇狀態…</option>
                {ALL_STATUSES.filter((s) => s !== c.status).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="核准金額（選填，僅金錢補救需要）"
              htmlFor="remedy-approved-amount-input"
            >
              <Input
                id="remedy-approved-amount-input"
                data-testid="remedy-approved-amount-input"
                inputMode="numeric"
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
                disabled={busy}
                placeholder="例如 100"
              />
            </FormField>

            <FormField label="處置理由（必填）" htmlFor="remedy-note">
              <Textarea
                id="remedy-note"
                data-testid="remedy-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
                placeholder="寫下這次處置的依據，會寫入稽核歷程。"
              />
            </FormField>

            <Button
              type="button"
              intent="action"
              data-testid="remedy-submit-transition"
              onClick={() => void submitTransition()}
              loading={busy}
            >
              套用狀態轉移
            </Button>
          </div>
        )}

        {message ? (
          <p className="mt-3 text-body text-ds-heading" data-testid="remedy-action-message" role="status">
            {message}
          </p>
        ) : null}
        {allowed ? (
          <p className="mt-1 text-meta text-ds-textMuted" data-testid="remedy-allowed-transitions">
            目前允許的轉移：
            {allowed.length === 0
              ? "（無，這是終局狀態）"
              : allowed.map((s) => STATUS_LABEL[s as RemedyStatus] ?? s).join("、")}
          </p>
        ) : null}
      </SurfaceCard>

      <ExecuteRefundPanel key={c.id} c={c} onExecuted={onChanged} />

      <SurfaceCard className="p-5">
        <h2 className="text-title text-ds-heading">稽核歷程</h2>
        {detail.history.length === 0 ? (
          <p className="mt-2 text-body text-ds-textMuted">尚無歷程紀錄。</p>
        ) : (
          <ol className="mt-3 space-y-2" data-testid="remedy-history">
            {detail.history.map((h, i) => (
              <li
                key={h.id ?? `${i}`}
                className="rounded-ds-card border border-ds-border bg-ds-surfaceSubtle px-3 py-2"
              >
                <span className="text-body text-ds-heading">{h.action ?? "（未命名事件）"}</span>
                <span className="ml-2 text-meta text-ds-textMuted">{fmtTime(h.created_at)}</span>
              </li>
            ))}
          </ol>
        )}
      </SurfaceCard>
    </div>
  );
}

/**
 * 記錄退款執行（`POST admin/remedy-cases/:id/execute-refund`）。
 *
 * ## 這個表單**不會匯錢**
 *
 * 平台沒有串接金流（`CLAUDE.md` §1：人工轉帳 ＋ 憑證審核），`executeRefund()` 做的事
 * 是把「行外已經完成的那筆匯款」原子地寫成案件的完成證據
 * （`refund_amount` / `refund_method` / `refund_reference` / `refund_paid_at` ＋ `status='completed'`
 * 在同一個 UPDATE，`refundRemedy.service.js:350-361`）。
 * 因此文案必須明講這件事 —— 誤以為按下去就會退款的人，會在錢還沒匯出時就把案件結掉。
 *
 * ## 交易參考是**必填**
 *
 * backend 的理由寫得很清楚：「沒有交易參考的『已退款』不是憑據，是宣稱」
 * （`refundRemedy.service.js:305`）。前端擋空白只是省一趟往返，真正的守門仍在 backend。
 *
 * ## 什麼時候顯示表單
 *
 * 只有 `remedy_pending` ＋ 有核准金額（＝金錢補救）才給表單。這兩個條件**不是**前端自訂的
 * 規則，而是 backend 前兩道 guard 的鏡像（`invalid_state` / `non_cash_remedy`）——
 * 在其他狀態下顯示一個註定被拒絕的表單沒有意義。但**金額上限不在這裡判斷**：
 * 超額由 backend 回 `amount_exceeds_approved` ＋ `approvedAmount`，照實顯示。
 * `already_executed` 同理 —— 即使畫面已依 `refund_paid_at` 收起表單，
 * 併發情況下 backend 仍可能回 409，那個裁決一樣要顯示出來。
 */
function ExecuteRefundPanel({ c, onExecuted }: { c: RemedyCase; onExecuted: () => void }) {
  const monetary = c.approved_amount != null;
  const alreadyPaid = c.refund_paid_at != null;
  const pending = c.status === "remedy_pending";

  const [amount, setAmount] = useState(c.approved_amount == null ? "" : String(c.approved_amount));
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [approvedFromServer, setApprovedFromServer] = useState<number | null>(null);

  async function submit() {
    if (amount.trim() === "") {
      setMessage("請填寫實際退款金額。");
      return;
    }
    if (reference.trim() === "") {
      setMessage("請填寫交易參考（匯款單號／轉帳編號）—— 這是退款已完成的憑據。");
      return;
    }
    setBusy(true);
    setMessage(null);
    setApprovedFromServer(null);
    try {
      const res = await apiFetch(`admin/remedy-cases/${encodeURIComponent(c.id)}/execute-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          paymentReference: reference.trim(),
          // `refund_paid_at` 是 `TIMESTAMP`（無時區，`db/db_schema.sql:776`），
          // backend 以 `$5::timestamp` 轉型。因此送 `datetime-local` 的原值，
          // **不**轉成 ISO/UTC —— 那會讓操作者輸入的當地時間被靜默平移。
          paidAt: paidAt.trim() === "" ? null : paidAt.trim(),
          note: note.trim() === "" ? null : note.trim(),
        }),
      });
      if (!res.ok) {
        let body: { message?: string; code?: string; approvedAmount?: number } = {};
        try {
          body = await res.clone().json();
        } catch {
          /* 下面用 parseApiErrorMessage 兜底 */
        }
        setApprovedFromServer(typeof body.approvedAmount === "number" ? body.approvedAmount : null);
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      setMessage("已記錄退款執行，案件轉為「已完成」。");
      onExecuted();
    } catch {
      setMessage("操作失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  if (alreadyPaid) {
    return (
      <SurfaceCard className="p-5">
        <h2 className="text-title text-ds-heading">退款執行紀錄</h2>
        <p className="mt-2 text-body text-ds-heading" data-testid="remedy-refund-already-paid">
          這個案件已經記錄過退款執行，不能再記錄第二次。
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Row label="實際退款金額" value={fmtAmount(c.refund_amount)} />
          <Row label="退款方式" value={c.refund_method ?? "—"} />
          <Row
            label="交易參考"
            value={c.refund_reference ?? "—"}
            testid="remedy-refund-reference-value"
          />
          <Row label="執行時間" value={fmtTime(c.refund_paid_at)} />
        </dl>
      </SurfaceCard>
    );
  }

  if (!pending) return null;

  if (!monetary) {
    return (
      <SurfaceCard className="p-5">
        <h2 className="text-title text-ds-heading">退款執行紀錄</h2>
        <p className="mt-2 text-body text-ds-textMuted" data-testid="remedy-refund-non-cash">
          這個案件沒有核准金額，屬於非金錢補救（例如重新交付），沒有可記錄的退款。
          若應該退款，請先在「處置」記錄核准金額。
        </p>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className="p-5">
      <h2 className="text-title text-ds-heading">記錄退款執行</h2>
      <p className="mt-1 text-body text-ds-heading" data-testid="remedy-refund-disclaimer">
        這裡記錄的是「已經在行外完成」的一筆匯款；平台不會轉帳，送出這張表單不會把錢匯給任何人。
        請先完成銀行匯款，再回來填寫憑據。
      </p>
      <p className="mt-1 text-meta text-ds-textMuted">
        送出後案件會直接轉為「已完成」，而且不能再記錄第二次。
      </p>

      <div className="mt-4 space-y-3" data-testid="remedy-refund-form">
        <FormField
          label="實際退款金額（必填）"
          htmlFor="remedy-refund-amount-input"
          help={`本案核准金額為 ${fmtAmount(c.approved_amount)}；實際金額由後端檢核，不得超過核准金額。`}
        >
          <Input
            id="remedy-refund-amount-input"
            data-testid="remedy-refund-amount-input"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
          />
        </FormField>

        <FormField
          label="交易參考（必填）"
          htmlFor="remedy-refund-reference"
          help="匯款單號、轉帳交易編號或其他可回查的憑據。"
        >
          <Input
            id="remedy-refund-reference"
            data-testid="remedy-refund-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={busy}
            placeholder="例如 TXN-20260912-001"
          />
        </FormField>

        <FormField
          label="匯款時間（選填）"
          htmlFor="remedy-refund-paid-at-input"
          help="留空則記為現在。請填實際匯款的當地時間。"
        >
          <Input
            id="remedy-refund-paid-at-input"
            data-testid="remedy-refund-paid-at-input"
            type="datetime-local"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            disabled={busy}
          />
        </FormField>

        <FormField label="備註（選填）" htmlFor="remedy-refund-note">
          <Textarea
            id="remedy-refund-note"
            data-testid="remedy-refund-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            placeholder="補充說明，會寫入案件備註與稽核歷程。"
          />
        </FormField>

        <Button
          type="button"
          intent="action"
          data-testid="remedy-refund-submit"
          onClick={() => void submit()}
          loading={busy}
        >
          記錄這筆已完成的退款
        </Button>
      </div>

      {message ? (
        <p className="mt-3 text-body text-ds-heading" data-testid="remedy-refund-message" role="status">
          {message}
        </p>
      ) : null}
      {approvedFromServer != null ? (
        <p className="mt-1 text-meta text-ds-textMuted" data-testid="remedy-refund-approved-cap">
          後端記錄的核准金額：{fmtAmount(approvedFromServer)}
        </p>
      ) : null}
    </SurfaceCard>
  );
}

/**
 * Admin 代為建立補救案件（`POST orders/:orderId/remedy-cases`）。
 *
 * ## 為什麼 Admin 需要這個入口
 *
 * 買家自助送出不是唯一的來路 —— 電話、email、客服轉來的申訴都會落到維運者手上，
 * 而 `Backend/routes/order.js:466` 本來就允許 admin 代訂單擁有者開案。
 * 少了這個表單，那條路徑只能直打 API，等於沒有稽核入口。
 *
 * ## 只送 backend 接受的欄位
 *
 * route 解構的就是這四個：`{ orderItemId, caseType, statement, requestedAmount }`。
 * 不多送、不自創欄位；`buyer_id` 由 backend 從訂單推得（不是前端指定的），
 * 這一點很重要 —— 否則 admin 就能把案件掛到任意使用者身上。
 *
 * ## 前端不判斷訂單存不存在
 *
 * 訂單編號是自由輸入。不存在 → backend 回 404 `order_not_found`；
 * 品項不屬於該訂單 → 400 `order_item_mismatch`；金額非正整數 → 400 `invalid_amount`。
 * 三者都照實顯示，前端不預先猜。
 */
function CreateCasePanel({ onCreated }: { onCreated: (created: RemedyCase) => void }) {
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [orderItemId, setOrderItemId] = useState("");
  const [caseType, setCaseType] = useState<string>("");
  const [statement, setStatement] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (orderId.trim() === "") {
      setMessage("請填寫訂單編號。");
      return;
    }
    if (caseType === "") {
      setMessage("請選擇案件類型。");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch(`orders/${encodeURIComponent(orderId.trim())}/remedy-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderItemId: orderItemId.trim() === "" ? null : orderItemId.trim(),
          caseType,
          statement: statement.trim() === "" ? null : statement.trim(),
          requestedAmount: requestedAmount.trim() === "" ? null : Number(requestedAmount),
        }),
      });
      if (!res.ok) {
        setMessage(await parseApiErrorMessage(res));
        return;
      }
      const data = (await res.json()) as { case: RemedyCase };
      setOrderId("");
      setOrderItemId("");
      setCaseType("");
      setStatement("");
      setRequestedAmount("");
      setOpen(false);
      setMessage(null);
      onCreated(data.case);
    } catch {
      setMessage("建立失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SurfaceCard className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-title text-ds-heading">代為建立案件</h2>
          <p className="mt-0.5 text-meta text-ds-textMuted">
            買家透過客服管道申訴時，由維運者在這裡登錄成正式案件。
          </p>
        </div>
        <Button
          type="button"
          intent="neutral"
          data-testid="remedy-create-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "收合" : "建立案件"}
        </Button>
      </div>

      {open ? (
        <div className="mt-4 space-y-3" data-testid="remedy-create-form">
          <FormField label="訂單編號（必填）" htmlFor="remedy-create-order-id">
            <Input
              id="remedy-create-order-id"
              data-testid="remedy-create-order-id"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              disabled={busy}
            />
          </FormField>

          <FormField
            label="訂單品項編號（選填）"
            htmlFor="remedy-create-order-item-id"
            help="留空表示整張訂單。"
          >
            <Input
              id="remedy-create-order-item-id"
              data-testid="remedy-create-order-item-id"
              value={orderItemId}
              onChange={(e) => setOrderItemId(e.target.value)}
              disabled={busy}
            />
          </FormField>

          <FormField label="案件類型（必填）" htmlFor="remedy-create-case-type">
            <Select
              id="remedy-create-case-type"
              data-testid="remedy-create-case-type"
              value={caseType}
              onChange={(e) => setCaseType(e.target.value)}
              disabled={busy}
            >
              <option value="">選擇類型…</option>
              {CASE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {caseTypeLabel(t)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            label="買家陳述（選填）"
            htmlFor="remedy-create-statement"
            help="照實記錄買家的說法，不要改寫成結論。"
          >
            <Textarea
              id="remedy-create-statement"
              data-testid="remedy-create-statement"
              rows={3}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              disabled={busy}
            />
          </FormField>

          <FormField
            label="請求金額（選填）"
            htmlFor="remedy-create-amount"
            help="買家要求的金額。這不是核准金額，核准在後續處置時才決定。"
          >
            <Input
              id="remedy-create-amount"
              data-testid="remedy-create-amount"
              inputMode="numeric"
              value={requestedAmount}
              onChange={(e) => setRequestedAmount(e.target.value)}
              disabled={busy}
            />
          </FormField>

          <Button
            type="button"
            intent="action"
            data-testid="remedy-create-submit"
            onClick={() => void submit()}
            loading={busy}
          >
            建立案件
          </Button>
        </div>
      ) : null}

      {message ? (
        <p className="mt-3 text-body text-ds-heading" data-testid="remedy-create-message" role="status">
          {message}
        </p>
      ) : null}
    </SurfaceCard>
  );
}

function Row({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div>
      <dt className="text-meta text-ds-textMuted">{label}</dt>
      <dd className="text-body text-ds-heading" data-testid={testid}>
        {value}
      </dd>
    </div>
  );
}
