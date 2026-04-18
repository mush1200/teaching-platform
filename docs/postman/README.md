# Postman / Newman — 後端 API 驗證

## 檔案

| 檔案 | 說明 |
|------|------|
| `teaching-platform-backend.postman_collection.json` | Collection v2.1（含 Tests 串變數） |
| `local.postman_environment.json` | 本機環境，`baseUrl` 預設 `http://127.0.0.1:3000` |

## 一鍵執行（Newman）

1. 啟動後端（需 PostgreSQL 與 `Backend/.env`）  
   `npm run start`（專案根目錄）

2. 另開終端，在**專案根目錄**執行：  
   `npm run postman`

等同於在 `Backend` 目錄執行：

`npm run postman:newman`

### 自訂網址

```bash
cd Backend
npx newman run ../docs/postman/teaching-platform-backend.postman_collection.json \
  -e ../docs/postman/local.postman_environment.json \
  --env-var "baseUrl=http://localhost:3000"
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

兩者都會註冊新帳號（email 含時間戳），不需手動準備種子資料。
