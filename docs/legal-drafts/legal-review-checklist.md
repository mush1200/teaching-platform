# Legal / Owner Review Checklist（P1-09 草稿審閱用）

> **這不是第五份法律文件。** 本檔為四份草稿之審閱清單，
> 供律師、會計師與 Product Owner 逐項回覆之用。
>
> 四份草稿位置：
> * `docs/legal-drafts/terms-of-service.draft.md`
> * `docs/legal-drafts/privacy-policy.draft.md`
> * `docs/legal-drafts/creator-agreement.draft.md`
> * `docs/legal-drafts/refund-cancellation-policy.draft.md`
>
> 全部標記為 `DRAFT — NOT LAWYER APPROVED`，**均未發布**。

---

## A. LAWYER REVIEW REQUIRED

| ID | Document | Section | Question | Dependency |
| --- | --- | --- | --- | --- |
| `PRE-03` | Terms | §1.3 | 平台在交易中係出賣人、居間，抑或代理收付網路實質交易款項？此定性決定三份條款之當事人結構、發票開立主體，以及是否須完成第三方支付服務能量登錄 | 上位問題，**阻擋 Terms §1、Creator §1.4 定稿**；另需 `T-02` 併同認定 |
| `PRE-03` | Creator | §1.4 | 同上，就創作者側之當事人結構 | 同上 |
| `L-04` | Creator | §4.3 | 創作者 → 平台 → 購買者之授權鏈應如何建構？是否滿足著作權法 §37 III 再授權要件？ | `PRE-03` |
| `L-04` | Terms | §14.2 | 購買者取得之使用權範圍（再散布／改作／商業利用）之法律表述 | `L-04` ＋ Owner 決定範圍 |
| `L-05` | Creator | §4.3、§13.2 | 上位授權終止後（含平台解散），已授出之再授權是否存續？ | `L-04` |
| `L-06` | Creator | §4.3 | 保存並交付歷史版本所需之授權範圍 | `L-04`、`PRE-04` |
| `L-07` | Terms §4.4 / Creator §5.5 | — | 平台被認定為出賣人時，其自身之重製與交付行為不受著作權法 §90-4 免責事由保護；創作者與平台間之責任分配應如何約定？ | `PRE-03` |
| `L-08` | Terms | §5.3 | 契約成立之法律時點（民法 §153）對應訂單建立／付款申報／實際入帳／平台核准之哪一個？ | 無 |
| `L-08` | Terms | §7.4 | 付款期限 7 個日曆日之合理性；逾期之法律效果（解除／失效／僅不得補件） | 無 |
| `L-08` | Terms | §8.2 | 付款審核期限 3 個日曆日之法律性質（承諾期間或作業目標）及逾期效果 | 無 |
| `L-09` | Refund | §2.3 | 消保法 §19 解除權及數位內容例外之適用；正式告知文案與**告知之流程時點** | **阻擋 Refund §2 定稿**、Gate 13 |
| `L-10` | Terms §10.2 / Creator §8.3 | — | 已售教材版本更新之揭露義務、通知義務，及既有購買者對舊版本之權利 | `PRE-04` |
| `L-12` | Terms | §17.5 | 定型化契約審閱期（消保法 §11-1）之 UI 落實方式；條款須於勾選前可完整閱讀，且**不得有拋棄審閱權之字樣** | 影響 consent activation wave |
| `L-13` | Terms | §16 | 管轄法院條款。**不得排除**消保法 §47 與民事訴訟法 §436-9 之小額訴訟管轄 | 無 |
| `L-14` | Creator | §13.2 | 創作者離開後，既有購買者之權利與教材檔案之保存義務 | `L-05`、`RM-15` |
| `L-15` | Terms | §13.3 | 平台停止營運之條款（購買者／創作者／資料／平台四組處置） | Gate 10 |
| `L-17` | Terms §12.6 / Refund §11.3 | — | 外部消費爭議管道之揭露文字 | 併同 `EXTERNAL AUTHORITY` |
| `L-20` | Refund | §8.2 | 契約解除後，購買者對已下載副本之義務文字及其可執行性 | `L-09` |
| `L-21` | Privacy | §6.2、§9.2 | 稽核紀錄依個資法 §11 III 但書「執行業務所必須」之保存理由與期限。**不得預設永久保存** | **阻擋** `SCHEMA-02` 與刪除語意 |
| `L-22` | Privacy §3、§6.2 / Creator §11.2 / Refund §10.1 | — | 各類資料保存之法定依據（契約履行／法定義務／業務必須）逐項覆核（18 類） | 併同 `T-14` |
| `RM-15` | Privacy §6.2 / Creator §13.3 | — | 教材檔案（含歷史履約版本）之保存期間 | `L-22` |
| `LEGAL-01` | Terms | §12.2 | 民法 §122（末日為休息日順延）對本平台消保法 §43 SLA 之適用；對外文案不得直接引用未展延之值 | 併同 `EXTERNAL AUTHORITY` |
| `PROD-01` | Terms | §12.3 | 法律上必須接受哪些金融機構交易證明格式？拒收 PDF 是否使「不得以平台紀錄為唯一認定依據」落空？ | Owner 產品方向已定為未來目標 |
| — | Terms | §15 | 責任限制條款全文。須符合定型化契約「不得記載事項」關於免除或減輕企業經營者責任之限制 | **草稿刻意留白** |
| — | Terms | §2.5 | 帳號凍結後之申訴／解除流程是否須對外承諾時限 | Owner 併同 |
| — | Terms | §6.5 | 付款爭議條款之表述。**寫「以平台入帳紀錄為準」該條款無效**（消保法 §17 III） | 高風險 |
| — | Terms | §13.2 | 終止事由之列舉是否符合關於任意終止之限制 | — |
| — | Creator | §3.3 | 既有無版本權利聲明之法律效力；本條款發布後是否須就既有教材重新取得聲明 | **不得回填** |
| — | Creator | §4.4 | 平台對教材之處理行為（浮水印／試看／格式轉換）須於授權範圍內逐項明文；消保法 §8 II 之適用 | `L-04` |
| — | Creator | §7.4 | 下架之要件、事前通知義務，及重複侵權者之處理政策 | — |
| — | Privacy | §5.4 | 法定揭露條款之表述 | — |
| — | Privacy | §7.3 | 法律保留之要件、期間與解除條件 | `L-21` |
| — | Privacy | §8.3 | 當事人權利之行使流程與法定條文用語；人工受理是否足夠、應於幾日內回覆 | — |
| — | Privacy | §10.2 | 網路交易定型化契約應記載事項第十三點「企業經營者應確保系統符合一般可合理期待之安全性」之承諾文字 | — |
| — | Privacy | §10.3 | 個人資料檔案安全維護管理辦法之適用性，及 72 小時通報義務之範圍 | `T-01` 營運主體登記 |
| — | Refund | §6.2 | 退款收款帳戶之蒐集依據、最小必要範圍與保存期間 | `L-22` |
| — | Refund | §7.1 | 退款處理時限之法定要求（如有）及對外承諾之適法表述 | Owner 併同 |
| — | All | — | `DEC-LEGAL-01`：哪些變更依法必須取得重新同意？ | Owner 併同 |

