# Owner Decision Round 3 — Provider Selection Research（2026-08-31）

> ## ⚠️ PARTIALLY SUPERSEDED — 2026-08-31（`DEC-16` / `DEC-17`）
>
> **本文件通篇假設一個「約 $21–25 USD／月」的付費架構。**
> Owner 已於同日改採 **NT$0 MVP 部署目標**，因此下列部分**不再是 canonical**：
>
> | 本文件的內容 | 狀態 |
> | --- | --- |
> | §3 持久化 volume 比較、§9「私有檔案 ＝ Persistent Disk、driver 維持 `local`」 | ❌ **SUPERSEDED** —— 免費方案不提供 volume，production driver 改為 `s3` |
> | §4 Managed PostgreSQL 比較、§9「Database ＝ Render Postgres」 | ❌ **SUPERSEDED** —— Render **免費** Postgres 建立 30 天後到期，改用 **Neon Free** |
> | §7 成本模型（Render 約 $21–25／月） | ❌ **SUPERSEDED** —— 目標為 NT$0，全部使用免費層 |
> | §6 網域策略「先買網域再上傳第一筆素材」 | ⚠️ **修訂** —— MVP 封閉測試允許使用 provider hostname，代價與修補程序見新文件 §6 |
> | §5 前後端同一家 PaaS 的理由 | ✅ **維持** |
> | §1 需求盤點（單一 instance、無法 static export、持久化為硬需求） | ✅ **維持** |
> | §10 O-19 郵件供應商研究（`DEC-14` Resend） | ✅ **維持** |
>
> **canonical 決策：`docs/mvp-nt0-deployment-decision-2026-08-31.md`。**
> 本文件保留作為 **provider research 的歷史紀錄與比較方法**，不再作為部署架構的依據。

> ## ✅ DECISION LOCKED — 2026-08-31
>
> Owner 已審閱本文件並拍板（canonical 記錄見 `docs/pending-work-tracker.md`
> §1「Owner Decision Lock — Round 6」，Decision ID `DEC-13`／`DEC-14`／`DEC-15`）：
>
> ```text
> PRE-01        → Render        （DEC-13）
> O-19          → Resend SMTP   （DEC-14）
> Production DB → FRESH DATABASE（DEC-15）
> OPS-01        → 非 MVP launch blocker（production legacy pending_payment = 0）
> Production domain → PENDING OWNER DECISION / PURCHASE
> ```
>
> **鎖定的是「選誰」，不是「已經設定好了」。**
> deployment configuration 與 SMTP configuration **兩者皆尚未開始**
> （實作項 `PRE-07`～`PRE-11`，全部 NOT STARTED）。
>
> **🚩 LAUNCH GUARDRAIL：在 production Backend hostname 鎖定之前，
> 不得進行任何真實 production 素材上傳**（`mediaUrl()` 會把含 host 的絕對 URL 寫進資料列）。

```text
research date = 2026-08-31
```

> **本文件是 provider research ＋ decision preparation，不是實作。**
> 本輪未部署、未設定 SMTP、未註冊任何服務、未建立 production 資料庫、未匯入資料、
> 未修改 production code／schema／migration／legal wording，未開始 `REL-03`／`PRE-06`／`OPS-06`。
>
> Active backlog 的 source of truth 仍是 `docs/pending-work-tracker.md`（CLAUDE.md §11）。
> 架構方向由 Round 2（`docs/owner-decision-packet-2026-08-31.md`）確立，本輪只回答「哪一家」。

| 項目 | Branch | HEAD |
| --- | --- | --- |
| 產出基準 | `chore/rel-01-preservation-checkpoint` | `63be249` |

## 0. 證據品質約定

* 所有 provider 事實**一律取自該供應商的官方文件／定價頁**，並在文末 §11 列出來源 URL。
* 無法自官方來源取得的價格一律標記 **`CURRENT PRICE NOT VERIFIED`**，**不猜測、不填補**。
* 部分供應商的定價頁為 JavaScript 渲染，直接抓取只會拿到導覽骨架。
  這類情況若能自**同一網域的其他官方頁面**取得數字，會註明取得方式；否則標記為未驗證。

---

## 1. 需求重新確認（repo evidence，非假設）

Round 2 已窮舉並複驗，本輪不重跑，僅列出作為篩選條件：

| 需求 | 事實 | 來源 |
| --- | --- | --- |
| Backend | Node.js 長駐 process，單一 port | `Backend/index.js:161-169` |
| Frontend | Node server runtime，**無法 static export** | `app/api/backend/[...path]/route.ts` 等 route handler |
| PostgreSQL | 外部資料庫，`DATABASE_URL` 或 `PG*` | `Backend/config/db.js` |
| **持久化檔案系統** | **硬需求** —— 僅實作 `LocalPrivateFileStorage` | `config/privateFileStorage.js:132-137` |
| 私有資料量 | **1,073 檔／5.7 MB**（實測） | 四個 namespace |
| `Backend/uploads/` | **不需持久化**（實測 0 檔） | —— |
| Backend 公開位址 | **必要** —— 素材 `<img src>` 由瀏覽器直打 Backend | `services/materialMedia.service.js:85-90` |
| 環境變數／secrets | `JWT_SECRET`、`PRIVATE_FILE_STORAGE_*`、`PAYMENT_BANK_*`、`SMTP_*` 等 | `Backend/.env.example` |
| Health check | `GET /health` → `{"status":"ok"}` | `Backend/index.js:136` |
| **Backend instance 數** | **1** —— `uploadIdempotencyCache = new Map()` 為 process 內狀態 | `Backend/routes/order.js:27` |

> **單一 Backend instance 是本輪的設計前提，不是妥協。**
> 沒有任何證據支持水平擴充是安全的，因此**不把多 instance 當作 MVP 預設架構**。
> 有趣的是：三家候選的 volume 機制**本來就強制單 instance**，兩者恰好吻合。

---

## 2. 部署候選：先做硬性淘汰

§4 要求至少評估 Railway／Render／Fly.io／DigitalOcean，最終最多 3 家。

### 2.1 DigitalOcean App Platform —— 硬性淘汰

官方 limits 文件明文：

> App Platform **does not support volumes**；
> "Data in the host instance's local filesystem is permanently lost after deployments and other container replacements."
> 本機檔案系統上限 4 GiB，達上限時容器會被標記為 unhealthy 並replace。

這正是 `config/privateFileStorage.js` 檔頭所描述、且 **fail-closed 明確拒絕**的情境：
已售出的教材與付款憑證會在下一次部署被靜默刪除。

