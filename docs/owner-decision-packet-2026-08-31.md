# Owner Decision Packet — 生產上線營運決策（2026-08-31）

> **本文件是 decision preparation，不是實作。** 本輪未修改任何 production code、schema、
> migration 或 legal wording，未選定任何供應商，未註冊任何服務，未部署，未設定 SMTP，
> 未搬移資料，未修改任何 legacy 訂單。
>
> Active backlog 的 source of truth 仍是 `docs/pending-work-tracker.md`（CLAUDE.md §11）。
> 本文件只提供三項 Owner 決策所需的證據與選項比較，**不自行維護 roadmap 或 priority**。

| 項目 | Branch | HEAD |
| --- | --- | --- |
| 產出基準 | `chore/rel-01-preservation-checkpoint` | `d5869ef` |

決策三項：

```text
PRE-01 — production deployment platform + persistent private storage
O-19   — production SMTP provider
OPS-01 — legacy pending_payment disposition
```

---

## 1. PRE-01 — 部署平台與持久化私有儲存

### 1.1 現況盤點（repo evidence）

**部署設定：完全不存在。** 本輪逐一確認 `Dockerfile`、`docker-compose.yml`、`Procfile`、
`vercel.json`、`render.yaml`、`fly.toml`、`railway.json`、`app.yaml`、`nixpacks.toml`、
`captain-definition`、`.github/` **全部 absent**。這與 `READINESS-02` 的 `R2-005` 一致。

**Runtime 需求**

| 元件 | 需求 | Evidence |
| --- | --- | --- |
| Backend | Node.js 長駐 process，單一 listen port | `Backend/index.js:161-169`（`ensureCoreTables()` → `app.listen`）；root `package.json` 的 `start: node Backend/index.js` |
| Frontend | **Node.js server runtime，無法 static export** | `app/api/backend/[...path]/route.ts`、`app/api/auth/{login,register}/route.ts` 為 route handler；`app/materials/[id]/page.tsx:9` 於 server 端讀 `API_BASE_URL` |
| PostgreSQL | 外部資料庫 | `Backend/config/db.js` |
| 私有檔案 | 一個持久化目錄 | `Backend/storage/privateFileStorage.js` |

**啟動時 fail-closed 的項目**（缺任何一項 backend 起不來）

| 條件 | 行為 | Evidence |
| --- | --- | --- |
| `JWT_SECRET` 缺／佔位／短於 32 字元 | throw | `Backend/utils/jwt.js:30,38,45` |
| DB 設定缺（`DATABASE_URL` 與 `PG*` 皆無） | throw | `config/db.js` |
| `NODE_ENV=production` ＋ local driver ＋ **無** `PRIVATE_FILE_STORAGE_PATH` | throw | `config/privateFileStorage.js:143-149` |
| `NODE_ENV=production` ＋ local driver ＋ 無 `PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION` | throw | `config/privateFileStorage.js:150-160` |
| `PRIVATE_FILE_STORAGE_DRIVER` 非 `local` | throw（**未實作**） | `config/privateFileStorage.js:132-137` |
| bootstrap schema 建立失敗 | exit 1 | `index.js:161`（`PRE-05` 已驗證） |

**刻意 fail-soft 的項目**（起得來，但功能不完整）

| 條件 | 行為 | Evidence |
| --- | --- | --- |
| 四個 `PAYMENT_BANK_*` 未設定 | 啟動正常；付款指示顯示「尚未設定」 | `config/paymentBankInfo.js:26`（註解明載刻意不 throw） |
| `SMTP_*` 未設定 | 啟動正常；**每次寄信於首次呼叫時 throw，由 `dispatchBestEffort` 接住並只寫 log** | `services/emailService.js:33-36`；`utils/bestEffortDispatch.js`（`REL-02`） |

### 1.2 Q1 — Backend 可以跑在 ephemeral filesystem 上嗎？

**技術上會「跑起來」，但那正是 repo 明文拒絕的組合。** `NODE_ENV=production` ＋ local driver
時必須同時提供持久化路徑與明示 opt-in，否則**拒絕啟動**。這道防線的理由寫在
`config/privateFileStorage.js` 的檔頭：ephemeral filesystem 會在下一次部署把
**已售出的教材**與**人工核帳的唯一證據**一起刪掉，且不會有任何錯誤 —— 直到買家點下載、
或爭議發生時 Admin 打開憑證才會發現。

