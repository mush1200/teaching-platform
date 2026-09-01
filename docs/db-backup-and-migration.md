# 資料庫備份與跨電腦搬遷（PostgreSQL）

本文件提供教學平台專案在 Windows + PowerShell 環境下的資料庫備份與還原流程，目標是：

- 在 A 電腦完整匯出目前資料庫
- 將備份檔帶到 B 電腦
- 在 B 電腦快速還原並可繼續開發

---

## 1. 事前確認

請先確認目前專案的 DB 連線方式（`Backend/config/db.js`）：

- 優先使用 `DATABASE_URL`
- 若沒有，則使用：
  - `PGHOST`
  - `PGPORT`
  - `PGUSER`
  - `PGPASSWORD`
  - `PGDATABASE`

---

## 2. 在 A 電腦備份資料庫

### 2.1 設定連線資訊（PowerShell）

```powershell
$env:PGHOST="localhost"
$env:PGPORT="5432"
$env:PGUSER="postgres"
$env:PGPASSWORD="你的密碼"
$env:PGDATABASE="teaching_platform"
```

> 若你是使用 `DATABASE_URL`，可改設：
>
> ```powershell
> $env:DATABASE_URL="postgres://user:password@localhost:5432/teaching_platform"
> ```

### 2.2 匯出 SQL 備份檔（plain SQL）

```powershell
$backupFile = "C:\teaching-platform\backup_$(Get-Date -Format yyyyMMdd_HHmmss).sql"
pg_dump -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE -F p -f $backupFile
```

若使用 `DATABASE_URL`：

```powershell
$backupFile = "C:\teaching-platform\backup_$(Get-Date -Format yyyyMMdd_HHmmss).sql"
pg_dump $env:DATABASE_URL -F p -f $backupFile
```

---

## 3. 搬移到 B 電腦

請至少帶這些檔案：

- 專案程式碼（Git clone 或壓縮包）
- 備份檔（例如 `backup_20260501_015200.sql`）
- 專案 DB 環境設定（`.env` 內容或等效環境變數）

---

## 4. 在 B 電腦還原資料庫

### 4.1 建立目標資料庫（若尚未建立）

```powershell
$env:PGHOST="localhost"
$env:PGPORT="5432"
$env:PGUSER="postgres"
$env:PGPASSWORD="你的密碼"
$targetDb="teaching_platform"

createdb -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER $targetDb
```

### 4.2 匯入 SQL 備份

```powershell
$backupFile="C:\path\to\backup_20260501_015200.sql"
psql -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d teaching_platform -f $backupFile
```

---

## 5. 驗證還原是否成功

```powershell
psql -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d teaching_platform -c "SELECT COUNT(*) FROM materials;"
```

接著啟動後端並檢查健康狀態：

```powershell
cd C:\teaching-platform\Backend
npm install
npm run dev
```

打開：

- `http://localhost:3000/health`

若回傳 `{ "status": "ok" }`，代表 DB 與 API 通常已可正常使用。

---

## 6. 常見問題

- `pg_dump` / `psql` 指令找不到  
  - 安裝 PostgreSQL client，並確認 `bin` 在 `PATH`
- `password authentication failed`  
  - 檢查 `PGUSER` / `PGPASSWORD` 是否正確
- `database does not exist`  
  - 先執行 `createdb` 建立目標 DB 再匯入
- 權限不足（permission denied）  
  - 使用有建立資料庫與寫入權限的 DB 使用者

---

## 7. 建議操作習慣

- 備份檔建議放在專案外部或受控路徑（避免誤提交大型 SQL）
- 若備份內容含個資，請加密後再跨機傳輸
- 還原後先跑一次關鍵 API smoke test 再開始開發

---

# 8. Production（NT$0 MVP）備份與還原 —— `PRE-08`

> **本章適用於 NT$0 MVP 部署**（`DEC-16` / `DEC-17`，見
> `docs/mvp-nt0-deployment-decision-2026-08-31.md`）：
> PostgreSQL ＝ **Neon Free**、私有檔案 ＝ **Backblaze B2**（S3-compatible）。
> 上面第 1～7 章是本機跨電腦搬遷的流程，**不適用 production**。
>
> 本章的每一條供應商行為都取自官方文件（查證日期 2026-08-31），不是推論。

## 8.1 為什麼 production 必須手動備份

| 供應商 | 內建能力 | 缺口 |
| --- | --- | --- |
| **Neon Free** | instant restore（PITR）**僅 6 小時**、上限 1 GB 變更歷史；**1 個 manual snapshot**；**無 automated backup** | **6 小時撐不過一個週末。** 週五誤刪、週一才發現＝已超出還原視窗 |
| **Backblaze B2** | 預設 lifecycle「Keep all versions」；`DeleteObject` 不帶 `versionId` 只插入 delete marker | 版本歷史保護的是**誤刪**，**不保護帳號層級的災難**（帳號關閉、key 遺失、供應商故障） |

**結論：`pg_dump` 不是選配，是 NT$0 方案的主要備份手段。**
B2 側則相反：預設設定已覆蓋最可能的風險，額外的離線副本是次要保險。

## 8.2 每次備份的固定順序（**順序不可顛倒**）

```text
1. pg_dump  ── 先做資料庫
2. b2 sync  ── 再做檔案
```