**淘汰理由：不滿足 §5 的硬需求。**
（DigitalOcean 的 **Droplet** 可以滿足，但那是自管 VM，屬 Round 2 的 Option B，不是 PaaS 選項。
本輪依 §4 只比較 PaaS 候選，Droplet 作為 Round 2 Option B 的實作對象仍然有效。）

### 2.2 最終 shortlist（3 家）

```text
Render / Railway / Fly.io
```

---

## 3. 硬需求逐項查核 —— 持久化 volume（PRE-01 最重要的過濾器）

| 查核項 | **Render**（Persistent Disks） | **Railway**（Volumes） | **Fly.io**（Fly Volumes） |
| --- | --- | --- | --- |
| 掛載式檔案系統？ | ✅ 指定絕對 mount path | ✅ 指定 mount path | ✅「像一般目錄一樣讀寫」 |
| Node 可寫一般檔案？ | ✅ | ✅ | ✅ |
| `PRIVATE_FILE_STORAGE_PATH` 可直接指向？ | ✅ | ✅ | ✅ |
| 撐過 restart？ | ✅ | ✅ | ✅ |
| 撐過 redeploy／new release？ | ✅「preserved across deploys and restarts」 | ✅（刪除有 48 小時寬限期） | ✅ |
| 部署是否置換／卸載 volume？ | **不置換**，但**先停舊 instance 再起新的**，「a few seconds」不可用 | **不置換**，但 volume 服務**不能有多個 active deployment**，redeploy 有短暫downtime | 不置換；volume 綁定該 Machine |
| 可掛到多個 instance？ | ❌「accessible by only a single service instance」 | ❌「Replicas cannot be used with volumes」 | ❌「a volume can be attached to only one Machine」 |
| Region 限制 | 建立後**不可更改** service／database 的 region | 未載明變更限制 | **綁定單一實體伺服器**，「not network storage」 |
| 備份機制 | **自動** —— 每 24 小時快照一次，保留**至少 7 天** | **可排程** —— daily 保留 6 天／weekly 保留 1 個月／monthly 保留 3 個月；亦可手動 | **自動每日快照**，預設保留 5 天，可設 1–60 天 |
| 備份是自動還是 Owner 管理？ | 自動（Owner 仍須負責還原演練） | **Owner 需啟用排程**（預設非自動） | 自動，但官方明言「不應作為主要備份策略」 |
| 大小上限 | 未於文件載明 | Hobby **5 GB**／Pro 50 GB／Enterprise 至 1 TB | 預設 1 GB，上限 500 GB |
| 是否需要改程式碼？ | **否** | **否** | **否** |

**三家都通過硬需求，都不需要改任何程式碼。**

> **Fly.io 的一項官方警告必須單獨標出：**
> 文件明文「**Always provision at least two volumes per app**」，並說明單一 volume
> 會使 app 暴露於「downtime and data loss」。
> **但這個建議與本 repo 的架構直接衝突** —— `LocalPrivateFileStorage` 是單一寫入者，
> 沒有任何跨 volume 複寫機制；掛第二顆 volume 只會得到一顆內容不同步的空盤。
> 因此在 Fly.io 上，本專案**只能**以官方明文不建議的單 volume 形態運行。
> 這不是 Fly.io 的缺陷，是它的模型與本 repo 目前的儲存實作不合。

---

## 4. Managed PostgreSQL 比較

| 查核項 | **Render Postgres** | **Railway Postgres** | **Fly Managed Postgres（MPG）** |
| --- | --- | --- | --- |
| 是否為受管服務？ | ✅「fully managed, enterprise-grade databases」 | ❌ **不是** —— 由 Railway 的 SSL-enabled Postgres image **部署的容器**，「you have total control over their configuration and maintenance」 | ✅ 受管，含 high availability 與 automatic failover |
| TLS 連線 | 支援（連線細節見官方 Create & Connect 文件） | image 本身 SSL-enabled | 文件未於該頁載明 |
| 備份／PITR | 官方文件設有 Recovery & Backups 專章 | **無內建自動備份** —— 官方建議自行以 Railway volume backup 解決 | 「automatic backups and recovery」，**保留期與 PITR 視窗未於該頁載明** |
| Region 與 Backend 相容 | 同 5 個 region 可選 | 同 4 個 region 可選 | 需 `fly platform regions` 查詢 |
| 連線字串格式 | 標準 `postgres://`（`DATABASE_URL`） | 提供 `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` **與** `DATABASE_URL`；對外另有 `DATABASE_PUBLIC_URL` | 該頁未載明 |
| 儲存計價 | **$0.30 / GB / 月** | 走 volume 計價 **$0.15 / GB / 月** | **$0.28 / 已配置 GB / 月**（上限 1 TB） |
| Free tier | Free Postgres **1 GB**，**建立 30 天後到期**，另有 14 天寬限期後刪除；每 workspace 僅限一個 | 走 Hobby 的 $5 usage credit | 無（最低 $38／月，見 §6） |
| 休眠／暫停行為 | Free web service 15 分鐘無流量會 spin down（**資料庫另計**） | 未載明休眠 | 未載明休眠 |

### 4.1 與現有 `pg` 設定的相容性（**未改任何 DB 程式碼**）

`Backend/config/db.js` 的行為是：`DATABASE_URL` 有值就優先使用，否則走 `PG*`。
Round 2 已實測 `pg-connection-string` 2.12.0 會解析 `?sslmode=require`，
**但目前版本把 `require` 當成 `verify-full`**。因此：

* **Render / Fly MPG** —— 受管服務，憑證由公開 CA 簽發，`sslmode=require` 可直接使用。
* **Railway** —— 兩種連法都可用（內網 `PGHOST` 或 `DATABASE_URL`）。若走公開 `DATABASE_PUBLIC_URL`
  並要求 TLS，需確認其憑證鏈；**若為自簽，`sslmode=require` 在目前的 `pg` 版本會失敗，
  必須改用 `sslmode=no-verify`**。這是設定層的判斷，**不需要也不應該改 DB 程式碼**。

> **本輪未修改 `Backend/config/db.js`，也未變更任何連線設定。**

---

## 5. Frontend 部署位置（§7）

前端**不能 static export**，一定要有 Node server runtime，因此三家 PaaS 都是「再開一個 web service」。

**建議：A —— 與 Backend 同一家 PaaS。**

理由，按重要性排序：

1. **少一個受託處理者要揭露。** 拆到第三方前端平台會多出一個處理個資的分包商，
   而《隱私權政策》**§5.4（部署環境委外處理者揭露＝O-20）** 正在等這件事的答案。
   MVP 階段沒有理由讓那份清單變長。