**結論：不可以。** 除非同時交付 object storage driver（見 Option C）。

### 1.3 Q2 — 到底哪些東西必須跨部署／重啟保存？

**只有兩樣。** 本輪窮舉整個 Backend 的檔案系統寫入點，**只有兩處**，且都在
`LocalPrivateFileStorage` 內部（`storage/privateFileStorage.js:121` 的 `mkdirSync`
與 `:168` 的 `createWriteStream`）。沒有 log 落檔、沒有 temp 目錄依賴、
上傳一律不落地（付款憑證與申訴附件走 `multer.memoryStorage()`，教材本體走自訂 streaming engine）。

| 必須持久化 | 內容 | 目前規模（dev 實測） |
| --- | --- | --- |
| **PostgreSQL** | 全部業務資料 | 26 tables |
| **`private-storage/`** | 四個 namespace | **1,073 檔 / 5.7 MB** |

四個 namespace 的實測分佈：`material-files` 456 檔 / 648 KB、`payment-proofs` 390 檔 / 4.7 MB、
`material-media` 226 檔 / 345 KB、`complaint-evidence` 1 檔 / 5 KB。

**`Backend/uploads/` 不需要持久化** —— 本輪實測該目錄下 **0 個檔案**。它仍掛著
`express.static`，但兩輪 security 收斂後已無任何資產經由它提供（`index.js:67,85` 更把
`/uploads/payment-proofs` 與 `/uploads/material-media` 明確擋成 404）。

### 1.4 Q3 — 哪些私有檔案是安全敏感的？

**四類全部敏感，但敏感的理由不同，授權模型也不同**（`storage/privateFileStorage.js` 檔頭）：

| Namespace | 為什麼敏感 | 授權依據 |
| --- | --- | --- |
| `material-files` | 買家付費取得的商品；洩漏等於繞過付款取得商品 | entitlement：`orders.status='approved'` **且** `order_items.entitlement_status='active'`（`services/materialFile.service.js:428-430`） |
| `payment-proofs` | 買家的轉帳畫面（含金融資訊），也是人工核帳的唯一證據 | Admin **或**訂單擁有者（`orders.user_id`），不看 `orders.status` |
| `complaint-evidence` | 買家提交的外部申訴證據 | 申訴案件當事人／Admin |
| `material-media` | 唯一**條件公開**者；未上架／已下架教材的素材不得匿名可取 | 所屬教材的 `status` |

四者共用 filesystem primitives，**不共用授權**。交付一律經由 backend 串流
（`openReadStream` 的五個服務層呼叫點），沒有任何一條路徑把 storage key 交給瀏覽器。

### 1.5 Q4 / Q5 — 目前實際存在的 driver

| 部署形態 | 現況支援 | Evidence |
| --- | --- | --- |
| 本機 filesystem | ✅ 支援 | `LocalPrivateFileStorage`，預設 `Backend/private-storage` |
| **掛載持久化 volume** | ✅ **支援，零程式碼改動** | 設 `PRIVATE_FILE_STORAGE_PATH` 指向掛載點 ＋ `PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true` |
| **S3 / R2 / 物件儲存** | ❌ **完全未實作** | `PRIVATE_FILE_STORAGE_DRIVER` 非 `local` 直接 throw；`createSignedUrl` 在整個 repo **只出現在註解**（`storage/privateFileStorage.js:44-45`），無任何實作；`Backend/package.json` **無** `@aws-sdk`／`aws-sdk`／`minio` 依賴 |

> **必要揭露（依本輪指示）：本 repo 目前不支援物件儲存。** 抽象層預留了擴充點
> （`config/privateFileStorage.js:132` 的分支，以及 `createSignedUrl` 的探測慣例），
> 但那是**設計預留，不是實作**。任何以「換個 driver 就好」為前提的部署方案都不成立。

### 1.6 其他會影響平台選擇的實測事實

1. **Backend 必須是瀏覽器可直接連到的公開位址。** 教材行銷素材回的是**絕對 URL**
   （`services/materialMedia.service.js:90` 的 `mediaUrl()` ＝ `publicBaseUrl()` ＋ path），
   商品頁的 `<img src>` **由瀏覽器直接打 Backend，不經 Next 的 proxy**（同檔 :85-89 註解）。
   除此之外的所有 API 流量都走 server-side proxy（`app/api/backend/[...path]/route.ts`），
   因此**不需要 CORS**，但 backend 不能藏在只有 frontend 連得到的私網。
