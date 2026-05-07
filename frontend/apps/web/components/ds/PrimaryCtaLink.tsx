import Link from "next/link";
import type { ComponentProps } from "react";

const primaryFlowClasses =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-intent-flow px-5 py-3 text-sm font-semibold text-white shadow-button-flow transition hover:brightness-[0.97] active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus";

/**
 * 主要行為 CTA（結帳／登入／探索／上傳憑證）— 對齊設計系統 intent-flow + shadow-button-flow。
 */
export function PrimaryCtaLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link className={`${primaryFlowClasses} ${className}`.trim()} {...props} />;
}
