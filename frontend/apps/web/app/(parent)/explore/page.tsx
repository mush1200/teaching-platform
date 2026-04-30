import { Suspense } from "react";
import { ExplorePage } from "../../../components/parent/ExplorePage";

export default function ParentExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-12 text-center text-sm text-[#6B7280]" aria-live="polite">
          載入中…
        </div>
      }
    >
      <ExplorePage />
    </Suspense>
  );
}
