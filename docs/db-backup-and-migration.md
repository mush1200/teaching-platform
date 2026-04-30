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
