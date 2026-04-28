# UI Role Naming Checklist

這份清單用於前端 UI 文案審查，確保角色命名符合「去角色標籤化」規則。

## Scope

- 適用：Web / Mobile 的 UI 文案（標題、按鈕、側邊欄、提示、CTA、空狀態）。
- 不適用：DB schema、API、JWT、權限判斷、程式內 role 常數（`parent`/`teacher`/`admin`）。

## Must Follow

- 不在 UI 顯示系統角色名稱：
  - 不顯示 `parent`、`teacher`、`admin`（字面角色值）。
  - 不以「家長」「老師」作為主要身分稱呼。
- 採用目的導向/行為導向文案：
  - 例如：`探索教材`、`我的訂單`、`我的內容`、`教材工作台`、`銷售與收益`。
- 保持平台可擴展：
  - 文案不可暗示「購買者只可能是家長」或「上架者只可能是老師」。

## Allowed Exception

- `Register` 頁可使用目的導向選項：
  - `我要購買教材`（對應 `role: parent`）
  - `我要上架教材`（對應 `role: teacher`）
- 補充說明可提及族群（家長/學生/老師等），但不可作為主標籤。

## Forbidden Examples

- `Hi，家長 👋`
- `Hi，老師 👋`
- `家長專區`
- `老師專區`

## Recommended Wording

- 通用歡迎語：`Hi，歡迎回來 👋`
- Buyer 首頁：`探索適合你的教材`
- Teacher 區：`你的教材工作台`、`管理你的教材與銷售`
- 側邊欄：`我的教材`、`銷售與收益`、`我的訂單`、`下載中心`

## PR Self-Check (Copy/Paste)

- [ ] 沒有在 UI 顯示 `parent/teacher/admin` 系統角色字面值
- [ ] 沒有使用「家長/老師」作為主稱呼（Register 說明文字除外）
- [ ] 文案以「做什麼」而不是「你是誰」為主
- [ ] 不影響 API、權限、JWT、routing
- [ ] Register 頁的兩個選項仍為「我要購買教材 / 我要上架教材」

## Quick Search Commands

以下命令可在前端改文案後快速自查：

```bash
rg "家長專區|老師專區|Hi，家長|Hi, 家長|Hi，老師|Hi, 老師|\\bTeacher\\b|\\bParent\\b|\\bparent\\b|\\bteacher\\b" frontend/apps/web
```

```bash
rg "家長|老師" frontend/apps/web/app frontend/apps/web/components
```

> 注意：搜尋結果若出現在型別、測試、路由常數、API 欄位，通常屬於系統層，不是 UI 顯示層，需人工判斷是否為違規文案。
