import Link from "next/link";
import type { ComponentProps } from "react";

const accentClasses =
  "inline-flex items-center gap-1 font-semibold text-edu-primary underline-offset-4 transition hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus";

/** 內文層級的品牌色連結（例如「前往我的教材」） */
export function AccentTextLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link className={`${accentClasses} ${className}`.trim()} {...props} />;
}
