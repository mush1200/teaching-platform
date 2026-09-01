# Postman / Newman — 後端 API 驗證

## 檔案

| 檔案 | 說明 |
|------|------|
| `teaching-platform-backend.postman_collection.json` | Collection v2.1（含 Tests 串變數） |
| `local.postman_environment.json` | 本機環境，`baseUrl` 預設 `http://127.0.0.1:3000`；`testAdminEmail` / `testAdminPassword` **必須保持空值** |
| `fixtures/proof-a.jpg`、`fixtures/proof-b.png` | 付款憑證上傳流程用的**自動化測試資產** |
| `fixtures/material-a.pdf`、`fixtures/material-b.pdf` | 教材本體上傳流程用的**自動化測試資產** |
| `fixtures/cover-a.png` | 教材封面素材上傳流程用的**自動化測試資產** |

### fixtures 說明

`fixtures/` 內的檔案是 multipart 測試素材，**不是使用者上傳的內容、也不是產品資料**：

付款憑證（`POST /orders/:id/payment-proof`，legacy 別名 `/upload-proof`）：

- `proof-a.jpg` — 1×1 baseline JPEG，160 bytes
- `proof-b.png` — 1×1 透明 PNG，70 bytes

教材本體（`POST /teacher/uploads/material-file`）：

- `material-a.pdf` / `material-b.pdf` — 最小合法 PDF，各 125 bytes

教材行銷素材（`POST /teacher/uploads/material-media?kind=cover|detail|demo`）：

- `cover-a.png` — 1×1 PNG，69 bytes

**三個端點都驗 magic bytes**，所以這些 fixture 必須是**真的**該格式
（`%PDF-` / `FFD8FF` / `89504E47`）—— 隨手一串位元組正是那一層要擋掉的東西。
憑證與行銷素材的驗證都是三層：副檔名 + 宣告 MIME + magic bytes。

行銷素材的 fixture 另有一個 collection 層面的用途：`02 Materials` 會拿上傳回來的
**交付 URL** 當該教材的 `cover_image_url`，接著在 approve 前後各打一次
`GET /materials/media/:mediaId`，鎖住 `SEC-02` 的核心契約 ——
`pending_review` 時匿名 401、上架後匿名 200 且 `Cache-Control: public`，
而舊的 `/uploads/material-media/*` 一律 404。

共通：

- 內容為最小合法檔案位元組，**不含任何真實個資、憑證或業務資料**
- 檔名與內容固定（deterministic），不依賴任何外部下載

### 付款憑證的私有儲存斷言（2026-08-23）

`03 Cart & Orders` 內的憑證流程除了上傳成功之外，還會斷言這一輪 security hardening
的不變條件（任何一條失守都代表憑證又變成公開資產）：

| 請求 | 斷言 |
| --- | --- |
| `POST orders/:id/upload-proof` | 回應**不含** `proof_url` / `storage_key` / `checksum_sha256`，只給 `proof_file_path` |
| `GET orders/:orderId/payment-proofs` | metadata 清單不含公開 URL |
| `GET …/payment-proofs/:proofId/file`（owner） | 200，且 `Cache-Control: private, no-store` + `X-Content-Type-Options: nosniff` |
| 同上（admin） | 200 |
| 同上（無 Token） | 401 |
| 同上（非 owner，teacher token） | 403 |
| `GET /uploads/payment-proofs/*` | **404** `payment_proof_not_public` —— 舊的公開靜態路徑已停止服務 |

`05 Reject flow` 的 `GET admin payment-proofs/:id` 另外斷言 Admin 審核 context
也不再回傳 `proof_url`。

Collection 內以相對路徑 `fixtures/proof-a.jpg` 引用。Newman 以 `workingDir` 解析該路徑
（由 `Backend/scripts/run-postman.js` 指向本資料夾），因此**在任何目錄執行都可重現**。
在 Postman App 中手動執行時，請將 App 的 working directory 設為本資料夾，或於請求中重新選檔。

## Admin 憑證（必要）

公開註冊**不能**建立 admin：`POST /auth/register` 帶 `role: "admin"` 一律回 **403**。
Collection 的 `01 Auth → POST login admin` 改為**登入既有 admin 帳號**。

1. 先以維運 CLI 建立一次（密碼至少 16 字元）：

   ```bash
   ADMIN_EMAIL=<email> ADMIN_PASSWORD=<password> npm run create-admin --prefix Backend
   ```

2. 執行測試前提供環境變數：

   | 變數 | 說明 |
   |------|------|
   | `TEST_ADMIN_EMAIL` | 上一步建立的 admin email |
   | `TEST_ADMIN_PASSWORD` | 該帳號密碼 |

   缺任一個時，`npm run postman` 會**明確失敗並指出缺少哪一個變數**，不會退回自動註冊 admin。

> ⚠️ **不得**將真實憑證寫入 `local.postman_environment.json`、collection、或任何版控檔案。
> `npm run postman` 由 `Backend/scripts/run-postman.js` 以程式化方式注入 Newman 環境變數
> （不走 `--env-var` CLI 參數，避免密碼出現在 process argv）。

## 一鍵執行（Newman）

1. 啟動後端（需 PostgreSQL 與 `Backend/.env`）  
   `npm run start`（專案根目錄）

2. 另開終端，在**專案根目錄**執行：  
   `TEST_ADMIN_EMAIL=<email> TEST_ADMIN_PASSWORD=<password> npm run postman`

等同於在 `Backend` 目錄執行：

`npm run postman:newman`

### 自訂網址

`baseUrl` 可用環境變數覆寫既有值；仍需提供 admin 憑證：

```bash
cd Backend
TEST_ADMIN_EMAIL=<email> TEST_ADMIN_PASSWORD=<password> \
  npm run postman:newman
```

若要直接呼叫 newman CLI（一次性除錯用），需自行帶入三個變數。
注意 `--env-var` 會讓密碼出現在 process argv，正式流程請走上方 `npm run postman:newman`：

```bash
cd Backend
npx newman run ../docs/postman/teaching-platform-backend.postman_collection.json \
  -e ../docs/postman/local.postman_environment.json \
  --env-var "baseUrl=http://localhost:3000" \
  --env-var "testAdminEmail=<email>" \
  --env-var "testAdminPassword=<password>"
```

## 在 Postman App 匯入

1. Import → 選 `teaching-platform-backend.postman_collection.json`  
2. Import → 選 `local.postman_environment.json`  
3. 右上角環境選 **Teaching Platform — local**  
4. 選 Collection → Run collection（可跑全包或選資料夾）

## 與 `npm run smoke` 的差異

| 方式 | 說明 |
|------|------|
| `npm run smoke` | Node 腳本 `Backend/scripts/api-smoke-test.js`，不依賴 Postman |
| `npm run postman` | Newman 跑同一套 REST 流程，與 Postman GUI 共用 Collection |

兩者的 teacher / parent 帳號都會即時註冊（email 含時間戳），不需手動準備；
但 **admin 需事先以 CLI 建立**，並透過 `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` 提供（見上）。
`npm run smoke` 的環境變數需求與此相同。
