# Page-Level Token Usage Mapping v1.1

This mapping defines how semantic tokens (`intent`, `level`, `status`, `feedback`) are applied on key pages.

**Architecture & card primitive choice:** `docs/frontend-ui-architecture.md`  
**Token definitions (`ds`, `intent`, status):** `docs/design-tokens-v1.1.md`

## Scope

- `frontend/apps/web/app/teacher/materials/page.tsx`
- `frontend/apps/web/app/teacher/sales/page.tsx`
- `frontend/apps/web/app/orders/page.tsx`
- `frontend/apps/web/app/my-reviews/page.tsx`
- `frontend/apps/web/app/admin/reports/page.tsx`
- `frontend/apps/web/app/admin/orders/page.tsx`
- `frontend/apps/web/app/downloads/page.tsx`

---

## 1. Teacher Materials (`/teacher/materials`)

### Button Intent

| UI Element | Intent | Notes |
| --- | --- | --- |
| `新增教材` | `flow` | Primary workflow action |
| `銷售紀錄` | `action` | Management navigation |
| `教材評論` / `編輯` | `action` | Secondary operations |

### Card Level

| Section | Level |
| --- | --- |
| `篩選與操作` | `flat` |
| `教材列表` | `default` |

### Feedback

| State | Component |
| --- | --- |
| loading | `LoadingState` |
| empty | `EmptyState` |
| error | `ErrorState` |

### Status

- Material status badge is rendered by `StatusBadge` with status-mapped tone.

---

## 2. Teacher Sales (`/teacher/sales`)

### Button Intent

| UI Element | Intent | Notes |
| --- | --- | --- |
| `匯出 CSV` | `action` | Utility action |
| `返回教材管理` | `neutral` | Navigation fallback |
| `匯出 Top 5 CSV` | `action` | Utility action |
| `評論` / `編輯` | `action` | Record-level operations |

### Card Level

| Section | Level |
| --- | --- |
| `篩選條件` | `flat` |
| KPI cards | `elevated` |
| 趨勢 / Top 5 / 彙總 / 明細 | `default` |

### Feedback

| State | Component |
| --- | --- |
| loading | `LoadingState` |
| empty | `EmptyState` |
| error | `ErrorState` |

---

## 3. Parent Orders (`/orders`)

### Button Intent

| UI Element | Intent | Notes |
| --- | --- | --- |
| `前往登入` | `flow` | Main auth flow |
| `查看/收合訂單內容` | `neutral` | Read-only toggle |
| `上傳付款憑證` | `flow` | Primary next step |

### Card Level

| Section | Level |
| --- | --- |
| 未登入卡片 | `elevated` |
| 訂單列表說明 / 每筆訂單 | `default` |
| 載入/錯誤/空資料提示 | `flat` |

### Status

- Order status badge uses semantic mapping:
  - `pending_payment`
  - `approved/completed/paid`
  - `rejected`
  - fallback `cancelled/other`

---

## 4. Parent My Reviews (`/my-reviews`)

### Card Level

| Section | Level |
| --- | --- |
| 每則評論卡片 | `default` (semantic radius/shadow variables) |

### Feedback

| State | Component |
| --- | --- |
| loading | `LoadingState` |
| empty | `EmptyState` |
| error | `ErrorState` |

---

## 5. Admin Reports (`/admin/reports`)

### Button Intent

| UI Element | Intent | Notes |
| --- | --- | --- |
| `標記已處理` | `action` | Admin moderation operation |

### Card Level

| Section | Level |
| --- | --- |
| 每筆檢舉卡片 | `default` |

### Feedback

| State | Component |
| --- | --- |
| loading | `LoadingState` |
| empty | `EmptyState` |
| error | `ErrorState` |

---

## 6. Admin Orders (`/admin/orders`)

### Card Level

| Section | Level |
| --- | --- |
| 每筆訂單卡片 | `default` |

### Feedback

| State | Component |
| --- | --- |
| loading | `LoadingState` |
| empty | `EmptyState` |
| error | `ErrorState` |

---

## 7. Parent Downloads (`/downloads`)

### Button Intent

| UI Element | Intent | Notes |
| --- | --- | --- |
| `取得下載連結` | `action` | Fetch authorized signed URL |
| `查詢下載連結` | `action` | Manual query tool |
| EmptyState `前往登入` | `action` | Auth-required entry |

### Card Level

| Section | Level |
| --- | --- |
| 待下載教材卡片 | `default` |
| 手動輸入教材 ID 區塊 | `flat` |

### Feedback

| State | Component |
| --- | --- |
| no token | `EmptyState` |
| pending list empty | `EmptyState` |
| per-item fetch error | inline warning text |

---

## 8. Implementation Rules

1. Workflow CTAs must use `intent="flow"`.
2. Management/list operations must use `intent="action"`.
3. Back/cancel/toggle actions should use `intent="neutral"`.
4. Destructive actions should use `intent="danger"`.
5. Utility/filter containers should prefer card `level="flat"`.
6. Data cards should default to card `level="default"`.
7. High-emphasis summary blocks should use card `level="elevated"`.