理由是 referential 方向：`material_files.storage_key` 等欄位指向物件。
先 dump 資料庫、後同步檔案，兩者之間新產生的物件只會變成**副本裡多出來的孤兒物件**（無害）；
反過來則會得到**指向尚未同步物件的 dangling storage_key**（還原後買家點下載會失敗）。

## 8.3 資料庫備份（Neon → 本機）

```bash
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="backup-$(date +%Y-%m-%d).dump"
```

* `--format=custom` 才能用 `pg_restore` 做選擇性還原。
* `DATABASE_URL` 直接用 Neon 給的字串（含 `?sslmode=require`）。**不要**把它寫進任何檔案。
* **`pg_dump` 版本必須 ≥ Neon 的 server 版本**，否則會拒絕執行。先用
  `psql "$DATABASE_URL" -c "select version()"` 確認。
* 備份檔**存放在專案目錄之外**（與第 7 章同一條規則），且**內含全部個資** ——
  保存期限、加密與銷毀方式屬 `O-20` 的範圍。

**頻率建議（10 人封閉測試）：** 每個測試日結束時一次，加上任何 migration 之前一次。
不需要排程器；這個規模下手動執行比維護一個 cron 更不容易出錯。

## 8.4 私有檔案備份（B2 → 本機）

**首選是「不要動預設值」。** B2 新建 bucket 的預設 lifecycle 就是
**「Keep all versions」**，而本 repo 的 `delete()` **不送 `versionId`**
（`Backend/storage/s3PrivateFileStorage.js`），因此每一次刪除都只是插入 delete marker，
**前一個版本仍在、仍可復原**。這是誤刪的主要防線，成本為零。

```text
必須維持：  lifecycle ＝ Keep all versions        ← 不要設任何會過期舊版本的規則
必須避免：  Object Lock                           ← 免費，但啟用後無法關閉，
                                                    且會擋掉上傳 rollback 與 cleanupOrphans
                                                    這兩條合法刪除路徑
必須設定：  每日 data cap（storage / download / transactions）
                                                    ← NT$0 保證的來源
app key：   scope 限定單一 bucket、Read & Write，不使用 master key
```

離線副本（**增量**，第一次全量之後每次只傳差異）：

```bash
aws s3 sync s3://<bucket> ./b2-backup --endpoint-url https://s3.<region>.backblazeb2.com
```

> ⚠️ **egress 預算**：B2 免費 egress ＝ 3× 平均月儲存量。第一次全量同步約等於一份完整資料量，
> 之後的增量很小。**不要用非增量的方式重複下載整個 bucket**，那會直接吃掉整月額度。

## 8.5 還原演練（部署後必做，`PRE-08` 的 gate）

> **絕對不對 production 執行。** 全程使用臨時資料庫，並在任何破壞性動作前
> 先做 `current_database()` assertion（CLAUDE.md §4）。

### 8.5.1 資料庫

```text
production DB ──pg_dump──► backup.dump
                              │
            建立臨時 DB ◄─────┘
      teaching_platform_restore_drill
                              │
                        pg_restore
                              │
                           驗證：
                             - 26 張表全部存在
                             - users / orders / order_items 筆數與來源一致
                             - manual_payment_proofs 筆數與來源一致
                             - activity_logs.id 型別為 text（SCHEMA-01）
                             - 每一筆 storage_key 都能在 B2 找到對應物件
                              │
                         dropdb（演練結束）
```

```bash
createdb teaching_platform_restore_drill
pg_restore --no-owner --no-privileges --dbname=teaching_platform_restore_drill backup-YYYY-MM-DD.dump
```

`storage_key` 對照可直接沿用 `PRE-13` 驗證時用過的形狀：把每一筆
`material_files` / `manual_payment_proofs` / `material_media_files` 的 `storage_key`
逐一 `HeadObject`，並與 DB 的 `checksum_sha256` 比對。
**這一步是關鍵** —— 資料庫還原成功但物件對不上，等同資料遺失。

### 8.5.2 物件儲存

```text
put   drill/<uuid>（測試物件，刻意不用四個正式 namespace）
  ↓
delete（不帶 versionId）
  ↓
list-object-versions --prefix drill/   → 應看到 delete marker ＋ 前一版本
  ↓
get-object --version-id <前一版本>
  ↓
checksum 比對，必須與上傳前完全一致
  ↓
清理：對兩個版本各自帶 versionId 永久刪除
```

```bash
aws s3api list-object-versions --bucket <bucket> --prefix drill/ --endpoint-url https://s3.<region>.backblazeb2.com
```

B2 的 S3-compatible API 支援 `ListObjectVersions`（`?versions=null`），
因此整個流程可以只用 `aws` CLI 完成，不需要 B2 專屬工具。

**若演練發現版本無法復原**，代表 bucket 的 lifecycle 不是預設值 ——
回頭確認 §8.4 的「必須維持」那一條，**不要**改程式碼。

## 8.6 這套策略沒有涵蓋的事

```text
✗ 自動化      —— 全部手動。10 人規模下這是刻意的取捨，不是疏漏
✗ 異地備援    —— 備份檔在 Owner 的機器上，機器壞掉就沒了。
                 若要更穩，複製一份到另一個實體位置（不需付費服務）
✗ 連續資料保護 —— 兩次備份之間的資料在災難中會遺失
✗ 帳號層級災難 —— Neon 專案刪除有 7 天復原期；B2 帳號關閉則無
```
