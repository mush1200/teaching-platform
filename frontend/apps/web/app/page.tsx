"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getStoredRole, getStoredToken } from "../lib/api-client";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getStoredToken();
    const role = getStoredRole();
    if (!token) return;
    if (role === "teacher") {
      router.replace("/teacher/materials");
      return;
    }
    router.replace("/materials");
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold text-slate-900">EduMarket</h1>
      <p className="max-w-2xl text-base text-slate-600">教具平台前端入口，若已登入會自動導向對應頁面。</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/materials" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          教材列表
        </Link>
        <Link href="/cart" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
          購物車
        </Link>
        <Link href="/login" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
          登入
        </Link>
      </div>
    </main>
  );
}