2. **絕對 URL 會被寫進資料列。** `cover_image_url`／`detail_images[].image_url`／
   `demo_video_url` 存的是含 host 的完整 URL。**production 主機名必須在第一筆素材上傳前定案** ——
   之後換 host 會讓既有素材的圖失效（`parseMediaId` 只比對 path，因此認領邏輯不受影響，
   但已存進資料列的字串仍帶舊 host）。這對「先用平台配發的臨時網域上線、之後再換自訂網域」
   的做法構成硬性限制。
3. **幾乎完全 stateless，但有一個例外。** 下載票證存在 DB（`material_download_tokens`），
   JWT 無 server 端 session。唯一的 process 內狀態是 `routes/order.js:27` 的
   `uploadIdempotencyCache = new Map()` —— 單一 instance 完全正確；水平擴充成多 instance 時
   該保護會失效（重複上傳保護退化）。**MVP 單 instance 不受影響**，但它與 volume 一樣
   構成「先不要水平擴充」的理由。
4. **Managed PostgreSQL 可直接使用。** `DATABASE_URL` 走 `pg-connection-string` 2.12.0，
   本輪實測 `?sslmode=require` 會被解析成 `ssl` 設定。**注意**：目前版本把
   `require` 視為 `verify-full`（實測時該套件自己印出 SECURITY WARNING），
   因此使用**自簽憑證**的資料庫需改用 `sslmode=no-verify`；由公開 CA 簽發的 managed 服務不受影響。
5. **Node 版本**：本專案實測環境為 Node v18.20.8（`REL-02` 輪次記錄）；Next 15 需 18.18 以上。

### 1.7 Q6 — 三個選項的工程成本

| Option | Platform model | Persistent storage | Code change | Ops complexity | MVP suitability | Key risk |
| --- | --- | --- | --- | --- | --- | --- |
| **A. PaaS ＋ 掛載 volume**（Backend 一個 service、Next 一個 service、managed PostgreSQL） | 受管容器 | 平台提供的 persistent volume 掛到 `PRIVATE_FILE_STORAGE_PATH` | **無**（只設環境變數） | **低** —— TLS／重啟／基礎監控由平台負責 | **高** | volume 通常綁單一 instance（不可水平擴充、部署期間可能短暫停機）；**volume 的備份多半要自己做** |
| **B. 單一 VPS／VM**（Backend ＋ Next ＋ 本機或 managed PostgreSQL，reverse proxy 處理 TLS） | 自管主機 | 主機磁碟即持久化 | **無** | **中～高** —— TLS、系統更新、備份、監控、重啟全部自理 | 中 | 營運負擔全落在 Owner；若無自動重啟機制，`REL-02` 的風險評級需重新檢視 |
| **C. Ephemeral／serverless ＋ 物件儲存** | 無狀態容器 | S3／R2 | **大量** —— 需新增 driver（`put`／`openReadStream`／`stat`／`delete`／`createSignedUrl`）、delivery 層分支、SDK 依賴、既有 1,073 檔搬移與 checksum 驗證，以及對應測試 | 低（跑起來之後） | **不適合 MVP** | 這是一整條未動工的 milestone，不是設定題；在它完成前選這條等於無法上線 |

> Option A 與 B 的差別只在**誰負責維運**，程式碼完全相同。兩者都直接滿足
> `config/privateFileStorage.js` 的 production 檢查。

### 1.8 建議

```text
Recommended MVP option:      A（PaaS ＋ 掛載持久化 volume ＋ managed PostgreSQL）
Recommended post-MVP option: C（物件儲存 driver ＋ createSignedUrl，屆時方可水平擴充）
Owner decision required:     選定平台；確認 volume 備份責任歸屬；
                             並在第一筆素材上傳前定案 production 主機名（見 §1.6.2）
```

理由：A 是**唯一零程式碼改動、且直接滿足既有 fail-closed 條件**的選項，把 TLS／重啟／
平台層維運交給供應商，讓 MVP 的工程成本集中在產品本身。B 只在 Owner 已經有主機與維運習慣時才划算。
C 的成本不是「設定」而是「一條未開工的 milestone」。

---

## 2. O-19 — Production SMTP 供應商

### 2.1 現況盤點

**架構：** `services/emailService.js` 以 **nodemailer 8.0.7** 建立單一 cached transporter：

