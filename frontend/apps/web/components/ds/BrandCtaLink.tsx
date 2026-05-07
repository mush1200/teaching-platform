import Link from "next/link";
import type { ComponentProps } from "react";

/** 交易／設定類主按鈕（品牌紫），避免與促銷用的粉紅 PrimaryCtaLink 混淆 */
const brandClasses =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-intent-action px-4 py-2 text-sm font-semibold text-white shadow-button-action transition hover:brightness-[0.96] active:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus";

export function BrandCtaLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link className={`${brandClasses} ${className}`.trim()} {...props} />;
}
