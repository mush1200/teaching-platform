import { Suspense } from "react";
import { ExplorePage } from "../../../components/parent/ExplorePage";

export default function ParentExplorePage() {
  return (
    <>
      {/*
        `UI-CONS-02` —— `ExplorePage` 是 `/materials` 與 `/explore` **共用**的元件，
        兩條路由原本都沒有任何 heading。標題放在各自的 route page 而不是共用元件裡，
        是因為兩條路由的 canonical 名稱不同：`/materials` 沿用其 metadata 的「教材列表」，
        這裡沿用側欄與 `RoleShell` 既有的「探索教材」。兩者都是既存文案，未新造。
      */}
      <h1 className="sr-only">探索教材</h1>
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl px-page-mobile sm:px-page-tablet lg:px-page-desktop py-12 text-center text-sm text-ds-textMuted" aria-live="polite">
            載入中…
          </div>
        }
      >
        <ExplorePage />
      </Suspense>
    </>
  );
}