**另需律師確認之應記載事項覆蓋（未逐條寫入草稿，待覆核）：**
解釋原則／商品資訊為契約一部分／電子文件表示方法／交付方式／
付款方式說明／§19 解除權 —— 共 6 點缺正面記載。

---

## B. ACCOUNTANT REVIEW REQUIRED

| ID | Document | Section | Question |
| --- | --- | --- | --- |
| `T-02` | Creator | §1.4 | Platform Seller 與受託代銷之稅務認定 |
| `T-05` | Creator §9.2 / Refund §9.1 | — | 是否使用統一發票／是否為小規模營業人 |
| `T-06` | Creator §9.2 / Refund §9.1 | — | 免用統一發票時之合法交易憑證形式 |
| `T-07` | Creator §9.2 / Refund §9.1 | — | 憑證開立時點（本平台收款在核准之前，時點可能落在收款） |
| `T-08` | Refund §9.1 / Creator §10.1 | — | 退回與折讓之沖銷處理（三維 decision tree 逐分支） |
| `T-09` | Creator | §9.2 | 創作者報酬之所得定性 |
| `T-10` | Creator | §9.2 | 扣繳率、免扣繳門檻、憑單申報 |
| `T-11` | Creator | §9.2 | 非居住者創作者之處理 |
| `T-12` | Creator | §2.2、§9.2 | 創作者稅務身分類型與應蒐集之欄位 |
| `T-14` | Privacy §6.2 / Creator §11.2 / Refund §10.1 | — | 稅務憑證與帳簿之法定保存年限，回寫保存期間矩陣 |
| — | Creator | §10.1 | 退款對創作者報酬之回沖規則 |

---

## C. EXTERNAL AUTHORITY SOURCE REQUIRED

