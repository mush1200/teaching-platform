# `PRE-18` 外部決定 → 程式碼 對照與 Launch Gate

> **狀態：工程側事實彙整。本文件不含任何法律／稅務／會計結論。**
> 四個外部項目（`AD-09`／`AD-10`／稅務扣繳／`O19`）的答案**必須**來自律師／會計師；
> 本文件只回答工程端能回答的問題：**每個答案會改到哪裡，以及在答案回來之前什麼能動、什麼不能動。**
>
> 專業問卷見 `docs/pre-18-lawyer-review-packet-2026-09-29.md`
> 與 `docs/pre-18-accountant-review-packet-2026-09-29.md`。

建立於 2026-09-29，`PRE-18` production technical readiness 記錄完成之後（commit `f11976e`）。

---

## 0. 目前鎖定的狀態

| 項目 | 值 |
| --- | --- |
| `PRE-18` TECHNICAL READINESS | **PASS** |
| PRODUCTION SHADOW VERIFIED | **YES**（兩層皆執行 → `NO_UNEXPLAINED_DIFFERENCE`） |
| WRITE-ENABLE READY | **YES**（`verdict READY`、`blockedBy null`） |
| PRODUCTION WRITE ENABLED | **NO** |
| `SETTLEMENT_WRITE_ENABLED` | **OFF** |
| OVERALL MVP OPERATIONAL READINESS | **NOT YET ESTABLISHED** |

> 🔒 **2026-09-29 Owner 鎖定的閘門狀態**：
> Gate 2 **OWNER DECISION PENDING**／Gate 3 **BLOCKED by `AD-09` ＋ 稅務扣繳**／
> Gate 4 **BLOCKED by `PRE-03`／`AD-10`**。
> **`O19` 仍為 external-decision item，但在 production 懸記筆數維持 0 的期間
> 不是現行的撥款阻擋項。**
> **本輪未授權任何 settlement 實作變更。**

> ⚠️ **`READY` 不是啟用授權。** 它只回答「技術上是否具備條件」，
> 不回答「商業／法律上是否應該開始累積創作者應付」。

---

## 1. 與既有問題登記簿的關係（**不另立平行登記簿**）

repo 已經有兩組外部問題編號，本輪**沿用**而不重編：

| 既有 ID | 內容 | 決定者 | 與本輪四項的關係 |
| --- | --- | --- | --- |
| `PRE-03` | 平台交易地位定性（出賣人／居間／代理收付）→ 第三方支付能量登錄 | **律師 ＋ 會計師會同** | **`AD-10` 的上位問題**。`AD-10` 無法在 `PRE-03` 之前單獨回答 |
| `T-01`～`T-15` | 代銷認定、發票、憑證時點、**扣繳**、保存年限 | 會計師 | **稅務／扣繳**即落在此組 |
| `L-*` | 授權鏈、解除權、審閱期、管轄、**保存依據** | 律師 | `AD-09` 的保存期間／刪除權落在 `L-21`／`L-22` |
| `AD-09`～`AD-13` | 撥款相關的會計／法律待決 | 律師／會計師 | 本輪的四項 |

**本輪不建立任何新的 `DEC-*` ID**，也不改動 `DEC-20`～`DEC-39`。

> 🔒 **2026-09-29 Owner 鎖定**：**`PRE-03` ／ `T-*` ／ `L-*`（連同 `AD-09`～`AD-13`）
> 為外部決定的 canonical 登記簿。不得**為了專業審閱包另立平行編號系統。
> 兩份審閱包一律以既有編號交叉引用。

---

## 2. Decision-to-code 對照矩陣

「阻擋」的定義：**在該決定回來之前，做這件事會產生無法在事後無痛修正的後果**
（例如已匯出的錯誤金額、已收集但無法律依據的個資、已對外揭露的錯誤用語）。

| 外部決定 | 決定者 | 擋第一筆結算寫入？ | 擋撥款執行？ | 擋 Creator UI？ | 擋會計／報表？ | 未來 schema 影響 | 未來 service 影響 | 法律文件影響 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **`AD-09`** 收款資料 | 律師（隱私／個資） ＋ Owner（營運） | **否** | **是** | **是**（收款資料輸入介面） | 否 | **新表**（收款目的地）＋ 遮罩／加密欄位策略 | `payout.service` 取得目的地；新的驗證與遮罩 | `privacy`（受託處理者、保存期間、跨境）＋ `creator_agreement`（提供義務） |
| **`AD-10`** ／ `PRE-03` 交易地位定性 | **律師 ＋ 會計師會同** | **否**（技術上） | 否 | **部分**（用語） | **是** | **可能為 0** —— 影響的是標籤與揭露，不是金額結構 | 報表層命名；`platform_commission` **不得**據未定案理論改名 | `terms`／`creator_agreement`／`privacy` 用語；發票／收據開立人 |
| **稅務／扣繳** | 會計師（`T-*`） | **否** | **是** | **是**（若須稅務身分欄位） | **是** | 若須扣繳：**扣繳分錄型別／欄位**；稅務身分欄位 | `payout.service` 的 gross ／ net 分離；`markPaid` 金額語意 | `creator_agreement` 的扣繳條款；憑證交付 |
| **`O19`** 懸記終局處置 | 律師 ＋ 會計師 | **否** | 否 | 否 | **潛在** | **第三個 state**（目前值域恰為 `open`／`resolved`） | suspense 終局處置路徑（目前不存在） | 可能的揭露 |

