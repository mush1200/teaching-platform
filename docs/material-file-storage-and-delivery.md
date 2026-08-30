# Material File Upload & Secure Delivery — Audit + Implementation Spec

> **狀態：已實作（2026-08-23）。** P0 範圍全部落地並通過回歸
> （unit 104 + DB 130 + smoke 全綠 + Postman 96 assertions / 0 failed + E2E 24 passed）。
>
> §2「現況」保留的是**實作前**的盤點，作為決策依據的歷史紀錄，不是目前的行為；
> 目前的行為以 §5 之後各節為準。仍未做的東西集中在 §18 Scope 的 Out 清單與 §22。
>
> **相關文件：** `docs/material-review-workflow.md`（教材審核 workflow）、
> `docs/admin-information-architecture.md`、`docs/pending-work-tracker.md`（active backlog 的唯一 source of truth）、
> `docs/mvp_rules.md`、`docs/teaching-platform-mvp-spec-v1.4.md`

---

## 1. 為什麼這是基礎設施，不是一個上傳按鈕

這條 milestone 決定的是 marketplace 的四件事：**誰能拿到檔案、審核過的是不是同一個檔案、
買家付了錢拿到什麼、以及下架之後買家還剩下什麼**。因此本規格的核心是授權與版本隔離，
上傳 UI 只是它的入口。

兩條**絕對不能發生**的事（見 §9 Security Invariants）：

```text
Creator 換掉檔案 → 未經 Admin 審核 → Buyer 直接拿到新檔
知道 /uploads URL → 不購買也能下載教材本體
```

---

## 2. 現況（**實作前**的 repository 實測，2026-08-23）

> 以下描述的是這條 milestone **動工之前**的狀態，保留作為決策依據。
> 例如 `file_key` 的「NOT NULL」在實作時發現只存在於應用層驗證，DB 欄位本身是 nullable（見 §11）。

### 2.1 目前真的存在的檔案能力

| 能力 | 端點 | 儲存位置 | 對外 | 限制 |
| --- | --- | --- | --- | --- |
| 教材媒體（封面／細節圖／示範影片） | `POST /teacher/uploads/material-media?kind=cover\|detail\|demo` | `Backend/uploads/material-media/` | **公開** `GET /uploads/...` ⚠️ | 圖片 10MB（JPEG/PNG/GIF/WebP）、影片 80MB（MP4/WebM）；檔名 `timestamp_12hex.ext` |
| ↑ **已於 2026-08-24 修正（`SEC-02`）** | 同上 | `Backend/private-storage/material-media/` | **條件公開** `GET /materials/media/:mediaId` | 同上，另加 magic bytes 驗證。見 §24 |
| 付款憑證 | `POST /orders/:id/payment-proof`（`upload-proof` 為 legacy 別名） | `Backend/uploads/payment-proofs/` | **公開** `GET /uploads/...` ⚠️ | 每張 10MB、每次最多 3 張、JPEG/PNG/WebP |
| ↑ **已於 2026-08-23 修正** | 同上 | `Backend/private-storage/payment-proofs/` | **私有** + 授權讀取 | 同上，另加 magic bytes 驗證。見 §23 |
| **教材本體** | **不存在** | **不存在** | — | — |

`Backend/index.js:28` — `app.use("/uploads", express.static(path.join(__dirname, "uploads")))`：
整個 `uploads/` 目錄無條件公開，**沒有任何認證**。

### 2.2 `materials.file_key` 的真相

- schema：`file_key TEXT NOT NULL`（`db/db_schema.sql`）。
- 寫入：`POST /materials` 的 `validatePayload` 要求非空字串；`PUT/PATCH` 以 `COALESCE` 更新。
  **創作者在表單上手打**（`app/teacher/materials/new/page.tsx:275` 的「檔案 Key *」`InputField`）。
- 讀取：只被當字串顯示（Admin 審核面板的形式檢查、Creator 編輯表單）。
  **沒有任何程式碼用它開啟檔案。**
- 磁碟：`Backend/uploads/` 底下**沒有任何 PDF**（實測 `material-media/` 0 個檔案）。

**結論：`file_key` 是 placeholder 字串欄位，不是儲存鍵。**

### 2.3 目前的 Buyer 下載

`Backend/routes/download.js` — `GET /download/:materialId`：