2. **同一 region、同一儀表板、同一份帳單。** 前端的所有 API 流量都走 server-side proxy
   （`app/api/backend/[...path]/route.ts`），同一供應商可走內網。
3. **前端在哪都要付一份 Node server 的錢**，拆開並不省。
4. **不為尚未存在的規模預先最佳化。** 前端流量與後端同數量級，沒有獨立擴充的需求。

> 註：即使前端與後端同處一家，**Backend 仍必須有公開位址** —— 素材 `<img src>`
> 由瀏覽器直接連 Backend（§1）。這不影響本節結論，但影響 §6 的網域設計。

---

## 6. 網域與 hostname 策略（§8）

Round 2 已確認：`services/materialMedia.service.js:90` 的 `mediaUrl()` 會把
**含 host 的絕對 URL** 寫進 `cover_image_url` / `detail_images[].image_url` / `demo_video_url`。
因此 host 一旦被寫進資料列就固定下來。

| 方案 | 後果 |
| --- | --- |
| **使用供應商配發的 hostname**（`*.onrender.com` 之類） | 素材 URL 會永久帶著該 host。**日後換自訂網域，既有素材的圖全部失效** —— 除非另做一次資料修補（本輪不規劃、不建議） |
| **一開始就用自訂子網域** | 換供應商時只需改 DNS，資料列不受影響 |

**建議樣式（不代 Owner 決定實際網域）：**

```text
www.<owner-domain>       → Frontend
api.<owner-domain>       → Backend（PUBLIC_BACKEND_URL 指向這裡）
```

```text
Owner must provide/select production domain.
```

**DNS 從第一天就能指向選定的供應商嗎？** 可以。三家都支援自訂網域並自動簽發 TLS 憑證
（Render Hobby workspace 含 2 個自訂網域、Railway Hobby 含 2 個、Fly.io 單一 hostname 憑證前 10 張免費）。
因此**先買網域、先把 `api.` 指過去、再上傳第一筆素材**是可行且必要的順序。

> **這是本輪唯一具有時序性的技術限制：網域必須在第一筆真實素材上傳前定案。**

---

## 7. 成本模型（§9）

只計必要服務：Frontend／Backend／PostgreSQL／持久化 volume。不含推測性規模。

### 7.1 Render

| 項目 | 金額 | 類別 | 驗證狀態 |
| --- | --- | --- | --- |
| Hobby workspace | **$0/月** | 固定 | ✅ 官方 workspace plans 文件 |
| Backend（Starter 0.5 CPU／512 MB） | **$7.00/月** | 固定 | ✅ render.com 來源（定價頁本身為 JS 渲染，無法直接抓取） |
| Frontend（Starter） | **$7.00/月** | 固定 | ✅ 同上 |
| Postgres（Basic-256mb） | **`CURRENT PRICE NOT VERIFIED`** —— Render 自家 2026-07 文章給出「Starter web service ＋ Basic-256mb Postgres 在 Hobby workspace 上約 **$13/月**」，反推約 $6 | 固定 | ⚠️ 僅有合計值 |
| 持久化 disk | **$0.25 / GB / 月** → 目前資料 5.7 MB，配 1–5 GB 約 $0.25–$1.25 | 用量 | ✅ 官方 |
| Postgres 儲存 | **$0.30 / GB / 月** | 用量 | ✅ 官方 |
| 頻寬 | Hobby 含 **5 GB**，超出 **$0.15/GB** | 用量 | ✅ 官方 |

```text
Render 最低實際月費（估算）：約 $21 – $25 / 月
  固定：$7 + $7 + ~$6  ≈ $20
  用量：disk + pg storage + 頻寬  ≈ $1 – $5
```

**Free tier 不可用於本專案：** 官方明文 **Free web services *cannot* 掛持久化 disk**，
且 15 分鐘無流量即 spin down、每 workspace 每月 750 free instance hours。Free Postgres 30 天到期。

### 7.2 Railway

| 項目 | 金額 | 類別 | 驗證狀態 |
| --- | --- | --- | --- |
| Hobby 訂閱 | **$5/月**（含 $5 用量額度，**不累積**） | 固定 | ✅ 官方 |
| 運算 | **約 $20 / vCPU / 月**、**約 $10 / GB RAM / 月**（按秒計費） | 用量 | ✅ 官方 |
| Volume | **約 $0.15 / GB / 月** | 用量 | ✅ 官方 |
| Egress | **$0.05 / GB** | 用量 | ✅ 官方 |
| Hobby volume 上限 | **5 GB**；自訂網域 2 個 | —— | ✅ 官方 |

```text
Railway 最低實際月費（ESTIMATE，全部usage-based）：約 $15 – $25 / 月
  三個 service（Backend / Frontend / Postgres 容器）的記憶體與 CPU 用量決定實際金額。
  這是估算，不是報價 —— Railway 沒有「固定方案」可以直接引用。
```

### 7.3 Fly.io

| 項目 | 金額 | 類別 | 驗證狀態 |
| --- | --- | --- | --- |
| Backend（shared-cpu-1x／512 MB） | **$3.32/月** | 固定 | ✅ 官方 |
| Frontend（shared-cpu-1x／1 GB） | **$5.92/月** | 固定 | ✅ 官方 |
| Volume | **$0.15 / GB / 月**；快照 $0.08/GB/月（每月前 10 GB 免費） | 用量 | ✅ 官方 |
| **Managed Postgres（Basic，Shared-2x／1 GB）** | **$38.00/月** | 固定 | ✅ 官方 |
| MPG 儲存 | **$0.28 / 已配置 GB / 月** | 用量 | ✅ 官方 |
| Egress（亞太） | **$0.04 / GB** | 用量 | ✅ 官方 |

```text
Fly.io 最低實際月費（估算）：約 $48 – $52 / 月
  其中 $38 全部來自 Managed Postgres —— 是三家中唯一沒有低價受管 Postgres 檔位的。
```

---

## 8. PRE-01 比較表（§10）