| ID | Document | Section | 所需 authority |
| --- | --- | --- | --- |
| `LEGAL-01` | Terms §12.2 | — | **人事行政總處**行事曆（權威國定假日來源），供民法 §122 末日展延計算 |
| `L-17` | Terms §12.6 / Refund §11.3 | — | **消保主管機關／各縣市消費者服務中心**：各管道正式名稱、聯絡方式、全國消費者服務專線之最新公告 |
| `T-04`／`T-05` | Creator §9.2 | — | **國稅局**：稅籍登記與統一發票核定文件 |
| `T-01` | Privacy §10.3 | — | 營運主體之公司／商業登記、統一編號、營業項目（決定個資辦法適用性） |
| `PRE-03` | Terms §1.3 | — | 若最終認定為代理收付，須完成**第三方支付服務能量登錄** |

> **本輪草稿刻意未填入任何政府網址、電話、機關名稱或聯絡資訊。**

---

## D. OWNER DECISION REQUIRED

| # | 議題 | 影響文件／條文 | 說明 |
| --- | --- | --- | --- |
| 1 | ~~**文件識別與版本命名規則**~~ | 全部四份 | **✅ DECIDED `DEC-LEGAL-05`（2026-08-27）** —— 整數序號（`1`, `2`, `3`…），每個 `document_type` 各自獨立；版本號不代表變更幅度或法律重大性 |
| 2 | ~~**個資保護聯絡管道**~~ | Privacy §12 | **✅ DECIDED `DEC-LEGAL-07`（2026-08-27）** —— dedicated privacy email；MVP 階段先用 Owner 指定之個人 Email，正式 mailbox 建立後替換；站內工單不得取代其 fallback 地位。**受理作業流程仍未決（見 §D #21）** |
| 3 | ~~**外部申訴管道之 UX 呈現**~~ | Terms §12.6 | **✅ DECIDED `DEC-LEGAL-09`（2026-08-27, Round 2）** —— Option C：全域入口 ＋ 既有 order-context CTA 並存；需求登入時 UI 須誠實標示；privacy email 不作為爭議管道。**實作未開始**（tracker `BUY-02`）。**機關名稱／聯絡方式仍為 `L-17`（blocked）** |
| 4 | **「重大變更」之判定標準與判定者** | 全部四份 | **部分決定。** 系統記錄形狀 **✅ DECIDED `DEC-LEGAL-06`（2026-08-27）** —— `legal_documents.requires_reconsent BOOLEAN NOT NULL`，發布時顯式決定、發布後不可改寫、設定留稽核紀錄，**且明定為 production enforcement metadata 而非法律認定**。**設定權限與內部檢核** ✅ **DECIDED `DEC-LEGAL-11`（2026-08-28, Round 3）** —— 維持 single-admin，但每次設定須留下標準化、可稽核的 internal justification（僅為 operational metadata，非法律認定；實作未開始，tracker `OPS-03`）。**法律側仍未決**：什麼變更依法必須設為 true —— 維持 `DEC-LEGAL-01` 的 Lawyer marker |
| 5 | **既有使用者遷移之受管制行為對應** | Terms §17.4 | `DEC-LEGAL-02` 已定原則（不全站強制阻擋，於下次受管制行為補同意）；對應清單待定 |
| 6 | **帳號刪除之技術語意與流程** | Privacy §9.2 | `SCHEMA-02`：刪除帳號與「不得改寫歷史稽核」衝突，須先有 `L-21` 結論 |
| 7 | ~~**PDF 證據之產品方向**~~ | Terms §12.3 | **✅ DECIDED `DEC-LEGAL-08`（2026-08-27, Round 2）** —— Option A：PDF evidence **upload** 非 MVP launch blocker，維持 JPG／PNG／WebP。**僅為 product priority，不代表法律上不需接受 PDF**；`PROD-01` 法律下限維持 `LAWYER VALIDATION REQUIRED`。PDF **export** 不在本決策範圍 |
| 8 | **註冊姓名是否停止蒐集** | Privacy §2.1 | **✅ CONFIRMED（2026-08-27, Round 2）** —— `DEC-06 = A` 維持。**⚠ 實作未完成**：backend／schema 從未蒐集，但**前端仍有必填姓名欄位與 `tp_display_name` 寫入**（tracker `DEC-06` `OPEN`） |
| 9 | **本機事件記錄是否移除** | Privacy §2.7 | **✅ CONFIRMED（2026-08-27, Round 2）** —— `DEC-08 = A` 維持。**⚠ 實作未完成**：`lib/analytics.ts` ＋ `tp_analytics_events` ＋ **5 個 live producer** 仍在線，且 logout 不清除（tracker `DEC-08` `OPEN`）。**不得**因此弱化 backend `activity_logs` |
| 10 | **購買者使用範圍** | Terms §14.2 | 再散布／改作／商業利用是否允許（法律表述另需 `L-04`） |
| 11 | **授權是否專屬；平台行銷使用範圍** | Creator §4.3 | 是否得使用封面與試看素材推廣 |
| 12 | **創作者資格條件** | Creator §2.2 | 是否設年齡或其他門檻（平台目前未蒐集出生日期、無年齡驗證） |
| 13 | **平台服務費比例、折扣承擔、結算週期** | Creator §9.2 | 撥款系統尚不存在 |
| 14 | **退款時創作者是否負擔、比例為何** | Creator §10.1 | 需併同 `T-08` |
| 15 | ~~**退款收款帳戶之蒐集方式**~~ | Refund §6.2 | **✅ DECIDED `DEC-LEGAL-12`（2026-08-28, Round 3）** —— Option A：MVP **不在平台內保存**，維持個案式站外取得；不新增 DB 欄位、不預先蒐集。待 `L-21`/`L-22` 完成後再評估 in-platform per-case collection（屆時需 lawyer validation） |
| 16 | **退款案件之審核與執行處理時限** | Refund §7.1 | **草稿刻意未填天數** |
| 17 | **帳號凍結後之申訴／解除流程** | Terms §2.5 | **部分決定。** 平台**內部** operating model ✅ `DEC-LEGAL-10`（2026-08-27, Round 2）：single-admin ＋ mandatory reason ＋ standardized taxonomy ＋ audit ＋ Admin UI，不採 two-admin（實作未開始，tracker `OPS-02`；canonical 見 `mvp_rules.md` §12.2a）。**對外申訴期限／法定回覆日數仍未決 —— Owner ＋ Lawyer** |
| 18 | **平台停止營運計畫** | Terms §13.3 | Gate 10，四組處置皆未訂定 |
| 19 | **郵件服務供應商揭露** | Privacy §5.3 | **FACT UNKNOWN — OWNER / DEPLOYMENT INPUT REQUIRED**（2026-08-27, Round 2）。repo 佐證：`.env.example` 之 SMTP 值全為空白、transporter 為通用 nodemailer 設定、repo 內無任何部署／CI 設定檔。Owner 表示尚未決定 —— **不得猜測，不得填入 §5.3** |
| 20 | **部署環境委外處理者揭露** | Privacy §5.4 | `PRE-01`／`PRE-02` 尚未決定 |
| 21 | **當事人權利之受理作業流程** | Privacy §8.3 | **部分決定。** 管道 ✅ `DEC-LEGAL-07`；**內部受理模型** ✅ **DECIDED `DEC-LEGAL-13`（2026-08-28, Round 3）** —— 重用既有 case-management 基礎設施，但**必須建立獨立的 privacy-request 分類**，不得與 consumer complaint 混為同一概念（實作未開始，tracker `OPS-04`）。**法定回覆期限與身分驗證標準仍未決 —— 維持 §A 之 Lawyer marker** |

