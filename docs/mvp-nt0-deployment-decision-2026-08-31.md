# MVP NT$0 Deployment Decision（Owner Decision Lock — Round 7）

> **這份文件 supersedes `DEC-13` 的儲存條款。**
> `DEC-13` 原文中「**物件儲存不屬於 MVP —— S3／R2 遷移維持 post-MVP**」一句
> **已於 2026-08-31 由 Owner 明示撤回**，改由本文件的 `DEC-16` 取代。
> canonical 記錄同步於 `docs/pending-work-tracker.md`（§1 Owner Decision Lock — Round 7）。
>
> **本文件不部署任何東西。** 未建立 Render service、未建立 Neon 資料庫、
> 未建立任何 bucket、未綁定信用卡、未購買網域、未輸入任何 production secret。

| 項目 | 值 |
| --- | --- |
| 日期 | 2026-08-31 |
| Decision IDs | `DEC-16`（private object storage）／`DEC-17`（NT$0 MVP deployment target） |
| Supersedes | `DEC-13` 的**儲存條款**（其餘條款見 §3 逐條對照） |
| 實作票 | **`PRE-13`**（generic S3-compatible private storage driver） |

---

## 1. Owner 決策原文

```text
品牌名稱尚未確定前：
  不購買正式網域
  使用 provider 免費 URL
  約 10 位內部 / 封閉測試使用者
  MVP deployment infrastructure 成本目標 = NT$0
  正式 .com 等品牌名稱確定後再購買
  Domain 不得成為 MVP deployment blocker

DEC-13 中「物件儲存不屬於 MVP」允許重新評估。
若 persistent object storage 是達成 NT$0 production-like MVP 的必要條件，
允許將 object storage 提前至 MVP。
```

**工程結論：它確實是必要條件。** 理由見 §2。

---

## 2. 為什麼 object storage 從 post-MVP 提前到 MVP

這不是偏好，是一條硬約束推出來的：

```text
1. Backend/config/privateFileStorage.js 只實作 local driver，
   且 NODE_ENV=production + local driver 時要求
   PRIVATE_FILE_STORAGE_PATH 指向持久化路徑並明示 opt-in，否則拒絕啟動。

2. 免費方案一律不提供 persistent volume：
     Render      Free web services cannot use persistent disks（官方 Deploy for Free）
     Fly.io      2024 起新用戶無免費額度，僅 2 VM-hours / 7 天試用
     Railway     無免費方案（Hobby $5/月起）
     Koyeb       Free Instance 不能掛 volume
     Northflank  Free 方案不支援 persistent volume

3. 因此在免費方案上，只有兩種結局：
     (a) 維持 local driver → fail-closed 拒絕啟動（正確行為）
     (b) 強行 opt-in       → 每次 redeploy 與 spin-down 都刪光已售教材與付款憑證

⇒ NT$0 與 local driver 互斥。要 NT$0 就必須有 object storage driver。
```

---

## 3. `DEC-13` 逐條對照 —— 哪些留著、哪些被取代

| `DEC-13` 條款 | 狀態 | 說明 |
| --- | --- | --- |
| Frontend ＝ Render Web Service | ✅ **維持** | 改用 **Free** instance type |
| Backend ＝ Render Web Service | ✅ **維持** | 改用 **Free** instance type |
| **Backend 單一 instance** | ✅ **維持且更強** | `routes/order.js:27` 的 `uploadIdempotencyCache` 是 process 內狀態；Render Free 本來就只有 1 個 instance |
| Database ＝ Render Managed PostgreSQL | ❌ **SUPERSEDED** | Render **免費 Postgres 建立 30 天後到期**，之後 14 天寬限即刪除，且不支援備份。改用 **Neon Free**（無到期日、scale-to-zero 後連線自動喚醒） |
| 私有檔案 ＝ Render Persistent Disk | ❌ **SUPERSEDED** | 免費方案不支援 disk。改用 object storage（`DEC-16`） |
| storage driver 維持 `local` ＋ `ALLOW_LOCAL_IN_PRODUCTION=true` | ❌ **SUPERSEDED** | 改為 `PRIVATE_FILE_STORAGE_DRIVER=s3`。**production 不再需要、也不應設定 `PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION`** |
| **「物件儲存不屬於 MVP，S3／R2 維持 post-MVP」** | ❌ **SUPERSEDED（本文件的主旨）** | 見 `DEC-16` |
| `DEC-14` Resend SMTP | ✅ **維持** | 但 MVP 初期**可不啟用**（fails soft，見 `DEC-17`） |
| `DEC-15` production 從全新空資料庫開始 | ✅ **維持，不受影響** | 仍不得匯入任何 dev／test 資料 |
| LAUNCH GUARDRAIL（素材上傳前鎖定 hostname） | ⚠️ **修訂** | 見 §6 |