| Criterion | **Render** | **Railway** | **Fly.io** |
| --- | --- | --- | --- |
| Node Backend | ✅ | ✅ | ✅ |
| Next.js（Node runtime） | ✅ | ✅ | ✅ |
| Persistent volume | ✅ 單 instance、mount path | ✅ 單 service 一顆、**replicas 不可用** | ✅ 綁定單一實體機 |
| Managed PostgreSQL | ✅ **fully managed** | ❌ **自管容器**（total control over configuration and maintenance） | ✅ 受管 ＋ HA failover |
| Custom domain | ✅（Hobby 含 2 個） | ✅（Hobby 含 2 個） | ✅（單一 hostname 憑證前 10 張免費） |
| HTTPS | ✅ | ✅ | ✅ |
| Health check | ✅ | ✅ 部署前輪詢至 200，預設 timeout 300 秒；**不做持續監控** | ✅ |
| Auto restart | ✅ | ✅（重啟策略未於 healthcheck 文件載明） | ✅ |
| Volume backup | ✅ **自動每 24 小時，保留 ≥ 7 天** | ⚠️ **需自行啟用排程**（daily 6 天／weekly 1 月／monthly 3 月） | ✅ 自動每日，預設 5 天（1–60 可設）；官方明言不應作為主要備份 |
| Taiwan/Asia region | ✅ **Singapore** | ✅ **Singapore**（`asia-southeast1-eqsg3a`） | ✅ 亞太多點（含東京／香港／新加坡） |
| Existing code changes | **0** | **0** | **0** |
| Operational complexity | **低** —— DB 由供應商維運 | **中** —— **Postgres 的版本、調校、備份都是 Owner 的事** | **中高** —— volume 官方建議與本 repo 架構衝突（§3） |
| Estimated MVP cost | **≈ $21–25/月** | ≈ $15–25/月（純用量，波動較大） | **≈ $48–52/月** |
| MVP fit | **最高** | 中高 | 中 |

### 排名

```text
#1  Render
#2  Railway
#3  Fly.io
```

**為什麼 Render 第一。** 決定性的不是價格，是**受管資料庫**與**預設就開啟的備份**。
本平台的資料庫裡有付款憑證的稽核軌跡與買家的交付授權；金流是人工核帳，
資料庫壞掉等於「誰付過錢」這件事沒有第二份證據。Render 是三家中唯一同時提供
「fully managed Postgres」與「persistent disk 每 24 小時自動快照、保留至少 7 天」的，
而且**兩者都不需要 Owner 記得去打開**。它的 disk 明文只能掛單一 instance、
且部署時先停後起 —— 這與 §1 的單 instance 前提完全一致，不是限制而是吻合。

**為什麼 Railway 不是第一。** DX 與計費彈性都好，Singapore region 也有，
volume backup 的排程選項甚至比 Render 細緻。但它的 Postgres **不是受管服務** ——
官方文件自己說那是從 image 部署的容器、「你有完整的設定與維運控制權」，
且**沒有內建自動備份**。對一個單人維運的團隊，這等於把資料庫的版本升級、
調校與備份策略全部搬回自己身上，而那正是選 PaaS 想要避免的事。
它排第二而不是被淘汰，是因為只要 Owner 願意接受這份維運責任，其餘條件都合格。

**為什麼 Fly.io 第三。** 兩個獨立理由。其一是成本：Managed Postgres 最低 **$38/月**，
使整體月費約為 Render 的兩倍，而本專案的資料量（5.7 MB 檔案）完全用不到那個檔位。
其二更關鍵：官方明文要求「每個 app 至少配置兩顆 volume」，
而 `LocalPrivateFileStorage` 是單一寫入者、沒有任何複寫機制 ——
本專案在 Fly.io 上**只能**以官方不建議的形態運行。這不是價格問題，是模型不合。

---

## 9. PRE-01 建議（§11）

```text
PRE-01 recommended provider:

Provider:                    Render
Architecture:                PaaS ＋ 掛載持久化 disk ＋ 受管 PostgreSQL，三者同一 region
Frontend:                    Render Web Service（Node runtime，Starter）
Backend:                     Render Web Service（Node runtime，Starter）＋ 掛載 Persistent Disk
Database:                    Render Postgres（受管；Basic 檔位）
Private storage:             Persistent Disk 掛在 PRIVATE_FILE_STORAGE_PATH
                             ＋ PRIVATE_FILE_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true
Backend instances:           1（uploadIdempotencyCache 為 process 內狀態；
                             Render disk 本來就只允許單 instance —— 限制與需求一致）
Production hostname strategy: 自訂子網域，DNS 第一天就指向 Render
                             www.<owner-domain> → Frontend
                             api.<owner-domain> → Backend（PUBLIC_BACKEND_URL）
                             **必須在第一筆素材上傳前定案**
Backup responsibility:       Disk 快照自動（每 24 小時，保留 ≥ 7 天）；
                             Postgres 備份由 Render 受管。
                             **還原演練仍是 Owner 的責任** —— 自動備份不等於驗證過能還原
Estimated MVP monthly infrastructure: 約 $21 – $25 / 月
                             （$7 Backend ＋ $7 Frontend ＋ ~$6 Postgres ＋ 用量）
Code changes required before deployment: 0
                             需要的全部是環境變數與一份部署設定；
                             沒有任何 production code、schema 或 migration 改動

Why this is preferred:       三家中唯一「受管 Postgres ＋ 預設自動 disk 快照」都成立的；
                             region 有 Singapore；成本可預測（固定檔位而非純用量）；
                             其 disk 的單 instance 限制與本 repo 的單 instance 前提吻合。

Why #2 was not selected:     Railway 的 Postgres 不是受管服務，是自管容器且無內建自動備份。
                             對單人維運而言，那把資料庫維運責任搬回 Owner 身上 ——
                             而本平台的資料庫是人工核帳唯一的稽核軌跡。
```

> **不部署。** 本節是建議，不是執行。

---

## 10. O-19 —— 交易郵件供應商

### 10.1 需求重新確認（repo evidence）

`services/emailService.js` 使用 **nodemailer 8.0.7** 的通用 SMTP：

```text
host   = SMTP_HOST
port   = SMTP_PORT || 587
secure = (port === 465)          ← 這一行是本節的關鍵
auth   = { user: SMTP_USER, pass: SMTP_PASS }
from   = SMTP_FROM || SMTP_USER
```

**不需要任何供應商專屬 SDK。** 另需 `PUBLIC_WEB_URL`（信中連結的網域基準）。

現有六封交易信：訂單成立＋付款指示／憑證已送出／付款審核通過／憑證未通過／
教材已上架／**教材需要修改**。目前**沒有**密碼重設、帳號驗證、退款取消信。

> **`secure = (port === 465)` 造成一個實際差異：**
> 選用有 **465（implicit TLS）** 的供應商時，現有這一行會自動把 TLS 打開，**零程式碼改動**；
> 只有 STARTTLS（587）的供應商，在 `REL-03` 補上 `requireTLS: true` 之前，
> 走的是**機會性**加密。本輪不修改任何程式碼，但這項差異列入評分。

### 10.2 候選調查與淘汰

依 §13 至少調查 Resend／Postmark／Brevo／Mailgun，最終最多 3 家。