```text
host   = SMTP_HOST          （缺 → throw）
port   = SMTP_PORT || 587
secure = (port === 465)     （587 走 STARTTLS）
auth   = { user: SMTP_USER, pass: SMTP_PASS }   （任一缺 → throw）
from   = SMTP_FROM || SMTP_USER
```

**這是完全通用的 SMTP 用法** —— 沒有任何供應商專屬 API、header、webhook 或 SDK。
`Backend/package.json` 的相關相依只有 `nodemailer`。

**寄件人身分：** `SMTP_FROM || SMTP_USER`。repo 內**不存在**任何 support／privacy／legal
信箱或營業地址（`review-handoff.md` 已於 :167-169 盤點）。

**失敗處理（`REL-02` 之後）：** 六個呼叫點全部經 `dispatchBestEffort(() => ...)`；
`sendEmailWithLog()` 成功時寫 `activity_logs` 的 `order_email_sent`、失敗時寫 `order_email_failed`
（含 `meta.error`）。業務交易完全不受郵件影響 —— HTTP 狀態、訂單結果、審核結果都與寄信無關。

**⚠️ 沒有啟動時檢查。** 與 `JWT_SECRET`、私有儲存不同，`SMTP_*` 未設定時 backend
**照常啟動**，`getTransporter()` 只在第一次寄信時 throw，而該例外會被 `dispatchBestEffort`
接住並只印一行 log。**未設定 SMTP 的 production 會正常收單，卻一封信都不寄，而且沒有明顯訊號。**
（已記入 tracker 為 `REL-03`，blocked on 本決策。）

### 2.2 MVP 目前實際會寄的信（六封，逐一自程式碼確認）

| 事件 | 觸發點 | 內容 | 站內是否有替代管道 |
| --- | --- | --- | --- |
| **訂單成立 ＋ 付款指示** | `routes/order.js:79` | 訂單明細、總額、**匯款帳戶**、上傳憑證連結 | 有 —— 結帳頁與付款憑證頁走 `GET /payment/bank-info`（同一份來源） |
| **付款憑證已送出** | `routes/order.js:280` | 收件確認、審核中 | 有 —— 訂單頁 |
| **付款審核通過** | `routes/admin.js:354` | 教材已開放下載 | 有 —— 我的教材 |
| **付款憑證未通過** | `routes/admin.js:447` | 拒絕原因、重新上傳連結 | 有 —— 訂單頁 |
| **教材已上架**（創作者） | `materialReview.service.js:232` | 通知可開始推廣 | 有 —— 創作者教材列表 |
| **教材需要修改**（創作者） | `materialReview.service.js:278` | 退回原因 ＋ 審核說明 | 部分 —— `teacher/materials/page.tsx:131` 有計數，但**平台無站內通知中心**，不主動回站就不會知道 |

**目前不存在的信：** 退款／取消通知（`services/refundRemedy.service.js` 內無任何寄信呼叫）、
帳號驗證信、密碼重設信（平台**無密碼重設功能**，Terms §2.4）。

> **影響評估：** 郵件是**推播**，不是唯一管道 —— 每一封的內容站內都查得到。
> 因此 SMTP 失效不會讓任何人被鎖在帳號外，也不會讓買家查不到匯款帳戶；
> 它降低的是「使用者知道發生了什麼」的即時性，其中最關鍵的是教材退回通知。

### 2.3 O-19 不只是部署設定，它同時是法律揭露事實

`docs/legal-drafts/review-handoff.md:78` 記載 O-19 為《隱私權政策》**§5.3**
（郵件服務供應商揭露）的 `FACT UNKNOWN — OWNER / DEPLOYMENT INPUT REQUIRED`，
並明文：**不得猜測 provider，不得將任何 provider 名稱填入 §5.3**（同檔 :309-316）。

**因此因果方向與直覺相反：** O-19 不是在等法律審查，**是法律審查在等 O-19。**
（同理 O-20／Privacy §5.4 在等 `PRE-01`。）供應商一旦選定即成為受託處理者，
**該關係的法律定性與委外契約要求屬律師範疇，本文件不作判斷。**

### 2.4 選項

