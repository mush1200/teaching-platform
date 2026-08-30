"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconEye, IconEyeOff, IconFacebook, IconGoogle } from "../../components/ui/icons";
import type { LoginResponse } from "../../lib/auth";
import { mapStatusMessage } from "../../lib/auth";
import { isSafeInternalPath, getLandingRouteForRole } from "../../lib/session";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Email 格式不正確"),
  password: z.string().min(1, "請輸入密碼"),
});

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-[#94A3B8]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="M5 7l7 6 7-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-[#94A3B8]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4" y="10" width="16" height="10" rx="2.5" />
      <path d="M8 10V7a4 4 0 118 0v3" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "登入資料有誤");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setMessage(mapStatusMessage(response.status));
        return;
      }
      const payload = (await response.json()) as LoginResponse;
      localStorage.setItem("tp_token", payload.token);
      localStorage.setItem("tp_role", payload.user.role);
      localStorage.setItem("tp_user_email", payload.user.email);
      document.cookie = `tp_token=${encodeURIComponent(payload.token)}; path=/; max-age=86400; samesite=lax`;
      document.cookie = `tp_role=${payload.user.role}; path=/; max-age=86400; samesite=lax`;
      if (!remember) {
        /* 仍設短期 cookie；完整「記住我」可之後接 API */
      }
      setMessage("登入成功，正在導向…");
      /*
       * `?redirect=` 只接受**站內**路徑（`DX-04`）。
       *
       * 這個參數是任何人都能在網址上塞的：`/login?redirect=https://evil.com` 先前會在
       * 登入成功後把使用者直接送到站外 —— 一個 pre-auth 就能觸發的 open redirect。
       * `isSafeInternalPath()` 擋掉絕對網址、protocol-relative 的 `//host`
       * 以及瀏覽器會當成 `//` 的 `/\host`。
       */
      const rawRedirect = new URLSearchParams(window.location.search).get("redirect");
      const redirect = isSafeInternalPath(rawRedirect) ? rawRedirect : null;
      /*
       * 目的地與首頁共用 `lib/session.ts` 的單一對照（`DX-17`）——
       * 先前這裡與 `app/page.tsx` 各寫一份，兩份對 admin 的答案不一致。
       * 無法辨識的角色退回 `/`（首頁對未知角色不導向，因此不會產生迴圈）。
       */
      const landing = getLandingRouteForRole(payload.user.role) ?? "/";
      if (payload.user.role === "parent") {
        router.push(landing);
        return;
      }
      router.push(redirect || landing);
    } catch {
      setMessage(mapStatusMessage(500));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F8F7FF] to-[#EEF2FF]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] grid-cols-1 gap-6 px-5 py-6 lg:grid-cols-[40%_60%] lg:gap-6 lg:px-6 lg:py-8">
        <section className="flex items-center justify-center">
          <div className="w-full max-w-[620px] rounded-[32px] border border-[#E5E7EB]/80 bg-white p-8 shadow-[0_20px_55px_rgba(15,23,42,0.08)] md:p-16">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-[#6D5CFF]">
                <span className="text-sm">🎓</span>
                EDUMARKET
              </p>
              <h1 className="mt-4 text-5xl font-extrabold leading-[1.05] text-[#0F172A]">
                繼續你的
                <br />
                <span className="bg-gradient-to-r from-[#7C3AED] to-[#6366F1] bg-clip-text text-transparent">教學之旅</span>
              </h1>
              <p className="mt-3 text-lg text-[#64748B]">登入以繼續探索優質教材</p>
            </div>

            <div className="mt-8 space-y-4">
              <label htmlFor="login-email" className="block text-base font-medium text-[#0F172A]">
                Email
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                  <MailIcon />
                </span>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="h-14 w-full rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] px-11 text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition focus:border-[#6D5CFF] focus:ring-2 focus:ring-[#6D5CFF]/25"
                />
              </div>

              <label htmlFor="login-password" className="block text-base font-medium text-[#0F172A]">
                密碼
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                  <LockIcon />
                </span>
                <input
                  id="login-password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  className="h-14 w-full rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] px-11 pr-12 text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition focus:border-[#6D5CFF] focus:ring-2 focus:ring-[#6D5CFF]/25"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-[#64748B] transition hover:bg-[#F4F1FF] hover:text-[#6D5CFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D5CFF]/40"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "隱藏密碼" : "顯示密碼"}
                >
                  {showPw ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>

              {/*
                `P1-08`：「忘記密碼？」已移除。

                它先前是 `<Link href="/login" onClick={preventDefault}>` —— 一個看起來可以點、
                但點下去什麼都不會發生、也沒有任何說明的連結。Backend 沒有 forgot/reset 端點、
                沒有 reset token 資料表、沒有任何 token 基礎建設，canonical MVP spec §11 的
                auth surface 也只有 `register` / `login` / `me` 三個端點 —— 密碼救援不在 MVP 範圍。

                因此採「誠實移除」而不是臨時擴張成一個完整的 password-recovery 專案：
                **不存在的功能不要假裝存在。**

                也沒有改成「聯絡客服」之類的替代入口 —— repo 裡雖然有多處文案提到「平台客服」，
                但整個 codebase 沒有任何真實的客服 Email、網址或聯絡頁；
                放一個同樣不存在的管道只是把死路換一個位置。
                真正要恢復這個功能時，見 tracker 的 `P1-08`。

                **2026-08-27 更新（`BUY-02`）：** 平台現在有「申訴與消費爭議」全域入口
                （買家外殼 →「其他」→ `/me/complaints`），先前那些「請聯繫客服」死文案已改寫。
                但那條流程**全部端點皆需登入**，因此對「登入不了的人」仍然無解 ——
                本節的判斷不變：這裡不放替代入口。
              */}
              <div className="flex items-center gap-2">
                <label htmlFor="remember" className="inline-flex items-center gap-2 text-sm text-[#64748B]">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="size-4 rounded border-[#CBD5E1] text-[#6D5CFF] focus:ring-[#6D5CFF]/40"
                  />
                  記住我
                </label>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => void handleLogin()}
                className="flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white font-bold shadow-[0_14px_28px_rgba(99,102,241,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(99,102,241,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D5CFF]/45 disabled:opacity-60"
              >
                {loading ? "登入中…" : "登入"}
                {!loading ? <ArrowRightIcon /> : null}
              </button>
            </div>

            <div className="my-7 flex items-center gap-3 text-sm text-[#94A3B8]">
              <span className="h-px flex-1 bg-[#E5E7EB]" />
              或
              <span className="h-px flex-1 bg-[#E5E7EB]" />
            </div>

            <div className="space-y-3">
              <button
                type="button"
                disabled
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-[#E5E7EB] bg-white text-[#64748B] transition hover:bg-[#F9FAFB] disabled:opacity-80"
              >
                <IconGoogle />
                以 Google 登入（即將開放）
              </button>
              <button
                type="button"
                disabled
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-[#E5E7EB] bg-white text-[#64748B] transition hover:bg-[#F9FAFB] disabled:opacity-80"
              >
                <IconFacebook />
                以 Facebook 登入（即將開放）
              </button>
            </div>

            <p className="mt-7 text-center text-sm text-[#64748B]">
              還沒有帳號？{" "}
              <Link href="/register" className="font-medium text-[#6D5CFF] hover:underline">
                立即註冊
              </Link>
            </p>
            {message ? <p className="mt-3 text-center text-sm text-[#F59E0B]">{message}</p> : null}
          </div>
        </section>

        <aside className="relative hidden overflow-hidden rounded-[32px] p-12 shadow-[0_24px_60px_rgba(109,92,255,0.18)] lg:block">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at top left, #EEF2FF, #DDD6FE 45%, #C4B5FD)",
            }}
          />
          <span className="absolute -left-16 bottom-12 h-56 w-56 rounded-full bg-white/20 blur-3xl" aria-hidden />
          <span className="absolute right-12 top-10 text-5xl text-white/70" aria-hidden>
            ✈
          </span>
          <span className="absolute left-24 top-40 grid grid-cols-4 gap-2 opacity-30" aria-hidden>
            {Array.from({ length: 12 }).map((_, idx) => (
              <span key={idx} className="size-1 rounded-full bg-white" />
            ))}
          </span>

          <div className="relative z-10">
            <h2 className="text-5xl font-extrabold text-[#0F172A]">探索優質教材</h2>
            <p className="mt-3 max-w-xl text-lg text-[#475569]">陪伴每位使用者，快速找到最適合孩子的學習教材。</p>

            <div className="mt-7 grid grid-cols-4 gap-3">
              {[
                { icon: "📘", label: "豐富教材" },
                { icon: "⭐", label: "優質教學回饋" },
                { icon: "🙂", label: "適齡分類" },
                { icon: "🛡️", label: "安心選擇" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[18px] border border-white/50 bg-white/40 px-3 py-3 text-center backdrop-blur-[12px] shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
                >
                  <p className="text-2xl" aria-hidden>
                    {item.icon}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#334155]">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="relative mt-12 flex items-end justify-between">
              <article className="-rotate-3 rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_24px_50px_rgba(79,70,229,0.25)]">
                <div className="h-44 w-[300px] rounded-2xl bg-gradient-to-br from-[#67E8F9] via-[#A5B4FC] to-[#C4B5FD]" />
                <span className="mt-3 inline-block rounded-full bg-[#EDE9FE] px-3 py-1 text-xs font-semibold text-[#6D5CFF]">3-6 歲</span>
                <h3 className="mt-2 text-2xl font-bold text-[#0F172A]">動物王國大冒險</h3>
                <p className="mt-1 text-sm text-[#64748B]">學習認識不同動物的生活習性</p>
                <p className="mt-3 text-sm font-semibold text-[#0F172A]">⭐ 4.8 <span className="font-normal text-[#64748B]">(128)</span></p>
              </article>

              <div className="ml-6 flex w-[260px] flex-col gap-4">
                <article className="rounded-3xl border border-white/65 bg-white/90 p-4 shadow-[0_18px_40px_rgba(79,70,229,0.18)]">
                  <p className="text-sm font-semibold text-[#334155]">使用者教學回饋</p>
                  <p className="mt-2 text-5xl font-bold text-[#0F172A]">4.8</p>
                  <p className="mt-1 text-base text-amber-500">★★★★★</p>
                  <p className="mt-1 text-xs text-[#64748B]">128 則教學回饋</p>
                </article>
                <article className="rounded-3xl border border-white/65 bg-white/90 p-4 shadow-[0_18px_40px_rgba(79,70,229,0.18)]">
                  <p className="text-sm font-semibold text-[#334155]">適合年齡</p>
                  <p className="mt-2 text-4xl font-bold text-[#0F172A]">3-6 歲</p>
                </article>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