> **不得留下兩套 canonical truth。** 任何文件若仍寫著
> 「object storage is post-MVP」或「private files 掛 Render Persistent Disk」，
> 必須標記 **SUPERSEDED BY DEC-16 (2026-08-31)** 並指回本文件。

---

## 4. `DEC-16` — Private object storage provider

### 4.1 候選比較（全部取自供應商官方文件，2026-08-31 查證）

| 查核項 | **Backblaze B2** | **Cloudflare R2** | **Supabase Storage** |
| --- | --- | --- | --- |
| 免費儲存 | **10 GB 永久免費** | **10 GB-月** | **1 GB** |
| 免費 egress | **3× 平均月儲存量**；超出 $0.01/GB | **無上限、$0** | 5 GB／月 |
| 免費操作額度 | 每日免費交易額度（Class B／C 各有配額） | **1M Class A ／ 10M Class B ／月** | 併入 egress 計算 |
| **需要信用卡** | **否** —— 官方明載建立帳號不需提供信用卡 | **是** —— 啟用 R2 必須綁付款方式 | **否** |
| **超額自動扣款** | **可完全避免** —— 可設每日 $ 上限（達上限即擋下請求）；且無卡即無從扣款 | **可能** —— Cloudflare 會預授權卡片、逾期未付 30 天後資料可能被刪除；**R2 無硬性 spend cap** | **否** —— Free 為硬上限，無 overage 計費 |
| 免費是否為短期 trial | **否**，永久 | **否**，永久 | **否**，永久 |
| private by default | ✅ bucket 建立時選 Private | ✅ 官方：「buckets are never publicly accessible and will always require explicit user permission to enable」 | ✅ bucket 可設 private |
| S3 API 相容 | ✅ S3-Compatible API | ✅（不支援 ACL／tagging／versioning／bucket policy —— **本專案都不用**） | ✅ 支援 Get/Put/Head/Delete/Multipart |
| **HTTP Range** | ✅ GetObject 支援 byte-range，無資料時回 416 | ✅ GetObject「with HTTP Range support fully implemented」 | ✅ GetObject 支援 Range |
| **單檔上限** | 10 TB | 5 TB | ⚠️ **Free 方案 50 MB 上限，不可調高** |
| Region | US West／US East／EU —— **無亞太** | 全球網路，自動就近 | 多區含亞太 |
| 閒置暫停 | 無 | 無 | ⚠️ **7 天無活動即暫停，需人工恢復**（資料保留，90 天內可還原） |

### 4.2 Supabase Storage —— 硬性淘汰

**淘汰理由一（決定性）：Free 方案單檔上限 50 MB，且官方明載「For Free projects, the limit can't exceed 50 MB」。**
本專案的既有上限是**教材本體 100 MB**（`MAX_MATERIAL_FILE_BYTES`）與**試看影片 80 MB**
（`MAX_MATERIAL_MEDIA_VIDEO_BYTES`）。採用 Supabase Free 等於必須把這兩個數字砍到 50 MB —— 那是
**產品政策變更**，不是部署設定。`config/privateFileStorage.js` 的註解明確記載這些數值
「沿用搬入私有儲存之前的既有上限」，並強調那條 milestone 改的是「存在哪裡、誰能看」，
不是「產品可以上傳多大的東西」。**本輪不代為縮小產品限制。**

**淘汰理由二：7 天無活動即暫停，且恢復需人工操作。** 封閉測試本質上斷續進行，
週一發現整站檔案取不到、要先登 dashboard 按恢復，直接毀掉「確認 production 環境可正常運作」這個目的。