| Option | Integration model | Code change | Domain/DNS requirement | Ops complexity | MVP suitability | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| **A. 交易郵件供應商的 SMTP relay**（主流供應商皆提供 SMTP endpoint） | 沿用既有 nodemailer，**只填環境變數** | **無** | 需自有寄件網域 ＋ SPF ＋ DKIM（建議加 DMARC） | **低** | **高** | 需完成網域驗證才有良好送達率；供應商成為受託處理者（法律面見 §2.3） |
| **B. 供應商 HTTP API／SDK** | 換掉 nodemailer transport | 中 —— 改寫 transporter 並新增依賴 | 同上 | 低 | 低 —— **MVP 得不到任何好處** | 六封信共用同一個 `sendMail()`，換成 API 只是把可攜介面換成綁定介面 |
| **C. 一般信箱 SMTP 或自架 MTA** | 沿用既有 nodemailer | **無** | 自架需 SPF／DKIM／DMARC ＋ PTR ＋ IP 信譽 | 一般信箱低／自架**高** | 低 | 一般信箱多半禁止程式化寄送且有每日上限；自架 MTA 的送達率與維運成本對單人團隊不合理 |

### 2.5 直接回答本輪問題

```text
Does current code work with generic SMTP?      YES —— 純 nodemailer，無供應商專屬相依。
Would a provider-specific SDK be necessary?    NO —— Option A 完全不需要改任何程式碼。
What DNS records would Owner need?             寄件網域上：SPF（TXT）、DKIM（供應商指定的
                                               CNAME 或 TXT）、建議再加 DMARC（TXT）。
                                               實際值由選定的供應商產生。
What secrets/config are required?              SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
                                               / SMTP_FROM（皆置於 git-ignored 的 Backend/.env
                                               或部署環境，CLAUDE.md §8）。
                                               另需 PUBLIC_WEB_URL —— 信中連結的網域基準
                                               （emailService.js:22 的 appBaseUrl()），
                                               未設時會落到 http://localhost:3001。
```

> **設定時的一個實作細節（非阻擋）：** `secure` 僅在 port 465 為 true；port 587 依賴
> nodemailer 的機會性 STARTTLS，未設 `requireTLS`。選定供應商後可考慮固定用 465（隱式 TLS）
> 或補上 `requireTLS: true`。這是 O-19 落地時的一行設定判斷，**本輪未修改**。

### 2.6 建議

```text
Recommended MVP approach: A —— 交易郵件供應商的 SMTP relay，維持現有 nodemailer。
Owner decision required:  (1) 選定供應商（該名稱要寫進《隱私權政策》§5.3）；
                          (2) 決定寄件網域與 SMTP_FROM 位址；
                          (3) 完成 SPF / DKIM（/ DMARC）設定；
                          (4) 確認是否接受該供應商為受託處理者
                              （**契約與法律定性請律師確認**）。
```

---

## 3. OPS-01 — Legacy `pending_payment` 訂單處置

### 3.1 Canonical 定義（`docs/pending-work-tracker.md:881`）

付款期限政策（7 個日曆日）自 2026-08-26 生效，**只對新訂單**。既有訂單的
`payment_due_at` 一律 NULL 且**刻意不 backfill** —— 它們建立時買家沒有被揭露過任何期限。
因此系統既不判定它們逾期、也不處置它們。其 Completion Criteria 明載需**產品／營運拍板**，
**不依賴律師或會計師**。

### 3.2 本輪新增的實測證據（唯讀，僅彙總，未取用任何個人資料）

**(a) 這個母體是封閉的，不會再增加 —— 已由時間戳證明。**

| 量測 | `teaching_platform_security_test` |
| --- | --- |
| 最後一筆**沒有**期限的訂單 | `2026-08-26T15:12:16Z` |
| 第一筆**有**期限的訂單 | `2026-08-26T15:42:38Z` |
| 最後一筆有期限的訂單 | `2026-08-31T02:31:18Z` |

切換之後建立的訂單**全部**帶期限，沒有任何漏網。母體只會縮小（買家補件後被核准），不會成長。

**(b) 179 這個數字來自測試資料庫，而且其中多數是本月測試跑出來的。**

| 建立月份 | `security_test` legacy 筆數 | `teaching_platform`（dev） |
| --- | ---: | ---: |
| 2026-04 | 38 | 38 |
| 2026-05 | 12 | 10 |
| **2026-08** | **129** | 0 |
| **合計** | **179** | **48** |

`security_test` 近 7 日就新增了 47 筆 legacy 形狀的訂單（近 7 日全部訂單 141 筆）——
那是本月各輪 smoke／Postman／E2E 驗證產生的。**真正「政策生效前很久就存在」的世代
（2026-04／05）是 50 筆（dev 為 48 筆）**，與 tracker 原記錄的「建立超過 30 天 ＝ 50」一致。

