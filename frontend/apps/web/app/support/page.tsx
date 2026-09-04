import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SurfaceCard } from "../../components/ds";
import { getSupportContact } from "../../lib/support-contact";

/**
 * `/support` —— 「聯絡平台」（`PRE-14` Production Minimum Support Entry）。
 *
 * ## 這一頁是什麼
 *
 * 一張**分流表**：讓使用者知道遇到不同問題時，應該走哪一條既有管道。
 * 一般問題給客服 Email，其餘三類各自指回原本的專門流程。
 *
 * ## 這一頁不是什麼
 *
 * **不是客服中心，也不是幫助中心。** 平台沒有 ticket system、沒有 SLA、
 * 沒有指派、沒有客服訊息儲存（那是 tracker `FUT-P8`，`FUTURE`）。
 * 因此頁面名稱刻意用「聯絡平台」—— `BUY-03` 移除的那顆「幫助中心」按鈕
 * 之所以要移除，正是因為它承諾了一個不存在的系統。
 *
 * **這裡不放表單。** 表單會需要一個收件端，而收件端就是 ticket system 的第一步。
 * 只給 `mailto:`，交付責任明確落在信箱那一端。
 *
 * ## 為什麼要 `force-dynamic`
 *
 * 客服信箱由部署環境注入。沒有這一行，Next 會在 `next build` 時把這頁預先
 * 靜態產生，於是**建置當下**的 env 值被凍進產物 —— production 之後才補設
 * `NEXT_PUBLIC_SUPPORT_EMAIL` 會完全不生效，而且失敗方式是安靜的
 * （頁面照常渲染，只是永遠顯示「尚未設定」）。
 *
 * ## 授權
 *
 * 匿名可讀。`middleware.ts` 的 `LOGIN_REQUIRED_PREFIXES` 與 `config.matcher`
 * 都**不包含** `/support`，這是刻意的：本頁存在的首要理由就是「登入不了的人
 * 目前沒有任何管道」（平台沒有密碼重設，`P1-08` 採誠實移除）。
 * 本頁不讀取任何使用者資料，也不呼叫任何需要授權的 API。
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "聯絡平台 | 教具平台",
  description: "依問題類型找到正確的聯絡管道。",
};

function SectionCard({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <SurfaceCard className="p-5 md:p-6" data-testid={id}>
      <h2 className="text-lg font-semibold text-ds-heading">{heading}</h2>
      <div className="mt-3 space-y-3 text-body text-ds-textMuted">{children}</div>
    </SurfaceCard>
  );
}

export default function SupportPage() {
  const contact = getSupportContact();

  return (
    // `RoleShell` 已提供唯一的 <main> landmark（`COR-06`）；這裡再包一層會產生巢狀 landmark。
    <div className="mx-auto w-full max-w-[820px] px-5 py-10 md:py-14">
      <h1 className="text-2xl font-bold text-ds-heading md:text-3xl">聯絡平台</h1>
      <p className="mt-2 text-body text-ds-textMuted">
        請依問題類型選擇下方對應的管道。不同類型由不同流程處理，走對管道才會被正確受理。
      </p>

      <div className="mt-7 space-y-4">
        {/* A. 一般使用問題 —— 唯一使用客服 Email 的一段。 */}
        <SectionCard id="support-section-general" heading="一般使用問題">
          <p>例如：無法登入、帳號操作問題、教材下載操作問題、網站功能使用問題，以及其他一般平台操作問題。</p>
          {contact ? (
            <p>
              請來信：{" "}
              <a
                href={contact.mailto}
                data-testid="support-email-link"
                className="font-semibold text-edu-primary underline underline-offset-4 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
              >
                {contact.email}
              </a>
            </p>
          ) : (
            /*
             * 未設定時**不顯示任何佔位地址**（示意用的 example 網域之類一律不印）。
             * 一個寄出去沒人收的信箱比誠實地說「尚未設定」更傷 —— 使用者會以為
             * 自己已經求助過了。與 `BankTransferInfo.tsx` 的「付款資訊尚未設定」同一種姿態。
             */
            <p
              data-testid="support-email-unavailable"
              className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900"
              role="status"
            >
              一般客服聯絡方式目前尚未設定。
            </p>
          )}
          <p className="text-sm">
            我們以人工方式處理來信，沒有自動回覆系統，也沒有承諾的回覆時限。
          </p>
        </SectionCard>

        {/* B. 交易爭議 —— 消保法 §43 的正式申訴流程，與一般客服分離。 */}
        <SectionCard id="support-section-complaint" heading="購買／退款／交易爭議">
          <p>
            如果問題涉及購買、退款、商品與描述不符、付款後未取得內容，或其他交易爭議，請提出消費申訴，
            平台會以案件方式處理並回覆。
          </p>
          <p>
            <Link
              href="/me/complaints"
              data-testid="support-complaint-link"
              className="font-semibold text-edu-primary underline underline-offset-4 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            >
              前往「申訴與消費爭議」
            </Link>{" "}
            <span className="text-sm">（需要登入）</span>
          </p>
        </SectionCard>

        {/* C. 檢舉 —— 入口維持在教材詳情頁（`BUY-01`），這裡刻意不開第二個。 */}
        <SectionCard id="support-section-report" heading="違規教材／內容檢舉">
          <p>
            教材內容違規或有不當內容時，請在該教材的詳情頁頁尾使用「檢舉這個教材」提出。
            檢舉必須指向特定教材，因此沒有、也不會有與教材無關的通用檢舉入口。
          </p>
          <p>
            <Link
              href="/materials"
              data-testid="support-report-materials-link"
              className="font-semibold text-edu-primary underline underline-offset-4 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            >
              前往教材列表
            </Link>
          </p>
        </SectionCard>

        {/*
         * D. 個資權利請求。
         *
         * ## 2026-09-04 Owner 決定：與一般客服共用同一個信箱
         *
         * 本區塊先前寫「個資權利請求聯絡方式將於正式隱私權政策公布後提供」，
         * 並刻意不印出任何地址 —— 理由是當時唯一寫著該地址的檔案是**草稿**
         * 《隱私權政策》，把草稿裡的聯絡資料搬到匿名可讀的頁面等於提前對外承諾。
         *
         * **Owner 已明示決定改用同一個受監看的信箱承接兩種請求**，因此那段文案
         * 現在會**誤導**：它叫使用者等一個「之後才會公布的其他地址」，而實際上
         * 上方「一般使用問題」顯示的就是同一個信箱。這裡改為據實說明。
         *
         * **仍然分開的是請求類別與處理義務**（法律基礎、期限、紀錄要求皆不同，
         * 見 `docs/mvp_rules.md` §12.11／§12.12）—— 分流靠**主旨標註**與後續的
         * 人工分類，不是靠兩個不同的地址。本輪**未**新增任何後端路由或分流機制。
         *
         * **地址仍然只從 env 來**，這一頁不硬編任何地址；未設定時同樣不編造
         * （下方 `contact` 為 null 的分支）。
         */}
        <SectionCard id="support-section-privacy" heading="個人資料權利請求">
          <p>
            如果要行使個人資料相關權利 —— 例如查詢、複製、更正、停止處理／利用、刪除 ——
            這是與一般使用問題<strong>不同的請求類別</strong>：它有各自的法律依據與處理程序，
            我們會分開受理與記錄。
          </p>
          {contact ? (
            <p data-testid="support-privacy-pending" className="text-sm">
              目前個資權利請求與一般客服<strong>使用同一個信箱</strong>（上方「一般使用問題」所列之{" "}
              {contact.email}）。來信請在主旨註明「個資權利請求」，以便正確分類受理。
              正式的個資聯絡方式將於《隱私權政策》公布後，以該政策所載為準。
            </p>
          ) : (
            <p data-testid="support-privacy-pending" className="text-sm">
              個資權利請求聯絡方式將於正式隱私權政策公布後提供。
            </p>
          )}
          <p className="text-sm">
            修改密碼、忘記密碼或修改可自行編輯的個人資料，屬於一般使用問題，請走上方「一般使用問題」。
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
