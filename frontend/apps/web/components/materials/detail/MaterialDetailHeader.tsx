import Link from "next/link";
/*
 * `UI-CONS-18`（Wave UI-7）：icon-only 控制項由 36×36 補到 **44×44**。
 * 這些都是**行動版可見的主要互動**（教材詳情的返回／收藏／分享、卡片收藏），
 * 不屬於「密集 desktop-only」例外。
 * `UI-CONS-24`：icon 本身一律不進 accessibility tree，名稱由 `aria-label` 提供。
 */
import { IconChevronLeft, IconHeart, IconShare } from "../../ui/icons";
import { IconButton } from "../../ui/IconButton";

export function MaterialDetailHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-ds-border bg-ds-surface/95 backdrop-blur supports-[backdrop-filter]:bg-ds-surface/80">
      <div className="mx-auto flex max-w-wide items-center justify-between px-page-mobile py-2 sm:px-page-tablet lg:px-page-desktop">
        <Link
          href="/materials"
          className="flex size-11 items-center justify-center rounded-xl text-ds-heading transition-colors hover:bg-ds-surfaceSubtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
          aria-label="返回教材列表"
        >
          <IconChevronLeft />
        </Link>
        <div className="flex gap-1">
          <IconButton
            label="收藏（即將推出）"
            disabled
            className="text-ds-textMuted hover:bg-ds-surfaceSubtle hover:text-ds-heading"
          >
            <IconHeart />
          </IconButton>
          <IconButton
            label="分享（即將推出）"
            disabled
            className="text-ds-textMuted hover:bg-ds-surfaceSubtle hover:text-ds-heading"
          >
            <IconShare />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
