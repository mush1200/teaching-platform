# Postman / Newman — 後端 API 驗證

## 檔案

| 檔案 | 說明 |
|------|------|
| `teaching-platform-backend.postman_collection.json` | Collection v2.1（含 Tests 串變數） |
| `local.postman_environment.json` | 本機環境，`baseUrl` 預設 `http://127.0.0.1:3000`；`testAdminEmail` / `testAdminPassword` **必須保持空值** |
| `fixtures/proof-a.jpg`、`fixtures/proof-b.png` | 付款憑證上傳流程用的**自動化測試資產** |

### fixtures 說明

`fixtures/` 內兩個圖檔是 `POST /orders/:id/upload-proof` 的 multipart 測試素材，
**不是使用者上傳的內容、也不是產品資料**：

- `proof-a.jpg` — 1×1 baseline JPEG，160 bytes
- `proof-b.png` — 1×1 透明 PNG，70 bytes
- 內容為最小合法圖檔位元組，**不含任何真實個資、憑證或業務資料**
- 檔名與內容固定（deterministic），不依賴任何外部下載

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