**Brevo —— 排除，理由如實說明。**
Brevo 確實提供 SMTP，且免費額度（每日 300 封／每月 9,000）在四家中最寬。
但本輪**無法從可取得的官方文件驗證它的 SMTP 具體規格**：
其 SMTP 說明頁回 HTTP 403，定價頁與 free-SMTP 頁為 JavaScript 渲染、抓取後只有標題。
依 §0 的約定與本輪「Do not assume API support means SMTP support — verify SMTP specifically」
的要求，**我不把未經驗證的數字放進比較表**。
次要理由是它的交易郵件包在行銷／CRM 套件內，而本平台沒有任何行銷寄送需求，
多出來的產品面會讓 Privacy §5.3 要揭露的處理範圍變大而無對應好處。
**若 Owner 希望重新納入 Brevo，需要再跑一次針對性查證。**

```text
最終 shortlist：Resend / Postmark / Mailgun
```

### 10.3 逐項查核（全部取自官方文件）

| 查核項 | **Resend** | **Postmark** | **Mailgun** |
| --- | --- | --- | --- |
| SMTP relay | ✅ `smtp.resend.com` | ✅ `smtp.postmarkapp.com` | ✅ `smtp.mailgun.org`（EU：`smtp.eu.mailgun.org`） |
| SMTP 憑證 | user = `resend`，pass = API key | Server API Token 當帳密，或 SMTP Token 的 Access／Secret Key | 網域專屬 SMTP 憑證 |
| 埠與 TLS | **465／2465 = implicit TLS**；25／587／2587 = STARTTLS | **25／2525／587，僅 STARTTLS**（**無 465**） | **465 = 要求 TLS**；25／587／2525 = STARTTLS（官方建議 587） |
| 網域驗證 | ✅ | ✅（需 sender signature 或已驗證網域） | ✅ |
| SPF | ✅ | ✅ | ✅ |
| DKIM | ✅ | ✅ | ✅ |
| DMARC 指引 | ✅ | ✅ | ✅ |
| 寄件人身分 | 已驗證網域 | sender signature／已驗證網域 | 已驗證網域 |
| 交易信定位 | ✅ 專營 | ✅ 專營（交易與 broadcast 分流） | ✅ 專營 |
| 送信紀錄／保留 | Free **30 天**；Pro 保留期 **`CURRENT RETENTION NOT VERIFIED`**。**SMTP 層 debug log 不提供**，但信件仍出現在 dashboard | **45 天** activity retention（所有付費方案內含）；可加購至 365 天（+$5/月起） | **Free／Basic 僅 1 天**；Foundation 5 天；Scale 30 天 |
| 退信處理 | ✅ | ✅「接受所有訊息並記錄 bounce」，需以 webhook／API 取得回饋 | ✅ |
| 免費額度 | **3,000 封/月，且每日上限 100** | **100 封/月** | **每日 100 封**（約 3,000/月），log 保留 1 天 |
| 最低付費 | Pro **$20/月**（50,000 封） | Basic **$15/月**（10,000 封起，超出 $1.80/1,000） | Basic **$15/月**（10,000 封，超出 $1.80/1,000） |
| 台灣可用性 | 未見地區限制 | 未見地區限制 | 未見地區限制；**可選 US 或 EU 區** |
| DPA／分包商文件 | ✅（見 §12） | ✅（見 §12） | ✅（見 §12） |

### 10.4 成本（§16）—— 不虛構使用者數，只比較量級

本平台每筆訂單最多觸發 3 封（成立／憑證收到／審核結果），
每次教材審核 1 封。**MVP 實際量級預期遠低於每月 1,000 封**，
但仍照要求比較三個量級：

| 月寄送量 | **Resend** | **Postmark** | **Mailgun** |
| --- | --- | --- | --- |
| 1,000 封 | **$0**（Free，3,000/月；日上限 100） | **$15**（Free 僅 100/月，不足） | **$0**（Free，100/日；log 僅 1 天） |
| 5,000 封 | **$20**（Pro 50,000） | **$15**（Basic 10,000） | **$15**（Basic 10,000） |
| 10,000 封 | **$20**（Pro 50,000） | **$15**（Basic 10,000） | **$15**（Basic 10,000） |

> **不以免費方案作為推薦依據。** 免費額度只用來判斷「上線前能不能用真實供應商完整演練」。

### 10.5 O-19 比較表（§17）

| Criterion | **Resend** | **Postmark** | **Mailgun** |
| --- | --- | --- | --- |
| Generic SMTP | ✅ | ✅ | ✅ |
| Nodemailer compatible | ✅ **含 465 implicit TLS** | ✅ **僅 STARTTLS** | ✅ **含 465** |
| SPF | ✅ | ✅ | ✅ |
| DKIM | ✅ | ✅ | ✅ |
| DMARC support/docs | ✅ | ✅ | ✅ |
| Delivery logs | ✅ dashboard；**SMTP 層 debug log 無** | ✅ **45 天**內含 | ⚠️ **Basic 僅 1 天** |
| Domain verification | ✅ | ✅ | ✅ |
| DPA/privacy docs | ✅ DPA ＋ 分包商頁 ＋ 隱私政策 | ✅ DPA ＋ 分包商頁 | ✅ DPA（需簽署）＋ Annex 3 分包商 |
| 1k email cost | **$0** | $15 | **$0** |
| 5k email cost | $20 | **$15** | **$15** |
| 10k email cost | $20 | **$15** | **$15** |
| Code changes | **0** | **0**（但要保證 TLS 需等 `REL-03`） | **0** |
| Operational complexity | 低 | 低 | 低 |
| MVP fit | **最高** | 高 | 中 |

### 排名

```text
#1  Resend
#2  Postmark
#3  Mailgun
```

**為什麼 Resend 第一。** 它是唯一同時滿足三件事的：
（a）**有 465 implicit TLS**，現有那行 `secure = (port === 465)` 會自動開啟 TLS，
**零程式碼改動、也不必等 `REL-03` 落地**；
（b）**送信紀錄保留至少 30 天**（Free 層即如此），足以回答「三天前那封付款指示到底寄出去沒有」——
這對人工轉帳的平台是實際的營運需求，因為信沒到就等於訂單卡住；
（c）**免費額度 3,000 封/月**足以在上線前用真實供應商完整演練，付費升級一步到位（$20／50,000 封），
不會因為量成長而需要重新決策。

