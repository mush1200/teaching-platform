# `PRE-18` 外部答覆 intake 與 answer-to-implementation 對照

> **內部工程文件。** 這份不會寄給任何專業人士 —— 它是**答覆回來之後**用的：
> 把每一個答案接到「要改哪裡、哪一道閘門因此開啟」。
>
> **本文件不含任何法律／稅務／會計結論。** 下方「可能答案」欄位列的是
> **工程端已知做得到的實作路徑**，不是對答案的預測，更不是建議。

建立於 2026-09-29。外部問題的 canonical 登記簿仍是 **`PRE-03` ／ `T-*` ／ `L-*`**
（連同 `AD-09`～`AD-13`），本文件**不另立編號**。

---

## 1. 目前狀態

| 項目 | 值 |
| --- | --- |
| `PRE-18` | **OPEN** |
| 技術就緒 | **PASS** |
| `SETTLEMENT_WRITE_ENABLED` | **OFF** |
| 律師包 | **READY TO SEND** |
| 會計師包 | **READY TO SEND** |
| Neon production region | **VERIFIED —— AWS Singapore**（`PRE-07` STEP 2，2026-09-01） |
| B2 production region／endpoint | **UNVERIFIED**（見 §2） |

---

## 2. B2 事實狀態 —— 為什麼仍是 UNVERIFIED，以及如何關掉它

**已查證**（2026-09-29）：

- `render.yaml` 將 `PRIVATE_FILE_STORAGE_S3_ENDPOINT` 與
  `PRIVATE_FILE_STORAGE_S3_REGION` 宣告為 **`sync: false`** —— 值設於 Render dashboard，**不在 repo**；
- 本機環境**未設定**這兩個變數（即使設定了也是 dev 值，**不構成 production 證據**）；
- repo 全文**沒有**任何 `s3.<region>.backblazeb2.com` 形式的實際 endpoint 紀錄；
- 既有的「位於美國」記載（`review-handoff.md` O-20、tracker `DEC-16`）為
  **歷史／canonical 紀錄**，未經本輪第一手驗證；
- ⚠️ **既有的 `Backend/scripts/check-production-storage.js` 也不會印出 endpoint 或 region** ——
  它檢查 driver、bucket 可達性、versioning、Object Lock、公開存取，**但不揭露位置**。
  因此**跑那支腳本並不能關掉這個未知數**。

**要關掉它，只有兩條路（皆需 Owner 操作）**：

1. 於 Render dashboard 讀出 `PRIVATE_FILE_STORAGE_S3_ENDPOINT` 與
   `PRIVATE_FILE_STORAGE_S3_REGION` 的值（**endpoint／region 不是 secret，
   但同一頁面上的 access key／secret 是 —— 請勿一併複製**）；
2. 或於 Backblaze console 讀出該 bucket 的 region 與其對應國家。

取得後請記錄：**exact region、可判定時的 destination country、證據來源、驗證日期**。
**不要記錄任何金鑰值。**

> **在此之前，律師包維持「不主張 B2 目前所在國家」的寫法。**
> 這是刻意的：把未經查核的舊紀錄當成事實送給律師，
> 正好會污染他們被問到的那個問題本身。

---

## 3. 答覆 intake 矩陣

「可先進行？」三欄的判準是：**在該答案回來之前做這件事，是否會產生事後無法無痛修正的後果。**