### 4.3 決策

```text
DEC-16
Private object storage provider = Backblaze B2（S3-Compatible API）
Fallback（已預先核可，切換只需改環境變數）= Cloudflare R2
```

**為什麼是 B2 而不是 R2。** Owner 明示的優先序是
「優先『不需要信用卡』」與硬條件「不得因超額自動產生費用」。
只有 B2 同時滿足這兩條：**建立帳號不需信用卡**（官方明載），
且**可設每日 $ 上限**讓超額變成「請求被擋下」而不是「帳單增加」；
沒有卡在檔，也就沒有任何自動扣款的路徑。
R2 在其他每一個維度都更好，但**啟用 R2 強制綁卡，且 Cloudflare 沒有 R2 的硬性 spend cap**——
那正是硬條件要排除的東西。

**為什麼這個選擇是低風險的。** 實作的是 **generic S3-compatible driver**，不是「B2 driver」。
B2、R2、Supabase、iDrive e2 全部走同一支程式碼，差別只有五個環境變數
（endpoint／region／bucket／access key／secret）。因此
**若 egress 額度成為實際瓶頸，切換到 R2 是純設定變更，零行程式碼改動、零 migration**
（既有物件需一次性複製，storage key 格式完全相同）。

### 4.4 已知限制（必須讓 Owner 知道，不隱藏）

```text
1. Egress 額度 = 3 × 平均月儲存量。
   估算：儲存約 300–400 MB → 免費 egress 約 0.9–1.2 GB／月。
   10 位測試者的預估用量約 0.8–1.5 GB／月 —— 貼著線，可能略微超出。
   超出成本為 $0.01/GB（超 5 GB ＝ $0.05），金額微不足道，
   但「有金額」本身就不是 NT$0，因此必須靠每日 $ 上限擋住。
   ⇒ 設 $0 上限 = 保證 NT$0，代價是達標當日下載會失敗直到 GMT 午夜重置。
   ⇒ 這是本方案唯一的實質取捨，也是切換 R2 的觸發條件。

2. 無亞太 region。台灣測試者的檔案下載會多一段跨太平洋延遲。
   對 10 人功能驗證可接受；對真實用戶不是長久之計。

3. 每次素材交付會產生 2 次 HeadObject ＋ 1 次 GetObject
   （routes/materials.js 的 media 端點會先 probe 一次取得 totalBytes）。
   這是既有的 business logic，本輪不修改。已上架素材的
   `public, max-age=300` 讓瀏覽器端吸收掉大部分重複請求。
```

---

## 5. `DEC-17` — MVP deployment target

```text
MVP deployment target:
NT$0

Domain:
provider free URL（*.onrender.com）；正式 .com 待品牌名稱確定後再購買

Expected users:
~10 closed/internal testers

Frontend:
free tier — Render Free Web Service（Next.js / next start）

Backend:
free tier — Render Free Web Service（Node 18 / Express 5 / 單一 instance）

PostgreSQL:
free tier — Neon Free（0.5 GB／project，無到期日，scale-to-zero 後自動喚醒）
※ 明確不使用 Render Free Postgres —— 建立 30 天後到期

Private file storage:
Backblaze B2（S3-Compatible API，private bucket）
via generic S3 driver（PRIVATE_FILE_STORAGE_DRIVER=s3）
Fallback 已核可：Cloudflare R2（env-only 切換）

Email:
optional / disabled during initial MVP if necessary
SMTP_* 留空 → backend 照常啟動、照常收單、不寄信（fails soft，REL-02 已保證不會終止 process）
匯款帳戶由結帳頁的 GET /payment/bank-info 提供，不依賴郵件

Formal .com:
deferred until brand name is confirmed
```

---

## 6. LAUNCH GUARDRAIL 的修訂

`DEC-13` 時代的 guardrail 是：

```text
（原文，已修訂）
NO REAL PRODUCTION MEDIA UPLOAD
BEFORE THE STABLE BACKEND PRODUCTION HOSTNAME IS LOCKED.
```