**(c) 分類（`security_test`，n＝179）**

| 類別 | 筆數 |
| --- | ---: |
| 最新憑證為 `pending`（**待人工核帳，不得逕行處置**） | **35** |
| 最新憑證為 `rejected`（曾提交但被退件） | 132 |
| 完全沒有憑證 | 12 |
| 有後續 activity log | 177 |
| 最近 30 日內仍有動靜 | 129 |
| 沉寂 90 日以上 | 50 |
| 涉及不同買家數 | 138 |

**(d) 沒有 entitlement／下載後果 —— 已驗證。** 這些訂單的 `order_items.entitlement_status`
全部是 `active`（180 items／178 orders），乍看像是可以下載，**但不是**：交付授權要求
`o.status = 'approved'` **AND** `oi.entitlement_status = 'active'`
（`services/materialFile.service.js:428-430`）。`entitlement_status` 是與 `orders.status`
**正交**的暫停／撤銷維度（同檔 :410 註解），其預設值不授予任何東西。
**未發現任何繞過付款取得商品的路徑。**

**(e) 這些買家目前的實際處境**（tracker 已記載，本輪複驗成立）：`payment_due_at IS NULL`
在 `utils/paymentTimingPolicy.js:106,160` 一律 **allow** —— 他們仍可繼續提交付款憑證，
永遠不會被判逾期。**沒有任何買家因此被卡住。**

### 3.3 一個先決事實問題（它會決定 OPS-01 的實際範圍）

**目前不存在 production 資料庫。** 本輪列出的資料庫只有 `teaching_platform`（dev）與
`teaching_platform_security_test`（測試），沒有任何部署（`PRE-01` 未決）。
上述 179／48 筆**都不是 production 資料**。

因此在 Owner 回答下面這題之前，OPS-01 的規模是未定的：

```text
Production 是從空資料庫開始，還是要匯入現有資料？
```

* **從空資料庫開始** → production 上線當天 legacy `pending_payment` ＝ **0**，
  OPS-01 對上線而言**沒有任何影響**，降級為「政策文件化」而非資料處置。
* **要匯入現有資料** → 那是一次獨立的資料遷移決策（另涉 `PRE-02` 的憑證檔搬移），
  且屆時需重新量測，因為兩個資料庫的內容都還在隨測試變動。

**本輪不代為認定**，因為它是 Owner 的營運事實，不是工程能推導的結論。

### 3.4 技術面與法律面的切分

```text
technical cleanup decision（現在就能決定，不需法律意見）
  - 要不要在 Admin 佇列加一個篩選／分頁，讓「無期限的 legacy 訂單」不再混在日常工作流裡
    （這是顯示層變更，不動任何資料列）
  - 要不要引入 orders.status = 'expired' 這個新狀態值（schema ＋ 狀態機變更）
  - 是否維持這批訂單現行的「永久豁免」行為（＝維持現狀，零變更）

legal / customer-rights decision（BLOCKED BY PRE-03 / P1-09）
  - 是否對既有訂單補一段「自即日起 N 日內完成付款」的新揭露
    → 那是**對消費者的新承諾**，不是 backfill（tracker:5051 已如此標註）
  - 是否主動通知、以何種措辭通知
  - 行政上關閉訂單是否影響買家既有的付款主張，特別是 35 筆仍待核帳者
```

### 3.5 選項

| Option | User impact | Data change | Risk | Operational burden | Reversibility | MVP suitability |
| --- | --- | --- | --- | --- | --- | --- |
| **A. 原狀保留（grandfather）** | 無 —— 買家仍可補件並被核准 | **無** | **最低**；不做任何未經揭露的事 | 低（Admin 佇列長期帶著這批） | 不適用（沒有變更） | **高** —— 且若 production 從空庫開始，此選項等於零成本 |
| **B. 以原始建單時間回填期限** | **高** —— 一夕之間全部逾期，含 35 筆待核帳者 | 179 列 `UPDATE` | **高** —— 追溯適用從未揭露過的期限 | 中 | 可逆（但「已被判逾期」的事實已對外顯現） | **不建議**；且 §3.4 的揭露問題 **BLOCKED BY PRE-03 / P1-09** |
| **C. 行政上關閉全部** | **最高** —— 含 167 筆有付款證據者 | 179 列狀態變更（可能需新增 `expired`） | **最高** —— 可能否定買家既有的付款主張 | 中 | 難以逆轉 | **不建議**；**BLOCKED BY PRE-03 / P1-09** |
| **D. 依證據分流** —— (i) 35 筆 `pending` 憑證：**只能人工核帳**；(ii) 132 筆僅有退件憑證：通知後給新期限；(iii) 12 筆完全無憑證：風險最低者才考慮關閉 | 中，且與證據強度成比例 | 分批，每批不同 | 中 —— (i) 安全；(ii)(iii) 仍觸及新揭露 | **高** —— 需人工核帳 35 筆並建立通知流程 | 分批可逆 | 若 production 確實有實際資料，(i) 是無論如何都要做的一步 |