| # | 外部議題 | 包別 | 題號 | 決定者 | 狀態 | 預期答案型態 | 影響的既有項目 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **`AD-09`** 收款資料 | 律師 | §1.3 Q1–Q13 | 律師（隱私／個資）＋ Owner | **OPEN** | 欄位清單 ＋ 保護要求 ＋ 保存期間 ＋ 揭露位置 | `L-21`／`L-22`、`privacy`、`creator_agreement` |
| 2 | **`AD-10` 法律面** | 律師 | §2.2 Q1–Q7 | **律師 ＋ 會計師會同** | **OPEN** | 交易地位認定 ＋ 發票開立人 ＋ 揭露用語 | **`PRE-03`**（上位問題）、`terms`、`creator_agreement` |
| 3 | **`AD-10` 會計面** | 會計師 | §3.2 Q1–Q6 | **會計師 ＋ 律師會同** | **OPEN** | 總額／淨額法 ＋ 科目 ＋ 認列時點 | `PRE-03`、`T-*` |
| 4 | **稅務／扣繳** | 會計師 | §2.2 Q1–Q13 | 會計師 | **OPEN** | 是否扣繳 ＋ 身分別差異 ＋ gross／net 語意 ＋ 憑證義務 | **`T-01`～`T-15`**、`creator_agreement` |
| 5 | **`O19` 法律面** | 律師 | §3.2 Q1–Q6 | 律師 | **OPEN**（潛在） | 所有權歸屬 ＋ 退款義務 ＋ 時效／無主財產 | `DEC-37`（不得預設處置） |
| 6 | **`O19` 會計面** | 會計師 | §4.2 Q1–Q4 | 會計師 | **OPEN**（潛在） | 科目分類 ＋ 長期處理 ＋ 保存年限 | `DEC-37` |

### 3.1 各議題的影響面與可先進行範圍

| # | schema 影響 | service 影響 | UI 影響 | 法律文件影響 | 閘門影響 | code 可先進行？ | 結算寫入可先進行？ | 撥款執行可先進行？ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 `AD-09` | **新表**（收款目的地）＋ 遮罩／加密策略 | `payout.service` 取得目的地 ＋ 驗證 | **創作者收款設定頁** ＋ Admin 檢視 | `privacy` ＋ `creator_agreement` | **Gate 3** | ❌ 不可（欄位形狀未定） | ✅ 可 | ❌ **不可** |
| 2 `AD-10` 法律 | 預期 **0** | 報表層命名 | 用語 | `terms`／`creator_agreement`／發票 | **Gate 4** | ⚠️ 僅非命名部分 | ✅ 可（技術上） | ✅ 技術上可，惟定性未明 |
| 3 `AD-10` 會計 | 預期 **0** | 報表呈現 | 報表用語 | — | **Gate 4** | ⚠️ 同上 | ✅ 可 | ✅ 技術上可 |
| 4 稅務／扣繳 | 扣繳欄位／分錄型別 ＋ 稅務身分欄位 | **`markPaid` 金額語意**（見 §4） | 撥款明細 ＋ 身分申報 | `creator_agreement` | **Gate 3** | ❌ 不可 | ✅ 可 | ❌ **不可** |
| 5 `O19` 法律 | **第三個 state** | 懸記終局路徑 | 可能的揭露 | 可能 | **Gate 5**（潛在） | ❌ 不可 | ✅ 可 | ✅ 可（懸記為 0 時） |
| 6 `O19` 會計 | 同上 | 同上 | — | — | **Gate 5**（潛在） | ❌ 不可 | ✅ 可 | ✅ 可（懸記為 0 時） |

> **「結算寫入可先進行」全部為 ✅ 是技術判斷，不是建議。**
> 開啟旗標即開始累積**真實的創作者應付** —— 那是日後必須清償的義務。
> 在 `AD-09` 與稅務未決前累積，等於累積**尚無法合規清償**的義務。
> **這是 Owner 的風險判斷（Gate 2），本文件不代為決定。**

---

## 4. Answer-to-implementation 對照

### 4.1 `AD-09` 收款資料

| 答案類別 | 後續實作 |
| --- | --- |
| 可收集的欄位清單 | 新增收款目的地表（欄位依答案而定）；`payout.service` 於匯款前讀取 |
| 需身分核對 | 核對狀態 ＋ 證明參照欄位；未通過不得標記已付 |
| 加密要求 | 欄位級加密 ＋ 僅於匯款當下解密；存取留痕 |
| 僅需遮罩 | 顯示層遮罩（僅末碼），儲存不變 |
| 保存期間 | 到期清除作業 ＋ `privacy` 揭露 |
| 境內儲存要求 | ⚠️ **新增基礎建設需求** —— 目前**沒有**已確認的境內儲存位置 |
| 刪除權處理 | 與未付應付的互動規則；可能暫停撥款 |

### 4.2 稅務／扣繳