**為什麼 Postmark 不是第一。** 這是接近的第二名，而且在一項上明確更好：
**45 天 activity retention，$15/月內含**，比 Resend 更適合事後查證。
沒有選它的唯一理由是 TLS 姿態：官方 SMTP 文件只列 25／2525／587，**沒有 465**，
因此在 `REL-03` 補上 `requireTLS: true` 之前，現有設定走的是機會性 STARTTLS。
另外它的免費額度只有 100 封/月，上線前無法用真實供應商做完整演練。
**若 Owner 把「供應商端紀錄保留期」看得比「立即保證 TLS」更重，Postmark 是正確選擇** ——
兩者差距不大，這一項由 Owner 定調是合理的。

**為什麼 Mailgun 第三。** TLS 條件與 Resend 相同（有 465），價格也具競爭力，
但 **Free 與 Basic 都只保留 1 天的 log**。本平台自身的郵件可觀測性只有
`console.error` 加 `activity_logs` 的 `order_email_sent`／`order_email_failed`（`REL-02`），
供應商端只留 1 天，等於失去事後查證能力；要拿到 5 天得跳到 $35/月。

### 10.6 O-19 建議（§18）

```text
O-19 recommended provider:

Provider:                    Resend（法人：Plus Five Five, Inc.）
Integration:                 沿用現有 nodemailer 通用 SMTP，不引入任何 SDK
SMTP port/TLS approach:      SMTP_PORT=465（implicit TLS）
                             → 現有的 secure = (port === 465) 會自動生效，零程式碼改動
                             host = smtp.resend.com
                             SMTP_USER = resend
                             SMTP_PASS = Resend API key（放 git-ignored 的 .env／部署環境）
Sending-domain strategy:     使用 Owner 的自訂網域（與 §6 的 production 網域一致）
SMTP_FROM strategy:          該網域下的固定寄件位址（例如 no-reply@<owner-domain>）
                             —— 實際位址由 Owner 決定，本輪不代選
DNS required:                寄件網域上的 SPF（TXT）、DKIM（Resend 產生的記錄）、
                             建議再加 DMARC（TXT）。實際值由 Resend 主控台產生
Code changes required:       0
REL-03 after selection:      解除阻擋。選 465 之後 TLS 已由現有程式碼保證，
                             因此 REL-03 的重點回到它原本的目的 ——
                             讓「SMTP 設定根本沒填」在部署當下就顯現，而不是靜默不寄信
Privacy §5.3 factual input:  見 §12（法人名稱、服務、隱私政策／DPA／分包商 URL、資料所在地）
                             LEGAL SUFFICIENCY → LAWYER REVIEW
Estimated MVP email cost:    $0/月（Free：3,000 封/月，日上限 100）
                             → $20/月（Pro：50,000 封/月）
                             建議上線後即採 Pro，避免上線期撞到每日 100 封上限

Why this is preferred:       唯一同時具備 465 implicit TLS（零改動即保證 TLS）、
                             ≥30 天送信紀錄、以及足以做上線前完整演練的免費額度。

Why #2 was not selected:     Postmark 的 45 天保留期更好，但只支援 STARTTLS，
                             在 REL-03 落地前現有設定無法保證 TLS；
                             且免費額度僅 100 封/月，無法用真實供應商演練。
                             兩者差距小 —— 若 Owner 更重視紀錄保留期，改選 Postmark 是合理的。
```

> **不設定它。** 本節是建議，不是執行。

---

## 11. OPS-01 —— production 資料庫的起始狀態（§19／§20）

**本輪未修改任何資料庫。以下全部為唯讀彙總，未取用任何個人資料。**

### 11.1 兩個現有資料庫的內容體檢

| 量測 | `teaching_platform`（dev） | `teaching_platform_security_test` |
| --- | ---: | ---: |
| 使用者總數 | 217 | 958 |
| **其中 email 屬明顯合成網域**（`example.*`／`test`／`seed`／`fixture`／`invalid` 等） | **215** | **956** |
| **admin 帳號** | **50** | **63** |
| teacher / buyer | 105 / 62 | 556 / 339 |
| 教材總數 | 101 | 503 |
| 其中 `published` | 93 | 326 |
| **有 `approved_file_id`（真的交付得出東西）** | **2** | 271 |
| 訂單總數 | 103 | 391 |
| legacy `pending_payment`（`payment_due_at IS NULL`） | 48 | 179 |
| 付款憑證列 | 96 | 430 |
| 憑證 `storage_status = legacy_public` | **0** | **0** |
| 憑證 `storage_status = legacy_external` | 79 | 79 |
| 評價（`review`） | 39 | 153 |
| `activity_logs` | 944 | 6,345 |
| **`legal_documents`** | **0** | **0** |
| **`consent_records`** | **0** | **0** |
| 檢舉（`reports`） | 45 | —— |

### 11.2 三個選項的營運後果

**A. Production 從空資料庫開始**

* 上線當天 legacy `pending_payment` = **0**；付款期限政策從第一筆訂單起就適用
  （切換時點已由 Round 2 證明：無期限訂單止於 `2026-08-26T15:12Z`，有期限訂單始於同日 `15:42Z`）。
* provisioning 路徑已由 **`PRE-05`** 端到端驗證（全新庫 smoke 73/73 全過）。
* 需要以正當流程建立的東西見 §11.4。
* 代價：沒有任何既有目錄可展示 —— 但那些目錄本來就不是真實商品（見下）。

**B. 匯入 dev 資料** —— **不建議，且有多項硬性問題**

1. **50 個 admin 帳號。** CLAUDE.md §3 明訂 admin **只能**由維運 CLI 建立、
   公開註冊帶 `role:"admin"` 一律 403。匯入等於一次性繞過這道控制，
   在 production 造成 50 個未經稽核的平台管理權限。
2. **215/217 是合成帳號。** 這些不是真實使用者。匯入等於在 production 建立
   假的創作者與買家，並為從未同意過任何條款的「人」建立個資紀錄。
3. **93 個 published 教材中只有 2 個有 `approved_file_id`。**
   依 CLAUDE.md 的第四條不變條件，沒有 `approved_file_id` 的教材不得成為可購買的付費商品，
   `POST /cart/items` 與 `POST /orders` 都會回 409。
   換句話說**匯入後的目錄有 91 個上架但買不了的商品**。
4. **`consent_records` = 0。** 匯入的每一個使用者都會處於「存在但零同意紀錄」的狀態，
   而平台的法律文件尚未發布（`legal_documents` = 0）。這是把一個同意缺口預先寫進 production。
5. **39 筆評價是測試資料。** 對外顯示的商品評價若來自 fixture，是對消費者的不實陳述。
6. **付款憑證與教材檔案是磁碟上的實體檔。** 匯入資料列而不搬檔會得到一批指向不存在檔案的憑證；
   搬了檔則是把測試用的金融性影像放進 production。