> **本輪不選擇任何涉及取消／退款語意的選項** —— 依指示，凡取決於未定法律意見者一律標記
> `BLOCKED BY PRE-03 / P1-09`，見上表 B／C 以及 D 的 (ii)(iii)。

---

## 4. 跨決策相依關係

```text
Can PRE-01 be decided now?   YES —— 且不需要等法律審查。
Can O-19 be decided now?     YES —— 且不需要等法律審查。
Can OPS-01 be decided now?   PARTIALLY —— 技術面可以；對消費者的處置面不行。
```

**但方向與預期相反，這點必須明講：**

* `PRE-01` 與 `O-19` **不依賴**法律審查；**反過來，法律審查依賴它們。**
  《隱私權政策》§5.3（郵件供應商）在等 O-19、§5.4（部署環境受託處理者）在等 O-20／`PRE-01`
  （`review-handoff.md:78-79`）。**決定這兩項會直接解除律師端的兩個 FACT UNKNOWN。**
* `OPS-01` 的**技術清理面**（Admin 佇列顯示、是否新增 `expired` 狀態、維持現狀）
  完全不需要法律意見；**對消費者的處置面**（新期限揭露、通知、取消語意）
  **BLOCKED BY PRE-03 / P1-09**。
* `OPS-01` 另有一個**先於一切的先決問題**（§3.3）：production 是否從空資料庫開始。
  若是，OPS-01 對上線的影響為零。

```text
PRE-01 ─┬─► 解除 O-20（Privacy §5.4 受託處理者揭露）
        ├─► 解除 PRE-02（憑證檔 legacy 搬移的執行環境）
        └─► 決定 REL-02 的風險評級（無自動重啟時該項應升 P1）

O-19 ──┬─► 解除 Privacy §5.3 的 FACT UNKNOWN
       └─► 解除 REL-03（SMTP 啟動時 preflight）

OPS-01 ─┬─ 技術面 ──► 可立即決定
        └─ 消費者處置面 ──► BLOCKED BY PRE-03 / P1-09
```

---

## 5. Owner Decision Table

| Decision | Option A | Option B | Option C | Recommended | Owner must decide |
| --- | --- | --- | --- | --- | --- |
| **PRE-01** | PaaS ＋ 掛載持久化 volume ＋ managed PostgreSQL（**零程式碼改動**） | 單一 VPS／VM 自管（零程式碼改動，維運自理） | Ephemeral／serverless ＋ 物件儲存（**需先實作 driver ＋ `createSignedUrl` ＋ 搬移 1,073 檔**） | **A** | 平台；volume 備份責任歸屬；**第一筆素材上傳前**定案 production 主機名 |
| **O-19** | 交易郵件供應商的 SMTP relay（維持 nodemailer，**零程式碼改動**） | 供應商 HTTP API／SDK（需改寫 transport） | 一般信箱 SMTP 或自架 MTA | **A** | 供應商名稱（要寫進 Privacy §5.3）；寄件網域與 `SMTP_FROM`；SPF／DKIM／DMARC；是否接受該供應商為受託處理者（**契約面請律師**） |
| **OPS-01** | 原狀保留（grandfather，零資料變更） | 回填期限（**BLOCKED**） | 行政關閉（**BLOCKED**） | **A**，並先回答 §3.3 的先決問題 | production 是否從空庫開始；若否，35 筆待核帳憑證的人工處理排程；是否只做 Admin 佇列的顯示層分流 |

### 為什麼是現在 / 為什麼適合 MVP / 什麼可以延到 post-MVP

**PRE-01 → Option A**