### 2.1 已驗證的結論（非假設）

- **四者之中沒有任何一項在技術上阻擋「第一筆結算寫入」。**
  核准時記錄 earning／切片、期間關閉、statement 產生、創作者端收益揭露，
  都不依賴任何一個外部答案。
- **`AD-09` 與稅務扣繳阻擋撥款執行**（見 §3 的技術風險）。
- **`AD-10` 阻擋會計／法律定性與對外揭露**，不阻擋金額計算。
- **`O19` 目前為潛在項** —— production suspense 候選為 **0**。

> ⚠️ **「技術上不阻擋」不等於「商業上應該先開」。** 開啟旗標即開始累積**真實的創作者應付**，
> 那是平台日後必須清償的義務。在 `AD-09` 與稅務扣繳未決前開啟，
> 等於累積**尚無法合規清償**的義務。**這是 Owner 的風險判斷，本文件不代為決定。**

---

## 3. 必須在首次撥款前解決的技術風險（稅務扣繳）

**這不是假設性的，是目前程式碼的既定行為：**

- `payout_items.amount` 是**應付總額**；
- `markPaid` 會把該金額**全額**配置到 payable slices，並寫入一筆等額的
  `payout_consumption` 分錄；
- invariant 10（deferred constraint trigger `pre18_payout_total_check`）**強制**
  `SUM(payout_allocations.amount) = payout_items.amount`。

**因此：若須扣繳，實際匯出金額會小於 `payout_items.amount`，
而 ledger 仍會把應付記為全額消滅。** 帳面與實際匯款將不一致，
且因 ledger 為 append-only，事後只能以沖正分錄更正，無法靜默調整。

**本輪不實作任何扣繳行為**（`DEC-24` 明文未認定扣繳）。
此風險必須在**第一次真實撥款之前**由會計師答覆後處理，
而**不是**在第一次結算寫入之前。

---

## 4. Launch Gate 矩陣（五個閘門，**不得**收斂成單一 READY／NOT READY）

| # | 閘門 | 目前 | 必須為真才算通過 |
| --- | --- | --- | --- |
| 1 | **TECHNICALLY READY** | ✅ **PASS** | schema 已部署；migration chain 完整；production shadow 兩層皆執行且無不明差異；invariant 0 違反；無重複 earning；無未處置 disposition；讀取 API 可用；寫入端點在旗標關閉時 fail closed；readiness gate 回 `READY` |
| 2 | **SAFE TO ENABLE SETTLEMENT WRITES** | ⏸ **Owner 判斷未做** | 閘門 1 ＋ **Owner 明示接受**「在 `AD-09`／稅務未決前即開始累積創作者應付」的風險；並確認累積期間不會對創作者作出無法履行的撥款承諾 |
| 3 | **SAFE TO EXECUTE PAYOUTS** | ❌ **BLOCKED** | 閘門 2 ＋ **`AD-09` 已答**（收款資料可合法收集、儲存、使用）＋ **稅務扣繳已答**（是否扣繳、gross／net 關係、憑證義務）＋ §3 的技術風險已依答案處理 |
| 4 | **LEGAL / ACCOUNTING READY** | ❌ **BLOCKED** | **`PRE-03`／`AD-10` 已答**（交易地位定性）＋ 發票／收據開立人已定 ＋ 報表與對外用語已依定性調整 ＋ 相關法律文件已發布 |
| 5 | **MVP OPERATIONALLY READY** | ❌ **NOT YET ESTABLISHED** | 閘門 1～4 全部通過 ＋ Admin 營運介面足以在不猜測的情況下操作 ＋ `O19` 於首次出現懸記前已答 |

**閘門 1 通過不代表閘門 2**；**閘門 2 通過不代表閘門 3**。
這是本文件存在的主要理由。

---

## 5. 在外部答案回來之前，工程端可以安全推進什麼

**可以：**
- 維持旗標 OFF 的 shadow 模式與 readiness 監測；
- Admin 營運介面（cycles／statements／holds／adjustments／suspense／對帳）的 UI；
- 創作者端**既有**金額線的呈現（Net Sales／Earnings／Held／Pending／Paid／Adjustments）；
- 對帳處置流程的操作性改善。

**不可以：**
- 新增任何收款目的地欄位（等 `AD-09`）；
- 新增任何扣繳欄位或行為（等 `T-*`）；
- 依未定案的法律理論重新命名 `platform_commission` 或改變其計算（等 `PRE-03`／`AD-10`）；
- 為懸記新增第三個 state 或任何自動逾時（等 `O19`）；
- 開啟 `SETTLEMENT_WRITE_ENABLED`。