7. `legal_documents` = 0，本來就沒有東西可匯。

**C. 匯入 security-test 資料** —— **同上，且更嚴重**。
958 個帳號、63 個 admin、6,345 筆稽核紀錄，且其中相當比例是本月各輪驗證跑出來的
（Round 2 已證明 179 筆 legacy 訂單中有 129 筆建立於 2026-08）。
它是測試資料庫，內容隨測試變動，**本質上不是可搬遷的業務資料**。

### 11.3 建議

```text
Recommended production starting state:
FRESH DB
```

**理由（依嚴重度排序）：**
1. 匯入會一次建立 50–63 個未經稽核的 admin，直接違反 repo 唯一的 admin 建立控制。
2. 99% 以上的帳號是合成的；匯入等於在 production 製造不存在的人及其個資。
3. 匯入後的商品目錄有九成上架但交付不出東西（`approved_file_id` 缺）。
4. 所有使用者都會處於零 consent 狀態，而法律文件尚未發布。
5. 全新 provisioning 路徑**已經被 `PRE-05` 驗證過**，不是未知風險。

### 11.4 改以正當流程建立的東西（**本輪不建立**）

```text
initial Admin            npm run create-admin --prefix Backend
                         （role 硬編碼、密碼下限 16 字元；不得經由公開註冊）
approved launch materials 創作者正常註冊 → 上傳教材本體 → 送審 →
                         Admin 核准（approved_file_id 只有核准流程會寫）
legal documents          僅在律師核准後，經 OPS-05 的 dry-run preflight 與 Admin API 發布
                         （目前仍 BLOCKED —— PRE-03 / P1-09）
configuration            JWT_SECRET / PAYMENT_BANK_*（四值）/ SMTP_* /
                         PRIVATE_FILE_STORAGE_PATH ＋ ALLOW_LOCAL_IN_PRODUCTION /
                         PUBLIC_BACKEND_URL / PUBLIC_WEB_URL / NODE_ENV=production
```

### 11.5 OPS-01 的後果

```text
If Production = Fresh DB, does OPS-01 remain an MVP launch blocker?

NO.
```

全新資料庫上 legacy `pending_payment` = 0，母體不存在；
且付款期限政策對**每一筆**新訂單都生效（切換時點已證明無漏網）。
`OPS-01` 因此降級為**文件性收尾**：記錄「production 從空庫開始，故無 legacy 母體」並關閉，
不需要任何資料處置、不需要新的期限揭露，
連帶也**不觸發**任何 `BLOCKED BY PRE-03 / P1-09` 的消費者權益問題。

> **附帶效果：`PRE-02` 也同步簡化。** 其目標是「`legacy_public` 歸零」，
> 而全新資料庫上該值由建構上就是 0（實測兩個現有資料庫也已經是 0，
> 剩下的 79 筆是 `legacy_external`，屬不同類別）。

---

## 12. 法律事實輸入（§15）—— 提供給律師的事實，非法律判斷

```text
LEGAL SUFFICIENCY → LAWYER REVIEW
```

**本節不判斷任何條款是否合乎法規、是否足夠。** 僅提供 Privacy §5.3 所需的事實欄位。

| 欄位 | **Resend**（建議） | **Postmark**（次選） | **Mailgun**（第三） |
| --- | --- | --- | --- |
| 法人名稱 | **Plus Five Five, Inc.**（以 "Resend" 營運） | **AC PM LLC** | **Sinch Email**（Sinch 之 Developer & Email 事業單位，旗下含 Mailgun／Mailjet 等品牌） |
| 使用的服務 | 交易郵件寄送（SMTP relay） | 交易郵件寄送（SMTP relay） | 交易郵件寄送（SMTP relay） |
| 隱私政策 URL | `https://resend.com/legal/privacy-policy`（最後更新 **2026-08-27**） | 見 `https://postmarkapp.com/eu-privacy` | 見 Mailgun 法律頁 |
| DPA URL | `https://resend.com/legal/dpa` | `https://postmarkapp.com/dpa` | `https://www.mailgun.com/legal/dpa/` |
| DPA 接受方式 | 隨 Terms of Service 生效，**無需另行簽署** | 2024-12-10 起之新客戶：**繼續使用即視為接受** | **文件末附雙方簽章欄位** |
| 分包商清單 URL | `https://resend.com/legal/subprocessors`（新增／替換前 **14 天**書面通知，可提出異議） | `https://postmarkapp.com/eu-privacy#sub-processors`（可訂閱通知；異議期 **7 天**） | DPA **Annex 3**（列有 Google Cloud、Rackspace/AWS、MacStadium、Cyxtera 等） |
| 資料所在地 | **主要處理作業位於美國**；DPA 納入 Standard Contractual Clauses 規範 EEA／UK／瑞士以外之傳輸 | 主要託管於 **AWS** 與 **Deft**（原 ServerCentral） | **可選區域**：Google Cloud 之「德國與比利時（歐洲客戶）」或「美國（美洲客戶）」；AWS/Rackspace 客戶為美國 |

> **給律師的提醒（事實層面）：** 三家的資料所在地不同，且 Mailgun 明確提供歐洲區選項。
> 「哪一種資料所在地與傳輸機制對本平台是適當的」屬法律認定，**本文件不作判斷**。

---

## 13. 預估 MVP 營運成本彙總（§25 G）

```text
hosting / database / storage     Render     約 $21 – $25 / 月
                                 （$7 Backend ＋ $7 Frontend ＋ ~$6 Postgres
                                   ＋ disk $0.25/GB ＋ pg storage $0.30/GB
                                   ＋ 頻寬 5 GB 內含、超出 $0.15/GB）
                                 註：Postgres Basic-256mb 單項為 CURRENT PRICE NOT VERIFIED；
                                     Render 官方文章給的是「Starter ＋ Basic-256mb ≈ $13/月」合計值

email                            Resend     $0 / 月（Free：3,000 封/月，日上限 100）
                                            → $20 / 月（Pro：50,000 封/月，建議上線即採用）

domain                           Owner must provide/select production domain.
                                 註冊費用取決於 Owner 選定的網域與註冊商，
                                 本輪未查證任何註冊商報價 → CURRENT PRICE NOT VERIFIED
```

```text
合計（不含網域）：約 $21 – $45 / 月
  下限 = Render ＋ Resend Free
  上限 = Render 上緣 ＋ Resend Pro
```

---

## 14. Owner 核准之後會發生什麼（§22）—— 已對照 repo 驗證，非照抄