---

## E. 使用方式

1. **律師**：回覆 §A（並確認 §C 之外部來源），特別優先 `PRE-03`、`L-09`、`L-04`、`L-13`、`L-21`。
2. **會計師**：回覆 §B，特別優先 `T-14`（回寫保存期間）與 `T-02`。
3. **Owner**：回覆 §D。
   * **Round 1（2026-08-27）已完成 #1、#2、#4** —— consent activation wave 之前置
     （`DEC-LEGAL-05`／`DEC-LEGAL-07`／`DEC-LEGAL-06`；#4 僅系統記錄形狀已定，法律側仍未決）。
   * **Round 2（2026-08-27）已完成 #3、#7、#8、#9、#17（內部側）、#19（確認為未知事實）**
     ＋ 文件集合確認（`DEC-04` CONFIRM）。
   * **Round 3（2026-08-28）已完成 #4（操作權限側）、#15、#21（內部受理模型側）**
     —— `DEC-LEGAL-11`／`DEC-LEGAL-12`／`DEC-LEGAL-13`。
   * **Owner-ready 的項目至此已用盡。** 其餘 #5、#6、#10～#14、#16、#18、#20
     以及 #4／#21 的法律側，**都不是「再開一輪 Owner Decision」能推進的** ——
     它們各自卡在 Lawyer（`PRE-03`／`L-04`～`L-06`／`L-09`／`L-12`／`L-15`／`L-21`／`L-22`）、
     Accountant（`T-02`～`T-14`）或 deployment fact（`PRE-01`／`PRE-02`／O-19）。

> **注意：#8 與 #9 為 CONFIRM，不是 COMPLETE。** 兩者的移除**皆尚未實作**，
> 追蹤於 tracker 的 `DEC-06` / `DEC-08`。

**四份草稿在 §A 之關鍵項目確認前，不得發布至 `legal_documents`。**

---

```text
DRAFT SUPPORT DOCUMENT — NOT A LEGAL DOCUMENT
```
