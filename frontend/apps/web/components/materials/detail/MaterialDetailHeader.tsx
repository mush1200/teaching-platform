import Link from "next/link";
import { IconChevronLeft, IconHeart, IconShare } from "../../ui/icons";

export function MaterialDetailHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-ds-border bg-ds-surface/95 backdrop-blur supports-[backdrop-filter]:bg-ds-surface/80">
      <div className="mx-auto flex max-w-wide items-center justify-between px-page-mobile py-2 sm:px-page-tablet lg:px-page-desktop">
        <Link
          href="/materials"
          className="flex size-9 items-center justify-center rounded-xl text-ds-heading transition-colors hover:bg-ds-surfaceSubtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
          aria-label="返回教材列表"
        >
          <IconChevronLeft />
        </Link>
        <div className="flex gap-1">
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-xl text-ds-textMuted transition-colors hover:bg-ds-surfaceSubtle hover:text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            aria-label="收藏（即將推出）"
            disabled
          >
            <IconHeart />
          </button>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-xl text-ds-textMuted transition-colors hover:bg-ds-surfaceSubtle hover:text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            aria-label="分享（即將推出）"
            disabled
          >
            <IconShare />
          </button>
        </div>
      </div>
    </header>
  );
}