| 答案類別 | 後續實作 |
| --- | --- |
| **不需扣繳** | **0 行變更**；`payout_items.amount` 語意維持現狀 |
| 需扣繳，採「總額 ＋ 扣繳欄位」 | `payout_items` 新增 gross／withheld／net；**invariant 10 需改為對 gross 比對** |
| 需扣繳，採「總額 ＋ 扣繳分錄」 | 新增扣繳 entry type；ledger 自洽，invariant 10 不變 |
| 因身分別而異 | 創作者稅務身分欄位 ＋ 依身分別計算 |
| 有憑證義務 | 憑證紀錄表 ＋ 產製與交付 ＋ 創作者下載 |
| 認列時點指定 | 報表期間歸屬依指定時間戳（三者皆已持久化） |

> ⚠️ **中間兩列會改動 invariant 10 的比對對象**，屬金流正確性變更，
> 需完整回歸與 shadow 比對後才可上線。

### 4.3 `AD-10` 交易地位定性

| 答案類別 | 後續實作 |
| --- | --- |
| 總額法 | 報表呈現調整；`platform_commission` 可獲得科目標籤 |
| 淨額法 | 同上，呈現不同 |
| 發票開立人認定 | 憑證流程 ＋ 對買家／創作者的揭露 |
| 揭露用語要求 | `terms`／`creator_agreement`／前台文案 |
| **任一情況** | **金額計算不變** —— 定性影響標籤與揭露，不影響算術 |

### 4.4 `O19` 懸記終局處置

| 答案類別 | 後續實作 |
| --- | --- |
| 無限期保留 | **0 行變更** —— 目前行為即是如此 |
| 一定條件後歸平台 | 新增第三個 state ＋ 明示的人工處置路徑（**不得自動逾時**） |
| 應退還買家 | 退款路徑 ＋ 與既有退款流程的關係 |
| 適用無主財產程序 | 程序性欄位 ＋ 申報流程 |

---

## 5. Launch gate 最終對照

| 閘門 | 狀態 | 由誰擋住 | 通過條件 |
| --- | --- | --- | --- |
| **1 TECHNICAL READINESS** | ✅ **PASS** | — | 已達成：schema 已部署、migration chain 完整、production shadow 兩層皆通過、invariant 0 違反、無重複 earning、無未處置 disposition、讀取 API 可用、寫入端點 fail closed、readiness gate 回 `READY` |
| **2 SAFE TO ENABLE SETTLEMENT WRITES** | ⏸ **OWNER DECISION PENDING** | **無外部項目技術上擋住它** —— 擋住的是 Owner 尚未作出風險判斷 | Owner 明示接受「在 `AD-09`／稅務未決前開始累積創作者應付」的風險 |
| **3 SAFE TO EXECUTE CREATOR PAYOUTS** | ❌ **BLOCKED** | **`AD-09`** ＋ **稅務／扣繳** | 兩者皆已答覆，且 §4.2 的金額語意已依答案處理 |
| **4 LEGAL / ACCOUNTING READY** | ❌ **BLOCKED** | **`AD-10`／`PRE-03`**（法律面 ＋ 會計面） | 定性已認定、發票開立人已定、報表與對外用語已對齊、相關法律文件已發布 |
| **5 OVERALL MVP OPERATIONAL READY** | ❌ **NOT ESTABLISHED** | 閘門 2／3／4 ＋ `O19`（潛在） | 1～4 全數通過 ＋ Admin 營運介面足以不猜測地操作 ＋ `O19` 於首次出現懸記前已答 |

**閘門 1 通過不代表閘門 2；閘門 2 通過不代表閘門 3。**

---

## 6. 答覆回來時該做什麼

1. 把答案記入**既有**登記簿（`PRE-03`／`T-*`／`L-*`／`AD-09`～`AD-13`），**不要新開編號**；
2. 若答案改變任何已鎖定的商業決定，**必須以明示的 Owner Decision 更新**
   （`DEC-24` 已預留此路徑），**不得靜默改動**；
3. 依 §4 對照表評估實作範圍，**先跑 shadow 比對再改行為**；
4. 重新執行 `node scripts/settlement-write-enable-readiness.js --json`；
5. 重新檢視 §5 的五個閘門 —— **逐一**，不要合併成單一結論。