```js
// 授權：使用者自己的、狀態 approved 的訂單，且該訂單含這份教材
WHERE o.user_id = $1 AND o.status = 'approved' AND oi.material_id = $2
// 通過後：
const signedUrl = `https://download.local/materials/${id}?token=mock-${Date.now()}`;
return res.json({ materialId, signedUrl, expiresInSeconds: 300 });
```

- 授權邏輯**是對的**（見 §7）；交付是**假的**（`download.local` 不存在）。
- 稽核已存在：`download.attempted` / `download.allowed`（meta 含 orderId）/ `download.denied`。
- 前端 `app/downloads/page.tsx:92` 直接 `window.open(data.signedUrl)`。
- **`materials.status` 不在授權條件中** —— 下架後既有買家仍可下載，這正是我們要的（§7.3）。

### 2.4 傳輸層的硬限制（決定交付方式）

`frontend/apps/web/app/api/backend/[...path]/route.ts` 的 proxy：

```js
const upstream = await fetch(targetUrl, init);
const text = await upstream.text();          // ← 二進位會被當文字解碼
return new NextResponse(text, { status, headers: { "Content-Type": ct } });
```

**任何二進位檔案經由這個 proxy 都會損毀，且 `Content-Disposition` 會被丟掉。**
Backend 也沒有 CORS middleware，因此瀏覽器不能用 XHR 直接跨源取檔。
→ 交付必須是**瀏覽器 top-level navigation 到 Backend 的一次性 URL**（§6）。

### 2.5 部署現況

repository **沒有任何部署設定**（無 Dockerfile / docker-compose / render.yaml / Procfile / fly.toml / vercel.json）。
唯一的線索是 `PUBLIC_BACKEND_URL` 環境變數（用來組出可公開存取的上傳 URL）。
`Backend/uploads/` 已在 `.gitignore` 中。

**因此無法斷言 local disk 在 production 是否會遺失** —— 這是本規格採用 storage abstraction 的主因（§4）。

---

## 3. 現有資料盤點（read-only）

| 指標 | `teaching_platform`（dev） | `teaching_platform_security_test` |
| --- | --- | --- |
| materials 總數 | 98 | 173 |
| `file_key IS NULL` | 6 | 6 |
| `file_key = ''` | 0 | 0 |
| `files/...` 前綴 | 87 | 162 |
| 看起來像 URL | 0 | 0 |
| distinct keys / 有值列 | 85 / 92 | — |

依狀態（dev）：`published` 91（其中 2 筆無 key）、`pending_review` 3（0 缺）、`unpublished` 4（**4 筆全缺**）。

值的樣態（取樣）：`files/smoke_<n>.pdf`（39）、`files/smoke_rej_<n>.pdf`（34）、
`files/postman-a.pdf`（4）、`files/demo-<n>.pdf`（3）、`seed/materials/mat_detail_seed_1.pdf`（1）。

**判斷：全部是測試／種子產生的假路徑，磁碟上沒有對應檔案，`distinct < rows`（同一個字串被多筆共用）。
零 migration 價值。**（`file_key` 同時被 6 個 DB 測試 fixture、smoke 與 Postman 寫入，見 §11。）

---

## 4. Storage 架構決策

| 方案 | 評估 |
| --- | --- |
| **A. Local private disk** | 最快、零成本、零依賴。但**部署模型未知** —— 若最終落在 ephemeral filesystem 的 PaaS，檔案會在每次 deploy 消失，而那是買家已付費的商品 |
| **B. 直接上 S3 / R2** | production 正確，但現在就要引入 SDK、憑證管理、本機開發要 minio 或連雲端，且**部署平台尚未決定**，等於先為一個還不存在的環境付出複雜度 |
| **C. Storage abstraction + local driver（推薦）** | business logic 只依賴 `MaterialFileStorage` 介面；MVP 用 local private driver，決定部署平台後換 driver，**不動任何業務程式碼** |

**推薦：C。**

repo 現有架構本來就是「canonical module + 薄 route」的形狀
（`utils/materialWorkflow.js`、`utils/reportWorkflow.js`、`services/*.service.js`），
再加一個 storage adapter 完全一致，不是過度工程 —— 它解決的是一個**真實且已知的未知數**
（部署平台未定），而不是假想需求。

### 4.1 介面（概念，非實作）

```text
MaterialFileStorage
  put(readable, { contentType, sizeBytes })      -> { storageKey }
  openReadStream(storageKey)                     -> Readable
  stat(storageKey)                               -> { exists, sizeBytes }
  delete(storageKey)                             -> void
  // 未來 object storage driver 才需要：
  createSignedUrl?(storageKey, { ttlSeconds, downloadFilename })
```

- MVP driver：`LocalPrivateFileStorage`（`Backend/storage/privateFileStorage.js`），
  根目錄 `Backend/private-storage/`，教材本體落在 `material-files/` namespace，
  **必須在 `express.static` 服務範圍之外**。
  `LocalMaterialFileStorage` 仍存在，現為綁定 `material-files` namespace 的相容子類別。
- 未來：`S3PrivateFileStorage` / `R2PrivateFileStorage`。
  `createSignedUrl` 存在時由 delivery 層優先使用；不存在時走 backend streaming（§6）。

### 4.2 Storage key 格式

```text
material-files/<uuid-v4>            例：material-files/9f3c1c8e-…-b2
```

- **opaque**：不含原始檔名、不含 email、不含 material id 之外的任何語意。
- 原始檔名只存 DB metadata，交付時才用於 `Content-Disposition`。
- key 由 backend 產生，**永不接受 client 提供的 key**（path traversal 的根本防線）。
- key 不得出現在任何對 Buyer / 公開的 API 回應中。

### 4.3 原始檔名的編碼（`DX-14`，2026-08-27）

**`busboy` 解析 multipart 的 `filename` 參數時預設用 latin1**，因此
`req.file.originalname` 拿到的是「UTF-8 位元組被逐一當成 latin1 字元」的字串：

```text
瀏覽器送出 : 匯款證明-2026年8月27日.png
multer 交出 : å¯æ¬¾è­æ-2026å¹´8æ27æ¥.png
```

這個值若直接寫進 `original_filename`，**壞的就是寫入當下**；交付端只是忠實地把壞值
編碼進 `Content-Disposition`。修復前 `manual_payment_proofs` 與 `material_files`
都已存在這種列（見 `DX-14` evidence）。

**修法：`Backend/utils/multipartFilename.js` 為唯一的還原點。**
`multer 2.0.2` **不轉傳** busboy 的 `defParamCharset`（只給
`{ headers, limits, preservePath }`），所以無法在 busboy 層設定，必須在邊界還原。

| 上傳路徑 | 套用方式 |
| --- | --- |
| 付款憑證（`routes/order.js`） | `normalizeUploadedFilenames` middleware，掛在 multer 之後 |
| 申訴證據（`routes/complaints.js`） | 同上 |
| 教材本體／教材媒體（`routes/teacherUpload.js`） | 直接呼叫 `normalizeMultipartFilename()` —— 這兩處用 custom storage engine，`_handleFile` 比 post-multer middleware **更早**執行 |

**還原是有條件的，不是無條件 `latin1 → utf8`。** 兩道條件都成立才轉：

1. 字串每個碼點都 ≤ 0xFF（它才可能是一串 bytes；也讓函式**冪等**）；
2. 那串 bytes 是**合法 UTF-8**（`TextDecoder(..., { fatal: true })` 嚴格驗）。

任一條不成立就**原樣返回** —— 純 ASCII 因此逐位元組不變，
真正的 latin1／cp1252 文字也不會被硬轉成亂碼。

**這裡只做編碼還原，不做 sanitization。**
不 slugify、不轉寫、不強制 ASCII、不改副檔名、不重新命名。
UTF-8 的多位元組序列每個位元組都 ≥ 0x80，因此還原**無法憑空產生**
`/`、`\`、NUL、CR、LF 或 `..` —— 檔名的 header 安全仍由
`utils/fileDownloadResponse.js` 的 `contentDisposition()` 負責，
儲存路徑仍完全由 server 產生的 `storage_key` 決定（§4.2）。

> **既有壞資料未修復（刻意）。** 本次只阻止**新的**壞值產生。
> 回填需要逐列判斷原意並同時考慮實體物件，屬資料決策，另行追蹤。

---

## 5. 資料模型決策

### 5.1 為什麼單欄位不夠

若只有 `materials.file_key` 一欄：

```text
Admin 審 A.pdf → 核准 → published
Creator 直接改 file_key → 指向 B.pdf
Buyer 立刻下載 B.pdf（從未被審核）
```

`updateMaterialHandler` 目前**允許 owner teacher 在任何狀態更新 `file_key`**
（`COALESCE($7, file_key)`），這個漏洞現在就存在，只是因為檔案是假的所以無害。

### 5.2 三案比較

| | A. 單欄位 | B. 兩槽（approved + pending 欄位） | **C. `material_files` 表 + 兩個指標（推薦）** |
| --- | --- | --- | --- |
| 審核隔離 | ❌ | ✅ | ✅ |
| 舊 approved 檔的去向 | — | ⚠️ 欄位被覆寫 → 磁碟檔失去 DB 參照，成為 orphan | ✅ 列保留、標 `superseded`，可稽核可回收 |
| Orphan 追蹤（§8） | ❌ 需掃磁碟 | ❌ 需掃磁碟 | ✅ 一句 SQL |
| 審核稽核（誰上傳、何時核准） | ❌ | ⚠️ 只有最後一次 | ✅ 每次上傳一列 |
| 未來版本化 | ❌ | ⚠️ | ✅ 已具備 |
| 成本 | 0 | 1 migration | 1 migration（一表 + 兩 FK 欄） |

**推薦：C。** B 看似更小，但它無法回答「上一個 approved 檔在哪、能不能刪」——
而 §8 明確要求「只要有合法 buyer entitlement 就不得任意實體刪除」。沒有那一列，
你只能在磁碟上留下無主檔案，或冒著刪掉買家還在用的檔案的風險。

### 5.3 建議 schema（**本輪不執行**）

```sql
CREATE TABLE material_files (
  id             TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  material_id    TEXT REFERENCES materials(id) ON DELETE CASCADE,   -- 上傳當下可為 NULL（未附加）
  storage_key    TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     BIGINT NOT NULL,
  checksum_sha256 TEXT,                    -- 建議 MVP 就寫入，成本極低（見 §5.5）
  status         TEXT NOT NULL,            -- unattached | candidate | approved | superseded
  uploaded_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_at    TIMESTAMP,
  approved_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT material_files_status_check
    CHECK (status IN ('unattached','candidate','approved','superseded'))
);

ALTER TABLE materials
  ADD COLUMN approved_file_id TEXT REFERENCES material_files(id) ON DELETE SET NULL,
  ADD COLUMN pending_file_id  TEXT REFERENCES material_files(id) ON DELETE SET NULL;

-- 一份教材最多只有一個 approved、一個 candidate
CREATE UNIQUE INDEX uq_material_files_one_approved
  ON material_files(material_id) WHERE status = 'approved';
CREATE UNIQUE INDEX uq_material_files_one_candidate
  ON material_files(material_id) WHERE status = 'candidate';
```

`materials.file_key` **保留不動**（`NOT NULL`，6 個測試 fixture 依賴它），
正式重新定義為 **legacy placeholder，不得再被任何新程式碼讀取**（§11）。

### 5.4 兩個指標的語意

| 欄位 | 意義 | 誰讀得到 |
| --- | --- | --- |
| `approved_file_id` | **買家會下載到的檔案**。只有 Admin 核准才會指向新檔 | Buyer（經授權後）、Admin |
| `pending_file_id` | 待審候選檔。從未交付給任何買家 | **只有 Admin 與該教材的 Creator** |

### 5.5 Metadata 取捨

| 欄位 | 存 DB？ | 理由 |
| --- | --- | --- |
| `storage_key` | ✅ | 唯一定位；不得外流 |
| `original_filename` | ✅ | `Content-Disposition` 與 UI 顯示需要；storage 不保存它 |
| `mime_type` | ✅ | 交付時的 `Content-Type`；不能在下載時才猜 |
| `size_bytes` | ✅ | UI 顯示、`Content-Length`、配額判斷；雖然 storage 也查得到，但列表頁不該為了顯示大小去打儲存後端 |
| `uploaded_at` / `uploaded_by` | ✅ | 審核與稽核 |
| `approved_at` / `approved_by` | ✅ | 「這個檔案是誰核准的」是人工審核平台的基本要求 |
| `checksum_sha256` | ✅ 建議 MVP | 成本是上傳時的一次 hash；換來 ①偵測 DB/儲存不一致 ②證明「Admin 審的就是買家拿到的那一份」。沒有它，§10 的一致性檢查只能比大小 |
| 頁數 / 縮圖 / 解析度 | ❌ Future | 需要解析檔案內容，MVP 沒有需求 |

---

## 6. 交付架構（Delivery）

### 6.1 MVP：授權 → 一次性 token → backend streaming

```text
1) GET /download/:materialId            （既有端點，契約不變）
   Authorization: Bearer <jwt>
   → 授權檢查（§7）
   → 產生一次性 download token（TTL 5 分鐘、單次使用、綁 userId + fileId）
   → 200 { materialId, signedUrl, expiresInSeconds: 300 }

2) 瀏覽器 top-level navigation 到 signedUrl
   GET <PUBLIC_BACKEND_URL>/download/file/<token>
   → 驗證 token（未過期、未使用過、與請求者一致或本身即憑證）
   → storage.openReadStream(storageKey).pipe(res)
   → Content-Type / Content-Length / Content-Disposition / X-Content-Type-Options
```

**為什麼不是「backend 直接 stream 回 `/download/:materialId`」**：前端所有 API 都走
`/api/backend/[...path]` proxy，而該 proxy 用 `await upstream.text()` 讀取回應（§2.4）——
二進位會損毀、`Content-Disposition` 會消失。改寫 proxy 為串流是可行的替代方案，
但一次性 URL **同時**解決了「未來換成 S3/R2 presigned URL 時業務 API 不必改」，
而且**現有的回應形狀（`{ signedUrl, expiresInSeconds }`）與前端 `window.open` 都已經是這個模型**。

**Token 設計**：隨機 32 bytes（不含個資）、存 DB 或記憶體 TTL 表、單次使用、
只授權「這一個 file id」。它出現在 URL 中，因此**必須短命且單次**（access log 洩漏也無法重放）。

### 6.2 未來：object storage

`createSignedUrl` 存在時，`GET /download/:materialId` 直接回傳雲端 presigned URL，
`/download/file/:token` 端點自然退場。**業務 API 與前端完全不變。**

---

## 7. 授權模型

### 7.1 Buyer entitlement（canonical）

```text
可下載 iff
  已登入
  AND 存在一筆 orders.user_id = <me> AND orders.status = 'approved'
  AND 該訂單的 order_items 含這份 material
  AND 該 order_item 的 entitlement_status = 'active'
```

### 7.1a 「履約當時版本」與「目前可下載版本」是**兩個概念**

**2026-08-26 新增**（`P1-09` Gate 7 / `PRE-04.1`）。

| 概念 | 欄位／來源 | 性質 |
| --- | --- | --- |
| **履約當時版本** | `order_items.fulfilled_material_version_id` ＋ `fulfilled_at` | **歷史事實，永不改寫** |
| **目前可下載版本** | `materials.approved_file_id`（下載路徑動態解析） | 依 `PRE-04` 更新政策決定 |

**寫入時點：** 付款核准的**同一個 transaction**內
（`orderService.recordFulfillmentSnapshot`，由 `routes/admin.js` 的憑證核准流程呼叫）。
買家的下載授權正是在那一刻成立，兩者必須原子完成 ——
分開寫會出現「有授權但不知道交付了什麼」的中間狀態。

**三個守衛：**

1. **教材沒有 `approved_file_id` 時不寫入。** legacy「`published` 但無檔」的教材確實存在；
   猜一個版本等於**製造假的履約證據**。未知就是未知。
2. **只寫一次。** 已有快照的品項不得被覆寫 —— Creator 後續換版**不會**改動歷史履約事實。
3. **逐品項各自解析。** 一張訂單多個品項時，各自對應各自教材當下的版本。

**歷史訂單一律保持 NULL，不 backfill** —— 當時交付了哪個版本是未知的，
以教材**目前**的 `approved_file_id` 假裝，就是偽造履約紀錄。

> **下載路徑目前仍動態解析最新 `approved_file_id`，本輪刻意未改。**
> 「Buyer 是否有權取得履約當時版本、平台是否可以只提供最新版」
> 屬 `PRE-04.7` 與 External Legal Gate **`L-10`，待律師確認** ——
> 那是政策決定，不由工程自行選擇。
> 但**「當初交付了什麼」必須先被記下來**，否則日後無論政策怎麼定都無從還原。

---

**`order_items.entitlement_status` 是與 `orders.status` 正交的維度**
（2026-08-26 新增，`P1-09` Gate 14 foundation）。
撤銷「單一買家對單一教材」的存取一律走這個欄位，
**不得**以改動 `orders.status` 為之 —— 那會污染訂單狀態機、對帳與稽核軌跡。

| 值 | 意義 |
| --- | --- |
| `active` | 正常，可交付（**所有既有列的預設值**） |
| `suspended` | 暫停交付，可恢復 |
| `revoked_pending` | 因退款／解除／法律流程暫停，仍可能恢復或需稽核 |
| `revoked_final` | 流程已完結，平台確定不再恢復 |

`revoke` 的語意是「**暫停未來交付**」，**不是刪除 entitlement 記錄**
（稽核與爭議舉證仍需要它），也**不代表**其指向的教材檔案即可回收（見 §8）。

### 7.1b 寫入端與 consumer 對齊（2026-08-26 Wave 2 #2）

**寫入端已建立：** `services/entitlement.service.js` ＋
`POST /admin/order-items/:id/entitlement`。合法轉移：

```text
active          → suspended | revoked_pending
suspended       → active    | revoked_pending
revoked_pending → active    | revoked_final
revoked_final   → （終態，沒有出口）
```

`reason` **必填** —— 這是會影響買家已付費權利的動作，沒有理由的變更在爭議中無法解釋。
恢復為 `active` 時**保留** `access_suspended_*`（稽核軌跡）。
歷程走既有的 `activity_logs`（`target_type = 'order_item'`，
`action = 'entitlement.status_changed'`），**不另建 event table**。

**三個「回答『現在是否有有效使用權』」的 consumer 已全數對齊：**

| Consumer | 對齊方式 |
| --- | --- |
| `materialFile.hasPurchaseEntitlement` | 要求 `entitlement_status = 'active'`（下載被拒） |
| `GET /me/materials` | **不過濾**，改為回傳 `entitlementActive` 旗標 —— 授權暫停不代表購買事實消失，讓教材從列表無聲蒸發會讓買家失去「我買過這個」的可見性。真正的門在下載授權 |
| `review.repository.hasApprovedOrderForMaterial` | 要求 `active` —— 發表評價是**產生對外公開且不可逆內容**的新寫入；**只擋新評價，既有評價不受影響** |

**刻意未對齊（B 類：營收／交易歷史）：**
`teacherSales`、`adminDashboard`、`adminTrends`、`adminOrders`、`buyerOrders`。
**「曾經買過」與「現在有有效授權」是兩件事** —— 授權撤銷不得讓已認列的營收或
創作者成交紀錄消失。

> **狀態變更不刪除任何東西**：`order_items` 那一列仍在、
> `fulfilled_material_version_id` 不動、`material_files` 不動
> （另有 `ON DELETE RESTRICT` 保護）。
> cleanup eligibility 屬 `K7`，本輪未處理。

`orders.status = 'approved'` 是 canonical 的付款完成狀態（`docs/mvp_rules.md` §11：
`approved` = admin 核准了該訂單的 pending 憑證；`paid` 是 dead value，bootstrap 會 normalize）。
**這正是現有 `download.js` 的條件，不需要改。**

### 7.2 `materials.status` **不得**進入 buyer 授權條件

marketplace 上架狀態 ≠ 已購買的使用權。現有程式碼已經正確（授權 SQL 沒有 join `materials.status`），
本規格把它升格為**不可回歸的規則**並要求測試鎖住。

### 7.3 各情境的正式結論

| 情境 | Buyer 可否下載 | 依據 |
| --- | --- | --- |
| `published` | ✅ | 正常 |
| `unpublished`（檢舉下架） | ✅ **仍可下載** | 已付費的使用權不因下架消失；下架只代表「不能再賣給新買家」 |
| `pending_review` / `changes_requested` | 理論上不存在合法買家（從未公開）；若存在（例如曾 published 過再被退回—— 目前 workflow 不會發生），仍以 entitlement 為準 | 同上 |
| Creator 帳號停用／刪除 | ✅ | `materials.teacher_id` 是 `ON DELETE SET NULL`；entitlement 綁 order，與 creator 無關 |
| 檔案被平台撤下（malware / 侵權） | ❌ 應可阻擋 | 見 §12 revocation |

### 7.4 Admin 存取

Admin 對**所有狀態**的教材檔案都必須能取得（`pending_review` / `changes_requested` /
`published` / `unpublished`）—— 審核、檢舉調查、客訴都需要。Admin 讀的是
`pending_file_id`（審核中）或 `approved_file_id`（已上架）。Admin 下載走**獨立端點**
（`GET /admin/materials/:id/file?slot=pending|approved`），**不共用 buyer 的一次性 token**，
且必寫稽核（§9）。

---

## 8. 生命週期與一致性

### 8.1 上傳時機（Upload Timing）

**推薦：A — 選檔後立即上傳，回傳 `fileId`，建立教材時帶上。**

- B（整份表單 multipart）會讓 100MB 的檔案與表單驗證失敗綁在一起：欄位打錯就要重傳整個檔案。
- C（先建 draft）需要 `draft` 狀態，而 repo 明確**沒有** draft workflow
  （`docs/material-review-workflow.md` §11 已記載幽靈 draft 已移除）—— 為了上傳引入 draft 是本末倒置。

### 8.2 Orphan 檔案（§15 的最小解法）

上傳成功即寫入一列 `material_files`，`status = 'unattached'`、`material_id = NULL`、
`uploaded_by = <creator>`。因此**每一個磁碟物件都有 DB 列**，清理只是：

```sql
SELECT storage_key FROM material_files
WHERE status = 'unattached' AND uploaded_at < NOW() - INTERVAL '24 hours';
```

- 附加到教材時（create/resubmit）→ `status = 'candidate'`、寫入 `material_id`。
- MVP 提供 `npm run cleanup:orphan-files --prefix Backend` 維運指令（手動或 cron），
  **不需要背景 job 框架**。

> **2026-08-26 起，上面那句 SQL 只是「候選清單」，不是刪除資格。**
> 每一個候選都必須再通過 §8.6 的 `canPhysicallyDeleteMaterialFile()` 才會被刪。
> 在此之前它同時是資格判斷 —— 那是一個 fail-open 的形狀（見 §8.6）。

### 8.3 Replace / Resubmit 的 transaction 語意

檔案系統與 PostgreSQL 無法同一個 ACID transaction，因此定義**順序 + 補償**：

| 情境 | 規則 |
| --- | --- |
| 新檔上傳失敗 | 舊檔完全不動（尚未有任何 DB 變更） |
| 新檔上傳成功、DB 附加失敗 | 新檔留在 `unattached`，由 §8.2 的 TTL 清掉；**舊檔不動** |
| 附加成功 | `pending_file_id` 指向新 candidate；舊 candidate（若有）改 `superseded` |
| Admin 核准 | **單一 DB transaction**：`status → published`、舊 approved 列 → `superseded`、新 candidate → `approved`、`approved_file_id` 換指標、`pending_file_id = NULL` |
| 實體刪除 | **不在請求路徑上做**。只有 `superseded` 且無任何 entitlement 依賴的列，才由維運指令回收（§8.5）。**2026-08-26 起另有 DB 層防線**：`order_items.fulfilled_material_version_id` 以 `ON DELETE RESTRICT` 參照 `material_files(id)` —— 只要還有訂單品項記錄「當初交付的是這個版本」，該列**在資料庫層就刪不掉**。要停止提供某版本，正確做法是把 `status` 設為 `revoked`，不是刪列 |
| DB 指向不存在的檔 | 下載時 `storage.stat()` 失敗 → 回 **503 + 明確訊息**，寫稽核 `download.denied`（reason `file_missing`），**不得**回 500 或空檔 |

### 8.4 「核准」必須是一個 service transaction boundary

`pending_review → published` 與 file promotion **必須在同一個 DB transaction**
（兩者都是 DB 操作 —— 檔案本身不需要移動，只是指標換位）。
這是選擇「兩個指標 + 不搬檔」而不是「把檔案搬到 approved 目錄」的關鍵理由：
**promotion 是純 DB 操作，因此可以是原子的。**

### 8.5 刪除政策

| 情境 | 政策 |
| --- | --- |
| Creator 換掉 candidate | 舊 candidate → `superseded`；不實體刪除（審核歷程可能需要） |
| 核准後的舊 approved | → `superseded`；**只要曾經有 approved 訂單含這份教材，永不實體刪除**（買家的歷史憑據） |
| 教材被下架 | 檔案完全不動 |
| `unattached` 逾時 | ✅ 可實體刪除 |
| 平台撤下（malware） | 標 `revoked`（§12），**不刪除**，保留證據 |

---

### 8.6 實體刪除的安全判斷（Legal Hold ＋ fail-closed cleanup）

> **2026-08-26（P1-09 Gate 14 / Wave 2 #4）新增。**
> 這一節描述的是**下限**，不是保存年限。4 個月、5 年、稅務年限屬
> `RETENTION-MATRIX` 與 External Legal / Tax Gate（皆 `PENDING`），本節不決定任何期限。

#### 修正之前的兩個 fail-open

1. **資格判斷不看任何依賴。** `cleanupOrphans()` 只問
   `status = 'unattached' AND uploaded_at < NOW() - Nh` ——
   §8.5 那句「只要曾經有 approved 訂單含這份教材，永不實體刪除」
   **沒有任何程式碼在執行它**。
2. **刪除順序讓 DB 防線失效。** 舊版先 `storage.delete()` 再
   `DELETE FROM material_files`，因此 `order_items.fulfilled_material_version_id`
   的 `ON DELETE RESTRICT` **只保護得了 DB 列**：列刪不掉時位元組已經沒了，
   而且救不回來。per-row `try/catch` 又把錯誤吞成「這筆失敗」。

#### 單一 predicate

**所有**實體刪除路徑都必須呼叫
`services/materialFileRetention.service.js` 的 `canPhysicallyDeleteMaterialFile(fileId)`，
**不得自行拼資格條件** —— 多支腳本各自判斷等於讓「可以刪嗎」有多個會不同步的答案。
`--dry-run` 走的也是同一個 predicate。

只有全部條件都被**明確確認安全**時才回 `true`。以下任一即 `false`：

| 阻擋理由 | 說明 |
| --- | --- |
| `file_not_found` | 查不到就是不知道 |
| `dependency_lookup_failed` | **查詢失敗不得被當成「沒有依賴」** |
| `legal_hold` | `material_files.legal_hold = TRUE` |
| `status_not_reclaimable` | 目前只有 `unattached` 可能回收；`superseded` / `revoked` 的回收待保存年限定案 |
| `referenced_by_material_pointer` | 仍是 `approved_file_id` 或 `pending_file_id` |
| `restorable_entitlement_dependency` | 該教材仍有 `active` / `suspended` / `revoked_pending` 的已核准訂單品項 |
| `fulfillment_snapshot_dependency` | 有 `order_items.fulfilled_material_version_id` 指向它（**與授權狀態無關**） |
| `outstanding_download_token` | 已發出、未使用、未過期的下載票 |

#### `revoked_final` ≠ 可以刪

**授權終止與位元組保存是兩個不同的 lifecycle。**
`revoked_final` 只表示「這個買家不再能下載」，不表示「平台不再需要保存當初交付的東西」。
它**只移除**「可恢復的授權依賴」這一個 blocker；
履約快照、legal hold、指標引用等其他 blocker 一概照舊。

反向亦然：**檔案可回收不代表可以刪掉授權歷史。**
`order_items` 的授權紀錄與 `material_files` 的位元組不得互相推導對方的保存決定。

#### 刪除順序（fail-closed）

```text
BEGIN
  SELECT ... FOR UPDATE          -- 鎖住該列
  重新跑 predicate                -- 掃描與刪除之間的空窗是真實的
  DELETE FROM material_files      -- 所有 FK（含 RESTRICT）在此引爆，位元組還在
  storage.delete(key)             -- 只有列刪成功才會走到這裡
COMMIT
```

任何一步失敗 → `ROLLBACK`，列與實體同時留著。
最壞情況從「檔案永久消失」變成「檔案還在」。

#### Legal hold

Admin only：`POST /admin/material-files/:id/legal-hold`、
`/release-legal-hold`、`GET /admin/material-files/:id/retention`（含完整阻擋理由）。
`reason` 必填；解除**不清空** `hold_reason` / `hold_set_at` / `hold_set_by`（稽核軌跡）。

**本輪只提供 primitive，不做 orchestration** —— 不假設每一筆
`refund_remedy_cases` 或 `report_cases` 都需要 hold，那是尚未做出的產品與法律判斷。

#### 稽核（沿用 `activity_logs`，`target_type = 'material_file'`）

`material_file.legal_hold_set`｜`material_file.legal_hold_released`｜
`material_file.cleanup_skipped_due_to_hold`｜
`material_file.cleanup_skipped_due_to_dependency`｜`material_file.physically_deleted`

#### 尚未完成

`superseded` / `revoked` 的回收路徑**尚未開放**（待保存年限定案）。
本輪只有孤兒 `unattached` 會被實際刪除。

## 9. Security Invariants（不可被破壞）

1. **教材本體永遠不得經由 `express.static` 對外提供。**
   私有儲存根目錄必須在 `Backend/uploads/` 之外（建議 `Backend/private-storage/`）。
2. **Buyer 下載必須通過 entitlement 檢查**（§7.1），不得有任何「知道 URL 就能拿」的路徑。
3. **storage key 不得外流**：任何 Buyer / 公開 API 回應都不得包含 `storage_key`
   （含 `GET /materials/:id` —— 目前它會回傳 `file_key`，實作時必須一併移除／改為不外流）。
4. **client 不得指定 storage key 或檔名路徑**；key 一律 backend 產生的 UUID。
5. **未經 Admin 核准的檔案永遠不會成為 buyer 的下載目標**（`approved_file_id` 只能由核准流程寫入）。
6. **`published` 教材的交付檔案不得被 Creator 直接替換**（§10）。
7. **下載回應必須帶 `X-Content-Type-Options: nosniff`**，且 `Content-Type` 取自 DB 記錄的
   `mime_type`（不是使用者提供的、也不是副檔名猜的）。
8. **檔名一律經過 RFC 5987 編碼**輸出（中文檔名），且移除 CR/LF（header injection）。

---

## 10. `published` 教材的檔案更新（§17 / §25 的正式結論）

目前狀態機**沒有** `published → pending_review` 的路徑（`materialWorkflow.js`），
因此「已上架教材要換交付檔」在 MVP **沒有合法流程**。正式規則：

- **MVP：`published` 狀態下，替換教材本體一律拒絕（400）。** metadata 仍可編輯。
- 資料模型（`pending_file_id`）**已經預留**了「Buyer continue on v1 / Admin reviews v2」的能力；
  等「教材更新審核」workflow 決定後即可啟用，**不需要再改 schema**。
- 這也堵住現有的 `updateMaterialHandler` 漏洞：實作時 `file` 相關欄位必須完全移出該端點。

---

## 11. Legacy `file_key` 策略

**已採用：A（保留欄位、標記 legacy、不 backfill、不 migration）。**

- 保留 `materials.file_key`，migration **完全不碰它**（不刪除、不改型別、不改 nullability）。
  DB 測試 fixture 仍在寫它。
  > 實作時的實測更正：DB 層這個欄位**本來就是 nullable**，`NOT NULL` 只存在於舊的應用層
  > 驗證（`validatePayload` 要求非空字串）。因此新建教材 `file_key` 為 `NULL` 是合法狀態，
  > 不需要為了相容而編一個假值。`db/db_schema.sql` 已同步更正。
- 正式定義為 **legacy placeholder**：新程式碼**不讀取**它決定任何行為，
  且已從 `MATERIAL_COLUMNS`（公開／買家 API 投影）中移除。
- **既有 published 教材沒有真檔案** → `GET /download/:materialId` 對
  `approved_file_id IS NULL` 的教材回 **409 `material_file_unavailable`** ＋
  「此教材目前尚未提供可下載檔案。」，並寫 `download.denied`（meta 帶 reason）。
  **不回 500、不回假 URL、不洩漏檔案系統路徑。**
  > 舊實作在這條路徑上只有 403，於是已付款的買家會看到「你沒有權限」——
  > 那是錯的診斷，會把使用者導向完全無用的自助排除。
- Creator 重新上傳即可補齊；**不做 migration queue**。
- 首次核准（教材還沒有 `approved_file_id`）**必須**要有 `pending_file_id`，
  否則回 409 `candidate_required` —— 不會上架一份買家下載不到東西的商品。
  已經有已核准檔的教材再次核准時不強制帶新候選檔（例如只改了文案），此時保留原檔。

---

## 12. 檔案撤銷（Revocation）

極端案例（malware / 嚴重侵權 / 違法內容）需要「即使已購買也停止交付」。

**MVP：在 `material_files.status` 增加 `revoked`** —— 一個值，不是一套 trust & safety 系統。
下載時若目標檔案 `status = 'revoked'` → 403 + 明確訊息，寫 `download.denied`（reason `revoked`）。
**誰能撤銷、要不要退款、要不要通知買家**屬 Future 的產品決策，MVP 只保留「能停止交付」的能力。

---

## 13. 檔案型別、大小與驗證

### 13.1 MVP allowlist（教材本體）

| 副檔名 | MIME | 允許 | 理由 |
| --- | --- | --- | --- |
| `.pdf` | `application/pdf` | ✅ | 教材主力格式；magic byte `%PDF-` 穩定；未來可 inline preview |
| `.zip` | `application/zip`（含 `application/x-zip-compressed`） | ✅ | 圖卡／練習單整包交付的實際需求（`material_features` 有「圖卡教材」「練習單」）；magic `PK\x03\x04` |
| `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | ✅ | 教案簡報常見；OOXML（zip 容器），無巨集 |
| `.docx` | `…wordprocessingml.document` | ✅ | 學習單常見 |
| `.xlsx` | `…spreadsheetml.sheet` | ✅ | 較少見但成本為零 |
| `.doc` / `.xls` / `.ppt` | `application/msword` 等 | ❌ | 舊版二進位格式可挾帶巨集，且解析器歷史漏洞多 |
| `.docm` / `.pptm` / `.xlsm` | — | ❌ | 巨集格式 |
| `.jpg` / `.png` | `image/*` | ❌（作為**教材本體**） | 單張圖不構成教材；圖片走既有的 media 上傳；要多張請打包 ZIP |
| `.exe` / `.js` / `.html` / `.svg` / 其他 | — | ❌ | 可執行或可挾帶 script |

### 13.2 驗證強度

**MVP 採「3. extension + declared MIME + magic-byte」**，理由：
allowlist 內所有型別的簽章都固定（`%PDF-`、`PK\x03\x04`），成本是讀前 8 bytes，
但能擋掉「把 `.exe` 改名成 `.pdf`」這個最常見的手法。
只靠 extension（1）或 declared MIME（2）等於沒有驗證 —— 兩者都由 client 提供。
**Antivirus（4）列為 Future**（需要外部服務或 ClamAV daemon，屬部署決策）。

補充：OOXML 與 ZIP 的 magic byte 相同（都是 `PK`），因此 `.pptx`/`.docx`/`.xlsx`
只能驗到「是 zip 容器」；深入驗證 `[Content_Types].xml` 屬 Future。

### 13.3 大小上限

現有基準：圖片 10MB、示範影片 80MB、付款憑證 10MB×3。

**建議 `MAX_MATERIAL_FILE_BYTES = 100 MB`（單一上限，不分型別）。**

- 涵蓋含高解析圖的 PDF 教材與整包 ZIP；
- 與既有的 80MB 影片上限同量級，維運心智一致；
- 台灣一般上行頻寬下 100MB 約需數分鐘，再大會讓 timeout 與重傳成為主要問題；
- Node 單機 disk 與未來 object storage 的單次 PUT 都在舒適區。

分型別上限（PDF 50 / ZIP 100）**不建議 MVP 採用**：多一組規則、多一組錯誤訊息，
但擋不掉任何真實風險（zip bomb 靠解壓才會發作，而平台不解壓）。

> ⚠️ **Zip bomb**：平台**不解壓縮**任何上傳檔案，因此 zip bomb 對 server 無害；
> 風險轉移到買家端，屬 Future 的內容政策（可加「平台不掃描壓縮內容」的條款）。

---

## 14. API 契約（**已實作**）

| Method | Path | 角色 | 說明 |
| --- | --- | --- | --- |
| `POST` | `/teacher/uploads/material-file` | teacher | `multipart/form-data`，欄位 `file`。串流驗證型別／大小／magic bytes 並計算 SHA-256 → 存入私有儲存 → 建立 `unattached` 列。**201** `{ fileId, originalFilename, mimeType, sizeBytes }`。**不回傳 storage key** |
| `POST` | `/materials` | teacher | 必填 `fileId`（取代 `file_key` 的角色）。建立教材與認領檔案在**同一個 transaction** |
| `POST` | `/materials/:id/file` | teacher（owner） | 更換候選檔。僅 `changes_requested` / `unpublished` 可用，其餘 409 `file_replacement_not_allowed` |
| `POST` | `/materials/:id/resubmit` | teacher（owner） | 既有端點，**不接受檔案欄位**。換檔與送審是兩個明確的動作 |
| `PUT/PATCH` | `/materials/:id` | teacher/admin | **不接受任何檔案欄位**（`fileId` / `file_key` / `pending_file_id` / `approved_file_id` 皆 400 `file_not_updatable_here`），與 `status` 同一規則 |
| `GET` | `/admin/materials/:id/file` | admin | `?slot=pending\|approved`（預設 pending，無則 approved）。串流下載，寫稽核 |
| `GET` | `/download/:materialId` | buyer | 授權並發一次性下載票：`{ materialId, signedUrl, expiresInSeconds, filename, sizeBytes }` |
| `GET` | `/download/file/:token` | 憑 token | **無 `requireAuth`**（瀏覽器導航帶不了 header）。一次性、5 分鐘 TTL、綁定 userId + materialId + fileId |

沿用 repo 既有命名慣例：creator 上傳掛在既有的 `/teacher/uploads/*`
（與 `material-media` 並列）、admin 端在 `/admin/*`、buyer 下載維持 `/download/*`。

### 14.0 與規格草案的兩處差異

草案寫 `POST /teacher/material-files`，實作改成 `POST /teacher/uploads/material-file` ——
與既有的 `/teacher/uploads/material-media` 放在同一個前綴底下，兩種上傳在路由檔與
心智模型上都相鄰。

換檔也從「resubmit 順便帶 fileId」改成獨立的 `POST /materials/:id/file`：
「換掉買家會拿到的東西」與「請 Admin 再看一次」是兩個不同的意圖，
綁在一起會讓創作者按下「重新送審」時不確定自己到底送了什麼。

### 14.0.1 錯誤碼 → HTTP status

對照表集中在 `Backend/services/materialFile.service.js` 的 `ERROR_STATUS`，route 不自己猜：

| Code | Status | 意義 |
| --- | --- | --- |
| `unsupported_file_type` / `blocked_file_type` / `mime_mismatch` / `signature_mismatch` | 415 | 檔案本身不合格（換一個檔就能解決） |
| `file_too_large` | 413 | 超過 `MAX_MATERIAL_FILE_BYTES` |
| `file_not_available` | 400 | fileId 不屬於你，或已經被認領過 |
| `file_replacement_not_allowed` | 409 | 這個狀態不能換檔 |
| `candidate_required` | 409 | 核准時沒有可上架的教材檔案 |
| `not_entitled` | 403 | 尚未購買或訂單未核准 |
| `material_file_unavailable` | 409 | 已購買，但這份教材沒有可下載的檔案（含 legacy 教材） |
| `download_token_invalid` | 404 | 票無效／已使用／已過期（三者刻意不區分） |
| `file_object_missing` | 503 | 資料是對的，儲存後端取不到實體檔案 |

未登記的 code 一律回 **500** 而不是 400：漏登記是伺服器的問題，
不該偽裝成使用者輸入錯誤安靜地過去。

### 14.1 下載回應標頭

```text
Content-Type: <material_files.mime_type>
Content-Length: <material_files.size_bytes>
Content-Disposition: attachment; filename="fallback.pdf"; filename*=UTF-8''%E6%95%99%E6%9D%90.pdf
X-Content-Type-Options: nosniff
Cache-Control: private, no-store
```

實作見 `Backend/utils/fileDownloadResponse.js`（Admin 審閱下載與買家下載共用同一份）。
ASCII fallback 由原始檔名把非 ASCII 字元換成 `_` 得到，並一併移除 `\r` `\n` `"` `\` `/`；
`filename*` 用 RFC 5987 百分比編碼原始檔名。

`Content-Length` 取自實際 stat 而非 DB 的 `size_bytes`：兩者不一致代表儲存後端出事，
而宣告一個對不上的長度會讓下載看起來成功、檔案其實是壞的。

---

## 15. 稽核事件

**沿用既有的**（`download.attempted` / `download.allowed` / `download.denied`）——
不要建立同義的 `material.file_downloaded`。`download.allowed` 的 `meta` 補上 `fileId`。

**新增（mutation only）：**

| Action | 何時 | meta |
| --- | --- | --- |
| `material.file_uploaded` | Creator 上傳（`target_type = material_file`）；換檔附加（`target_type = material`，meta 帶 `replacement: true`） | `{ fileId, originalFilename, mimeType, sizeBytes }`（換檔另帶 `materialStatus`、`replacement`） |
| `material.file_approved` | Admin 核准時 promotion | `{ fileId, supersededFileId?, originalFilename, sizeBytes }` |
| `admin.material_file_downloaded` | Admin 取得檔案審核 | `{ slot, fileId, originalFilename, sizeBytes }` |

三個事件的中文標籤在 `frontend/apps/web/lib/admin-labels.ts` 的 `ACTION_CATALOG`（`material` 群組）。

- **不新增** `material.file_replaced`：替換就是「上傳新 candidate」，`material.file_uploaded`
  帶 `replacement: true` 即可表達，不需要第二個 action。
- **兌換下載票時不寫第四個事件。** 授權事實已由 `download.allowed`（含 `fileId`）記錄；
  多開一個同義事件只會讓「下載了幾次」出現兩個都對又都不對的答案。
  票的兌換痕跡留在 `material_download_tokens.consumed_at`。
- Buyer 每次下載仍寫 `download.allowed` —— 那是既有行為且是稽核需求；
  若未來量體變大，屬 activity log retention 的獨立議題，不在本 milestone 解決。
- **Admin 的下載不計入任何 buyer 統計。**

---

## 16. 測試矩陣（規格）

**Upload**：允許型別通過｜封鎖型別 400｜副檔名與 magic byte 不符 400｜超過上限 400｜
空檔 400｜未登入 401｜非 teacher 403｜他人不得附加不屬於自己的 fileId 404。

**Admin review**：admin 可取 candidate｜admin 可取 approved｜四種教材狀態都可取｜
buyer 不得取 candidate（403/404）｜回應與列表都不含 storage key。

**Buyer**：approved 訂單可下載｜未付款不可｜他人訂單不可｜未登入 401｜
**教材 unpublished 但既有買家仍可下載**｜非買家不可｜token 過期不可｜token 重放不可。

**Replace / resubmit**：candidate 不影響 approved｜核准後 promotion｜
核准前 buyer 仍拿舊 approved｜替換失敗不動舊檔｜`published` 狀態換檔被拒。

**Security**：`../../etc/passwd` 檔名｜檔名含 CRLF｜偽造 MIME｜DB 指向不存在的檔（503 而非 500）｜
`GET /materials/:id` 不外流 storage key｜私有目錄不在 static 服務範圍。

---

## 17. 驗收情境

**A. 新教材**：上傳 A.pdf → 送審 → Admin 下載 A.pdf → 核准 → published →
Buyer 購買 → 付款核准 → Buyer 下載 **A.pdf**。

**B. 退回修改**：上傳 A.pdf → 送審 → Admin 下載 → 退回 → Creator 上傳 B.pdf（A 變 `superseded`）→
重新送審 → **Admin 只會看到 B.pdf 是 candidate** → 核准 → Buyer 下載 **B.pdf**。

**C. 已上架 + 更新（MVP 行為）**：published A.pdf → Buyer1 購買 →
Creator 嘗試替換為 B.pdf → **API 400（published 不得換檔）** → Buyer1 持續下載 A.pdf。
（未來「教材更新審核」上線後，此情境變成：candidate B 待審期間 Buyer1 仍拿 A，核准後才拿 B。）

**D. 檢舉下架後修復**：Buyer1 已購買 → 檢舉處置 `unpublish_material` → 新買家無法購買 →
**Buyer1 仍可下載 approved A.pdf** → Creator 上傳 B.pdf 為 candidate（approved 仍是 A）→
resubmit → Admin 審 B → 核准 → promotion（A → `superseded`，B → `approved`）→
Buyer1 之後下載 **B.pdf**（entitlement 綁教材，取得最新已核准版本）。

---

## 18. Scope

**P0（本 milestone 必做）**
storage abstraction + local private driver｜`material_files` 表與兩個指標｜Creator 上傳端點與 UI｜
`POST /materials` 改用 `fileId`｜`PUT/PATCH` 禁止檔案欄位｜Admin 審核下載｜Buyer 一次性 URL 下載｜
核准時的 file promotion（同一 transaction）｜magic-byte 驗證｜orphan 清理指令｜
legacy `file_key` 的 409 處理｜稽核事件｜測試矩陣。

**P1（上線後補）**
~~`/uploads/payment-proofs` 改為私有 + 授權交付~~ → **已於 2026-08-23 完成**，見 §23｜
`GET /materials/:id` 停止外流 `file_key`｜checksum 一致性巡檢指令｜下載失敗的使用者訊息細化。

**Future**
PDF inline preview｜antivirus / ClamAV｜object storage driver 與 presigned URL｜
resumable / multipart upload｜CDN｜版本歷史 UI｜教材更新審核 workflow｜
revocation 的完整 trust & safety 流程｜下載次數限制／浮水印。

---

## 19. `/uploads` 公開目錄的處置

**本 milestone 不搬動既有的公開媒體**（封面／細節圖／示範影片本來就該公開，
搬走會直接弄壞公開教材頁）。

- 教材本體：**從一開始就放在 `Backend/private-storage/material-files/`**，不進 `uploads/`。
- **付款憑證曾是既有的實質風險**：`Backend/uploads/payment-proofs/` 當時有 95 個檔案，
  內容是買家的匯款證明（姓名／金額／帳號末碼），**公開可讀**，只靠檔名亂數保護。
  它與教材本體是同一類問題，且共用同一個 storage adapter → 已於 **2026-08-23 完成搬移**（§23）。
- 目錄結構（現況）：
  ```text
  Backend/uploads/              ← static 仍掛著，但平台已不再寫任何東西進來
    material-media/             ← 空目錄；該路徑本身已被 404 handler 擋掉（SEC-02）
    payment-proofs/             ← 空目錄；該路徑本身已被 404 handler 擋掉（SEC-01）
  Backend/private-storage/      ← 永不經 static 服務
    material-files/
    payment-proofs/             ← 已完成遷移（SEC-01）
    material-media/             ← SEC-02；三種資產中唯一**條件公開**的
  ```

  > **§19 原本寫「本 milestone 不搬動既有的公開媒體」** —— 那句在教材本體那一輪是對的
  > （搬走會弄壞公開教材頁）。`SEC-02` 之後前提改變了：素材不是「搬去私有然後關掉」，
  > 而是**搬去私有再依教材 status 條件放行**，公開教材頁完全不受影響。見 §24。

---

## 20. 環境設定（已實作）

設定與 driver 選擇集中在 `Backend/config/privateFileStorage.js`
（`config/materialFileStorage.js` 現為相容轉出層）。

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `PRIVATE_FILE_STORAGE_DRIVER` | `local` | 目前只有 `local`；其他值**明確拒絕啟動**，不會靜默退回 local |
| `PRIVATE_FILE_STORAGE_PATH` | `Backend/private-storage` | 私有根目錄。**production 必填**（見下） |
| `PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION` | 未設定 | production 用 local driver 的**明確 opt-in** |
| `MAX_MATERIAL_FILE_BYTES` | `104857600`（100 MB） | 非正數即拒絕啟動 |
| `MAX_PAYMENT_PROOF_BYTES` | `10485760`（10 MB） | 單張付款憑證上限 |
| `MATERIAL_DOWNLOAD_TOKEN_TTL_SECONDS` | `300` | 下載票存活時間 |
| `PUBLIC_BACKEND_URL` | `http://localhost:<PORT>` | 組出 `signedUrl` 的主機（`Backend/utils/publicUrl.js`）。非本機部署必設 |

### 20.1 Production fail-closed

`NODE_ENV=production` + `driver=local` 時，**兩個條件缺一就啟動失敗**：
`PRIVATE_FILE_STORAGE_PATH` 必須明確指定，且
`PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true`。
三個變數各自都接受舊名 `MATERIAL_FILE_STORAGE_*` 作為別名；兩個都設且值不同時拒絕啟動。

理由與 `utils/jwt.js` 對 `JWT_SECRET` 的處理相同：教材本體是買家付費取得的商品，
如果 production 跑在 ephemeral filesystem 上（PaaS 容器重建），
local driver 會在下一次部署時把所有已售出的教材一起刪掉，**而且不會有任何錯誤訊息** ——
直到買家點下載才發現。寧可起不來，也不要在一個看起來正常、實際不安全的狀態下運行。

**同一組檢查涵蓋付款憑證**：兩種資產共用同一個 driver 與同一個 root，
因此不可能出現「教材檔案 fail closed、付款憑證默默寫進 ephemeral disk」。

`Backend/private-storage/` 已加入 `.gitignore`，且**不在** `express.static` 的服務範圍內
（`index.js` 只公開 `uploads/`）。

---

## 21. 實作產出（對照原訂順序，全部完成）

| # | 項目 | 落點 |
| --- | --- | --- |
| 1 | Storage 抽象 + Local private driver | `Backend/storage/materialFileStorage.js`、`Backend/config/materialFileStorage.js` |
| 2 | Schema migration | `Backend/migrations/20260823_material_file_storage.sql`、`models/bootstrapModel.js`、`db/db_schema.sql` |
| 3 | 上傳端點（型別／大小／magic bytes／串流 SHA-256） | `Backend/routes/teacherUpload.js`、`utils/materialFilePolicy.js` |
| 4 | `POST /materials` 改用 `fileId`；`PUT/PATCH` 禁止檔案欄位 | `Backend/routes/materials.js` |
| 5 | 核准時的 file promotion（與 status 同一 transaction） | `services/materialFile.service.js`、`services/materialReview.service.js` |
| 6 | Admin 審閱下載 + Review Panel 檔案區塊 | `routes/admin.js`、`components/admin/MaterialReviewPanel.tsx` |
| 7 | Buyer 下載票 + 二進位交付 | `routes/download.js`、`utils/fileDownloadResponse.js` |
| 8 | Creator UI（移除「檔案 Key」輸入框） | `components/teacher/MaterialFileField.tsx`、`lib/material-file.ts`、建立／編輯頁 |
| 9 | Legacy 409 訊息 + orphan 清理 | `services/materialFile.service.js`、`scripts/cleanup-material-files.js` |
| 10 | 測試 | `tests/materialFilePolicy.test.js`、`tests/materialFileStorage.test.js`、`tests/materialFile.db.test.js`、smoke、Postman、E2E |
| 11 | 文件同步 | 本檔、`material-review-workflow.md`、`mvp_rules.md`、spec v1.4、`swagger.js`、`local-development-and-operations.md`、`pending-work-tracker.md` |

### 21.1 順帶修掉的一個既有缺陷

`frontend/apps/web/app/api/backend/[...path]/route.ts` 原本用 `await upstream.text()`
讀取上游回應 —— 那等於把位元組當 UTF-8 解碼，任何二進位內容經過 proxy 都會被**靜默毀損**
（status 仍是 200，下載到的檔案打不開）。Admin 審閱下載會經過這支 proxy，因此一併改為
串流原樣轉發，並以 allowlist 轉發 `Content-Disposition` / `Content-Length` 等下載必需的 header。

買家下載**不經過 proxy**（`signedUrl` 直指 Backend），因為瀏覽器的下載導航帶不了
`Authorization` header —— 那條路徑靠一次性票授權。

---

## 22. 待決事項（需要產品／維運拍板）

> 這些**不阻擋** MVP 運作：目前的實作在每一項上都選了「安全但保守」的行為。

1. **部署平台**：決定 production 落在哪裡（VPS + 持久磁碟 vs PaaS ephemeral）。
   這唯一決定 local driver 能否用於 production，其餘設計都不受影響。
   **目前的行為**：production + local driver 在沒有明確 opt-in 時**直接啟動失敗**（§20.1），
   所以不會出現「上線了才發現檔案會消失」。
2. **教材更新審核 workflow**：`published` 教材要不要有合法的「換檔重審」路徑？
   （資料模型已預留，但狀態機需要新增轉移 —— 屬另一輪產品決策。）
3. **撤銷（revocation）的操作者與後續**：誰能撤銷、是否退款、是否通知買家。
4. **教材檔案是否允許多檔**（一份教材多個下載物）：目前假設單一交付檔；
   `material_files` 的結構可以擴充，但 UI 與 entitlement 語意需要另外決定。

---

## 23. 私有儲存的泛化：付款憑證共用同一層（2026-08-23）

付款憑證進來時面對一個選擇：把憑證硬塞進一個叫 material 的 abstraction，
或是為它 copy-paste 一份同樣的 filesystem code。兩個都不對 —— 前者讓命名說謊，
後者讓 path traversal 防線出現第二份實作，而兩份實作遲早會分歧。

因此採取第三種：**同一個 driver、同一個私有根目錄，以 namespace 分艙。**

```text
Backend/private-storage/
  material-files/<uuid>     教材本體（買家付費取得的商品）
  payment-proofs/<uuid>     付款憑證（敏感交易檔案）
```

### 23.1 共用什麼、不共用什麼

| 層 | 共用？ | 說明 |
| --- | --- | --- |
| filesystem primitives（`put` / `openReadStream` / `stat` / `delete`） | ✅ | `Backend/storage/privateFileStorage.js` 的 `LocalPrivateFileStorage` |
| storage key 產生與驗證（path traversal 防線） | ✅ | key 一律 `<namespace>/<uuid>`，平台產生，永不接受 caller 提供的路徑 |
| production fail-closed 設定 | ✅ | `Backend/config/privateFileStorage.js`，一組檢查涵蓋兩種資產 |
| HTTP 交付 header（`Content-Disposition` / `no-store` / `nosniff`） | ✅ | `Backend/utils/fileDownloadResponse.js`（憑證多用 `disposition: "inline"`） |
| **授權模型** | ❌ | **刻意不共用** |
| 型別／大小政策 | ❌ | 教材是文件容器（PDF/ZIP/OOXML），憑證只能是圖片 |
| 生命週期 | ❌ | 教材有 candidate → approved → superseded 與 orphan 清理；憑證沒有 upload-first，也不做自動實體刪除 |

**授權模型為什麼不能共用**：

```text
教材本體  買家的「購買授權」：已核准訂單 + order_items.entitlement_status = 'active'
          + materials.approved_file_id
          （綁教材而不是版本；不看 materials.status）

付款憑證  訂單的「擁有權」：orders.user_id
          （綁「這張憑證屬於這筆訂單」；不看 orders.status、不看 review_status）
```

把買家 entitlement 的模型套到憑證上會得出錯誤的結論 —— 例如「訂單還沒核准所以不能看」，
但買家本來就該看得到自己剛上傳的東西；或「教材下架了仍可下載」的類比套到憑證上毫無意義。

### 23.2 namespace 不得互穿

`isValidStorageKey(key, namespace)` 可以指定 namespace。教材的相容層
（`storage/materialFileStorage.js`）匯出的 `isValidStorageKey` **只認 `material-files/`**，
所以一個憑證的 key 不會是教材交付路徑的合法輸入，反之亦然。
測試見 `Backend/tests/privateFileStorage.test.js`。

### 23.3 公開／私有的正式分類

| 類別 | 內容 | 位置 | 對外 |
| --- | --- | --- | --- |
| **Conditionally public product media** | 封面、詳情圖、試看影片 | `Backend/private-storage/material-media/` | **條件公開**：所屬教材 `published` → 任何人（公開教材頁需要）；其餘 → 教材擁有者或 Admin |
| **Sensitive transaction file** | 付款憑證 | `Backend/private-storage/payment-proofs/` | 私有，僅 Admin 或訂單擁有者 |
| **Paid deliverable** | 教材本體 | `Backend/private-storage/material-files/` | 私有，僅購買授權或 Admin 審核 |

這條分類是規則，不是慣例：**新增任何檔案能力時必須先歸類**。
「它現在放哪裡比較方便」不是分類依據。

規格與授權矩陣見 `docs/mvp_rules.md` §12.4；
canonical source 是 `Backend/services/paymentProof.service.js` 與 `Backend/utils/paymentProofPolicy.js`。

---

## 24. 教材行銷素材的私有儲存與條件公開交付（`SEC-02`，已實作 2026-08-24）

### 24.1 root cause

三種檔案資產裡，行銷素材是**唯一沒有 metadata 記錄**的一種。
`cover_image_url` / `demo_video_url` / `material_images.image_url` 只是自由文字 URL 欄位，
檔案與教材之間沒有任何可查詢的關聯。因此交付時**無從判斷**「這張圖屬於哪份教材、
那份教材上架了沒」—— 只能整個目錄公開，或整個目錄關掉。

`express.static` 沒有「條件」這種東西。實務後果：

1. **下架撤不回素材。** 教材上架 → 封面 URL 被爬蟲／分享／快取記下 → 檢舉處置下架 →
   教材頁 403，但封面與試看影片**永久匿名可取**。若下架原因正是侵權或不當內容，
   平台等於仍在供應它。
2. **審核閘門不涵蓋位元組。** `pending_review` 教材的素材在 Admin 看第一眼之前就已公開。
3. **孤兒上傳永久公開**，且沒有任何清理機制。

保護只有「12 個 hex 的隨機檔名」，也就是 security by obscurity。

### 24.2 實作前的實測（2026-08-24，兩個資料庫唯讀）

```text
Backend/uploads/material-media/                      0 個檔案
cover / demo / detail 的 URL                         兩個 DB 皆 100% 外部連結
指向 /uploads/material-media/ 的資料列                0 筆
```

**因此沒有資料搬移腳本**（對照 `SEC-01` 要搬 95 個實體檔案與 108 筆 legacy 列）。
這是 prospective gap 而非 active leak：任何一次真實上傳都會立刻踩到它。

### 24.3 修法

| 層 | 內容 |
| --- | --- |
| Schema | 新表 `material_media_files`（`material_id` 可為 NULL = 未認領、`kind`、`storage_key` UNIQUE、`checksum_sha256`、`uploaded_by`、`claimed_at`）。migration：`Backend/migrations/20260824_material_media_private_storage.sql`；`bootstrapModel.js` 同步 |
| Storage | `storage/privateFileStorage.js` 新增 `material-media` namespace，與另外兩種資產共用同一個 driver 與 production fail-closed |
| Policy | `utils/materialMediaPolicy.js` —— `cover`/`detail` = 圖片、`demo` = 影片；三層驗證（副檔名 + 宣告 MIME + magic bytes） |
| Service | `services/materialMedia.service.js` —— 儲存、認領、授權、交付 |
| Upload | `POST /teacher/uploads/material-media` 改為 streaming 自訂 storage engine（影片 80 MB 不能緩衝進記憶體） |
| Claim | `POST /materials` 與 `PATCH /materials/:id` 內，與教材寫入**同一個 transaction** |
| Delivery | `GET /materials/media/:mediaId`，`optionalAuth`，支援 `Range` |
| 舊路徑 | `Backend/index.js` 在 static **之前**擋掉 `/uploads/material-media`（404 `material_media_not_public`） |
| Frontend | `lib/material-media.ts` + `components/materials/MediaImage.tsx`（授權 blob fetch）。**公開商品頁不使用它** —— 已上架素材匿名可取，普通 `<img src>` 才有瀏覽器快取 |

授權矩陣與不變條件的 canonical 位置是 `docs/mvp_rules.md` §3.1。

### 24.4 為什麼回傳 URL 而不是 id

教材本體回 `fileId`，素材回 `url`。差別不是疏忽：`cover_image_url` 等欄位的既有契約
就是 http(s) URL 字串，而且創作者**可以**改填外部 CDN 連結。改成回 id 會讓
「平台素材」與「外部連結」變成兩種不相容的欄位型別 —— 為了改儲存位置去動一個
跟安全無關的產品契約。URL 指向的是需要授權判斷的交付端點，不是 static 檔案。

### 24.5 已知限制（刻意，不是缺口）

- **買家看不到已下架教材的封面。** 買家不是擁有者也不是 Admin，`/downloads` 等頁面
  會退回底色。這是授權矩陣的直接結果；要不要為「已購買」開例外屬產品決策。
- **未認領素材沒有自動清理**（對照：教材本體有 `scripts/cleanup-material-files.js`）。
  它們對外不可見，只佔磁碟。
- **未上架教材的試看影片走 blob fetch**（`MediaLink`），會把整支影片載進記憶體
  （上限 80 MB）。只有 Admin 審核與創作者自己會走這條路；已上架影片是普通串流。
  要在不犧牲授權的前提下支援串流播放，需要一次性 view token（比照
  `material_download_tokens`），屬獨立的一輪工作。

三者皆已記錄於 `docs/pending-work-tracker.md`。

### 24.6 覆蓋

| 層 | 覆蓋 |
| --- | --- |
| unit | `tests/materialMediaPolicy.test.js`（15）—— kind×型別家族、三層驗證、改名的執行檔、RIFF 非 WebP、MP4 offset 4 |
| db | `tests/materialMedia.db.test.js`（24）—— 授權矩陣 4 狀態 × 5 身分、未認領、跨創作者認領、下架撤回與重新上架、Range、503、三條 DB 約束 |
| smoke | 上傳不洩漏 key、pending 時 401/403/200、上架後匿名 200 且 byte-identical、Range 206、舊路徑 404、跨創作者認領 400 |
| Postman | `02 Materials` 五支（上傳、approve 前後各一次交付、owner 讀取、舊路徑 404） |
| E2E | `tests/e2e/material-media-security.spec.ts`（16）—— 含**經檢舉處置真實下架**後的匿名撤回 |
