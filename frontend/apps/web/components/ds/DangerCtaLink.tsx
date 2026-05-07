import Link from "next/link";
import type { ComponentProps } from "react";

/** 警示／退回後重新操作（紅色系），限縮使用情境 */
const dangerClasses =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus";

export function DangerCtaLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link className={`${dangerClasses} ${className}`.trim()} {...props} />;
}