* **why now** —— 它是兩個非法律硬阻擋之一（`R2-005`）；在平台選定前，
  production 的 `NODE_ENV=production` ＋ local driver 組合**會直接拒絕啟動**，
  所以連「先上線再說」都不可能。它同時卡著律師端的 O-20。
* **why MVP-appropriate** —— A 是唯一零程式碼改動即滿足既有 fail-closed 條件的選項；
  總資料量只有 5.7 MB／1,073 檔，完全用不到物件儲存的規模能力。
* **post-MVP** —— 物件儲存 driver、水平擴充、CDN、`uploadIdempotencyCache` 的跨 instance 化，
  以及 `FUT-T1`（防毒掃描）／`FUT-T3`（斷點續傳 ＋ CDN），全部可以等。

**O-19 → Option A**

* **why now** —— 另一個非法律硬阻擋（`R2-006`），且是律師定稿 Privacy §5.3 的**輸入**。
  現在決定等於同時推進工程與法律兩條軌。
* **why MVP-appropriate** —— 程式碼已經是通用 SMTP，決策成本就是幾個環境變數加幾筆 DNS。
  六封信全部是低量交易信，沒有行銷寄送需求。
* **post-MVP** —— 退款／取消通知信、站內通知中心、寄送量體監控與 bounce 處理、
  信件模板系統，全部可以等。

**OPS-01 → Option A（並先回答先決問題）**

* **why now** —— 只需要現在確認一件事：production 是否從空資料庫開始。
  若是，本項對上線無影響，不該再佔用上線關鍵路徑。
* **why MVP-appropriate** —— 母體已證明封閉且不再成長；沒有任何買家被卡住；
  沒有 entitlement 後果。維持現狀的風險最低，也不會做出任何未經揭露的事。
* **post-MVP** —— `expired` 狀態、通知流程、Admin 佇列分流，
  以及任何涉及新期限揭露者（後者另須等 `PRE-03`／`P1-09`）。

---

## 6. 各決策解除哪些工程工作

> **本輪不啟動下列任何一項。**

**若 `PRE-01` 決定：**

* 建立部署設定（目前 repo 完全沒有）：build／start、環境變數清單、健康檢查
  （`GET /health` 已存在，回 `{"status":"ok"}`）。
* 設定 `PRIVATE_FILE_STORAGE_PATH` ＋ `PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION`，
  並實測 production fail-closed 的三條分支確實如預期。
* 設定 `PUBLIC_BACKEND_URL`、`PUBLIC_WEB_URL`、`API_BASE_URL`、`NODE_ENV=production`。
* `PRE-02`（憑證檔 legacy 搬移在 production 執行並驗證 checksum）解除阻擋。
* `REL-02` 的風險評級定案（依平台是否具備自動重啟）。
* 資料庫備份／還原程序落地（`docs/db-backup-and-migration.md` 目前寫的是本機情境）。
* O-20（Privacy §5.4 受託處理者揭露）取得所需事實。

**若 `O-19` 決定：**

* 設定 SMTP 環境變數；以 `npm run smtp:check --prefix Backend` 驗證連線與實寄。
* `REL-03`（啟動時 SMTP preflight，讓設定缺失在部署當下就顯現而不是靜默失敗）解除阻擋。
* 決定 587 ＋ `requireTLS` 或 465 隱式 TLS（§2.5）。
* DNS：SPF／DKIM／DMARC。
* Privacy §5.3 取得所需事實。

**若 `OPS-01` 決定：**

* Option A（建議）→ **零工程工作**；只需在 tracker 記錄決定並關閉本項。
* 若選 Admin 佇列顯示層分流 → 一個前端篩選（不動資料）。
* 若選任何涉及狀態變更者 → schema ＋ 狀態機 ＋ 稽核 ＋ 測試，
  且其對消費者的部分仍 **BLOCKED BY PRE-03 / P1-09**。

---

## 7. 本輪未做的事（scope proof）

```text
選定供應商：           NO
註冊任何服務：         NO
部署：                 NO
SMTP 設定：            NO
資料遷移：             NO
修改 legacy 訂單：     NO
production code：      未修改
schema / migration：   未修改
legal wording：        未修改
push / PR / merge：    未執行
```

資料庫存取一律唯讀（`information_schema`／`pg_catalog`／`SELECT` 彙總），
未輸出任何個人資料、密碼，或含憑證的連線字串。