| 若 Owner 拍板 | 解除的後續工作 | 驗證 |
| --- | --- | --- |
| **PRE-01** | ① 部署設定 ticket（repo 目前**完全沒有**任何部署設定 —— 本輪再次確認 `Dockerfile`／`render.yaml` 等皆不存在）<br>② 備份／還原 runbook（`docs/db-backup-and-migration.md` 目前只寫本機情境）<br>③ **O-20** 取得 Privacy §5.4 所需事實<br>④ **`PRE-02`** 解除阻擋（其執行環境依賴 production）<br>⑤ **`REL-02` 風險評級定案**（依平台是否自動重啟） | ✅ 與 repo 一致；④⑤為 expected map 未列、但確實存在的下游 |
| **O-19** | ① SMTP 設定（五個變數）＋ `npm run smtp:check --prefix Backend` 驗證<br>② **`REL-03`** 解除阻擋（tracker 現況即為 `BLOCKED ON O-19`）<br>③ **Privacy §5.3** 取得事實輸入 | ✅ 與 tracker 一致 |
| **Production = Fresh DB** | ① **`OPS-01` 移出 MVP launch blocker**，改為文件性關閉<br>② provisioning 走 **`PRE-05`** 已驗證的路徑（全新庫 smoke 73/73）<br>③ 以正當流程建立 initial Admin／上架教材／設定（§11.4）<br>④ **`PRE-02` 同步簡化**（`legacy_public` 由建構上即為 0） | ✅ 與 `PRE-05` 報告一致；④為 expected map 未列的附帶效果 |

> **對 expected map 的兩處補充**（本輪查證所得，非照抄）：
> `PRE-01` 另外解除 `PRE-02` 與 `REL-02` 的風險評級；
> 「Production = Fresh DB」另外簡化 `PRE-02`。原 map 未列這兩條。

---

## 15. Owner Decision Card（§21）

```text
OWNER DECISION REQUIRED

PRE-01
Recommended:   Render（PaaS ＋ Persistent Disk ＋ 受管 Postgres，Singapore region，
               Frontend/Backend/DB 同一家；單一 Backend instance；約 $21–25/月；零程式碼改動）
Alternative:   Railway（同樣可行、可能略便宜，但 Postgres 是自管容器且無內建自動備份）
Owner chooses: ______________________

O-19
Recommended:   Resend（smtp.resend.com，SMTP_PORT=465 implicit TLS → 現有程式碼零改動即保證 TLS；
               Free 3,000 封/月可做上線前演練，Pro $20/月 50,000 封）
Alternative:   Postmark（$15/月含 10,000 封、45 天紀錄保留更佳，但僅 STARTTLS，
               保證 TLS 須等 REL-03）
Owner chooses: ______________________

Production DB
Recommended:   FRESH DB（全新空資料庫，走 PRE-05 已驗證的 provisioning 路徑）
Alternative:   匯入現有 dev 資料（**不建議** —— 會帶進 50 個 admin 帳號、
               215/217 個合成帳號、91 個上架但交付不出的教材、零 consent 紀錄）
Owner chooses: ______________________

OPS-01 consequence:
若 Production = FRESH DB → OPS-01 不再是 MVP launch blocker（legacy 母體 = 0），
降級為文件性關閉；且不觸發任何 BLOCKED BY PRE-03 / P1-09 的消費者權益問題。

另需 Owner 提供：production 網域（www. 與 api. 兩個子網域）。
必須在第一筆真實素材上傳前定案 —— 素材 URL 會連 host 一起寫進資料列。
```

---

## 16. 本輪未做的事（scope proof）

```text
部署：                 NO
SMTP 設定：            NO
註冊任何服務：         NO
建立 production DB：   NO
匯入資料：             NO
啟動 REL-03：          NO
啟動 PRE-06 / OPS-06： NO
發布法律文件：         NO
production code：      未修改
schema / migration：   未修改
legal wording：        未修改
push / PR / merge：    未執行
```

資料庫存取一律唯讀（`information_schema`／`pg_catalog`／`SELECT` 彙總），
未輸出任何個人資料、密碼或含憑證的連線字串。

---

## 17. 官方來源（research date = 2026-08-31）

**部署**

* Railway — Volumes：`https://docs.railway.com/reference/volumes`
* Railway — Backups：`https://docs.railway.com/reference/backups`
* Railway — Pricing：`https://railway.com/pricing`
* Railway — Regions：`https://docs.railway.com/reference/regions`
* Railway — Healthchecks：`https://docs.railway.com/guides/healthchecks`
* Railway — PostgreSQL：`https://docs.railway.com/guides/postgresql`
* Render — Persistent Disks：`https://render.com/docs/disks`
* Render — Regions：`https://render.com/docs/regions`
* Render — Workspace plans：`https://render.com/docs/new-workspace-plans`
* Render — Instance types：`https://render.com/docs/compute-plans`
* Render — Free tier limits：`https://render.com/docs/free`
* Render — 成本說明文章（2026-07）：`https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses`
* Render — Pricing：`https://render.com/pricing`（**JS 渲染，無法直接抓取**）
* Fly.io — Volumes：`https://fly.io/docs/volumes/overview/`
* Fly.io — Pricing：`https://fly.io/docs/about/pricing/`
* Fly.io — Managed Postgres：`https://fly.io/docs/mpg/overview/`
* DigitalOcean — App Platform limits：`https://docs.digitalocean.com/products/app-platform/details/limits/`

**郵件**

* Resend — Pricing：`https://resend.com/pricing`
* Resend — Send with SMTP：`https://resend.com/docs/send-with-smtp`
* Resend — DPA：`https://resend.com/legal/dpa`
* Resend — Subprocessors：`https://resend.com/legal/subprocessors`
* Resend — Privacy Policy：`https://resend.com/legal/privacy-policy`
* Postmark — Pricing：`https://postmarkapp.com/pricing`
* Postmark — Send email with SMTP：`https://postmarkapp.com/developer/user-guide/send-email-with-smtp`
* Postmark — DPA：`https://postmarkapp.com/dpa`
* Postmark — Subprocessors：`https://postmarkapp.com/eu-privacy#sub-processors`
* Mailgun — Pricing：`https://www.mailgun.com/pricing/`
* Mailgun — SMTP relay：`https://documentation.mailgun.com/docs/mailgun/user-manual/smtp-protocol/smtp-relay`
* Mailgun — DPA：`https://www.mailgun.com/legal/dpa/`
* Brevo — Pricing：`https://www.brevo.com/pricing/`（**JS 渲染／SMTP 說明頁 403，未能驗證，故未納入 shortlist**）
