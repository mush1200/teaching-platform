import { Suspense } from "react";
import { DashboardClient } from "./DashboardClient";

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardClient />
    </Suspense>
  );
}

function DashboardFallback() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-8 md:space-y-10">
      <div className="h-52 rounded-3xl bg-[#EDE9FE]/90" />
      <div className="h-14 rounded-2xl bg-white/90 shadow-sm" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-80 rounded-3xl bg-white/95 shadow-sm" />
        ))}
      </div>
    </div>
  );
}