它的技術根據沒有改變：`services/materialMedia.service.js:90` 的 `mediaUrl()` 會把
**含 host 的絕對 URL** 寫進 `materials.cover_image_url` / `material_images.image_url` /
`demo_video_url`，換 host 不會回寫既有列。

但 `DEC-17` 明示「Domain 不得成為 MVP deployment blocker」。兩者的調和方式是
**限縮 guardrail 的適用對象，而不是取消它**：

```text
（修訂後）
MVP 封閉測試期間，PUBLIC_BACKEND_URL 使用 Render 配發的 hostname 是被允許的，
且必須在第一次啟動前就設定正確（絕不可留空 —— 留空會寫入 localhost）。

代價已知並被接受：這些絕對 URL 會帶著 *.onrender.com 的 host 持久化。
購買正式網域時，必須執行一次性的資料修補（單一 transaction，先備份）：
  UPDATE materials       SET cover_image_url = REPLACE(cover_image_url, <old>, <new>) ...
  UPDATE material_images SET image_url       = REPLACE(image_url,       <old>, <new>) ...
  UPDATE materials       SET demo_video_url  = REPLACE(demo_video_url,  <old>, <new>) ...
（parseMediaId() 只比對 path，因此認領邏輯不受影響。）

⇒ 若 MVP 測試資料本來就會丟棄，此項改為「重建資料庫」即可，無需修補。

仍然不變的禁止事項：
  ✗ 不得讓 PUBLIC_BACKEND_URL 留空（會把 http://localhost:3000 永久寫進資料列）
  ✗ 不得在正式營運（非封閉測試）階段沿用 provider hostname 上傳真實素材
```

---

## 7. 需要 reconcile 的文件

| 文件 | 需要的變更 | 狀態 |
| --- | --- | --- |
| `docs/pending-work-tracker.md` | `DEC-13` 標記部分 superseded；新增 Round 7；`PRE-01`／`PRE-07`／`PRE-08` 更新；新增 `PRE-13`；O-20 受託處理者清單更新 | 本輪執行 |
| `docs/owner-decision-round-3-provider-selection-2026-08-31.md` | 檔頭加 superseded banner（它的成本模型與 `PRE-01` 建議是付費 Render 架構） | 本輪執行 |
| `docs/production-environment-contract.md` | 儲存章節改為 s3 driver；`PRIVATE_FILE_STORAGE_PATH`／`ALLOW_LOCAL_IN_PRODUCTION` 由 REQUIRED 降為 local-only | 本輪執行 |
| `docs/material-file-storage-and-delivery.md` | 新增 s3 driver 章節與 security invariants | 本輪執行 |
| `Backend/.env.example` | 新增 `PRIVATE_FILE_STORAGE_S3_*`（僅佔位符） | 本輪執行 |
| `docs/mvp_rules.md` | §21A 儲存後端敘述對齊 | 本輪執行 |

---

## 8. 受託處理者清單的變化（影響 `O-20`）

這是採用 NT$0 架構的**非成本代價**，必須進入《隱私權政策》§5.4 的揭露：

| | `DEC-13`（付費 Render） | `DEC-16`／`DEC-17`（NT$0） |
| --- | --- | --- |
| 應用程式主機 | Render | Render |
| 資料庫 | Render（同一家） | **Neon**（新增） |
| 私有檔案（含付款憑證） | Render（同一家） | **Backblaze**（新增） |
| 交易郵件 | Resend | Resend（MVP 初期可不啟用） |
| **受託處理者總數** | **2** | **4** |

> **付款憑證（含買家姓名、帳號末碼、匯款截圖）將存放於 Backblaze B2（美國）。**
> 這是跨境傳輸的事實，`O-20` 的揭露必須據實反映，且應與律師確認。
> **本文件不作任何法律判斷。**

---

## 9. 本文件未做的事

```text
建立 Render service：      NO
建立 Neon 資料庫：          NO
建立 B2 / R2 bucket：       NO
綁定信用卡：                NO
購買網域：                  NO
輸入 production secret：    NO
實際 production deployment：NO
修改 business authorization semantics：NO
縮小任何產品上傳限制：      NO
弱化任何 production fail-closed：NO
```
