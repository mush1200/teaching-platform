"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { IconFacebook, IconGoogle } from "../../components/ui/icons";
import type { UserRole } from "../../lib/api-types";
import type { LoginResponse } from "../../lib/auth";
import { mapStatusMessage } from "../../lib/auth";

const registerSchema = z
  .object({
    name: z.string().min(1, "請輸入姓名"),
    email: z.string().email("Email 格式不正確"),
    password: z.string().min(6, "密碼至少 6 個字元"),
    confirm: z.string().min(1, "請再次輸入密碼"),
    role: z.enum(["parent", "teacher"]),
    terms: z.boolean(),
  })
  .refine((d) => d.terms, { message: "請同意服務條款", path: ["terms"] })
  .refine((d) => d.password === d.confirm, { message: "兩次密碼不一致", path: ["confirm"] });

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

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-[#94A3B8]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19a7 7 0 0114 0" />
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

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<UserRole>("parent");
  const [terms, setTerms] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    const parsed = registerSchema.safeParse({
      name,
      email,
      password,
      confirm,
      role,
      terms,
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "資料有誤");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: parsed.data.email,
          password: parsed.data.password,
          role: parsed.data.role,
        }),
      });
      if (!response.ok) {
        setMessage(await parseRegisterError(response));
        return;
      }
      const payload = (await response.json()) as LoginResponse;
      localStorage.setItem("tp_token", payload.token);
      localStorage.setItem("tp_role", payload.user.role);
      localStorage.setItem("tp_user_email", payload.user.email);
      document.cookie = `tp_token=${encodeURIComponent(payload.token)}; path=/; max-age=86400; samesite=lax`;
      document.cookie = `tp_role=${payload.user.role}; path=/; max-age=86400; samesite=lax`;
      if (name) localStorage.setItem("tp_display_name", name);
      setMessage("註冊成功，正在導向首頁…");
      router.push("/");
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
              <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] text-[#0F172A]">建立你的教具平台帳號</h1>
              <p className="mt-3 text-lg text-[#64748B]">選擇你想開始的使用方式</p>
            </div>

            <div className="mt-8 space-y-4">
              <label htmlFor="reg-name" className="block text-base font-medium text-[#0F172A]">
                姓名
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                  <UserIcon />
                </span>
                <input
                  id="reg-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  className="h-14 w-full rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] px-11 text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition focus:border-[#6D5CFF] focus:ring-2 focus:ring-[#6D5CFF]/25"
                />
              </div>

              <label htmlFor="reg-email" className="block text-base font-medium text-[#0F172A]">
                Email
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                  <MailIcon />
                </span>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder="you@example.com"
                  className="h-14 w-full rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] px-11 text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition focus:border-[#6D5CFF] focus:ring-2 focus:ring-[#6D5CFF]/25"
                />
              </div>

              <label htmlFor="reg-password" className="block text-base font-medium text-[#0F172A]">
                密碼
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                  <LockIcon />
                </span>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="h-14 w-full rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] px-11 text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition focus:border-[#6D5CFF] focus:ring-2 focus:ring-[#6D5CFF]/25"
                />
              </div>

              <label htmlFor="reg-confirm" className="block text-base font-medium text-[#0F172A]">
                確認密碼
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                  <LockIcon />
                </span>
                <input
                  id="reg-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loading}
                  className="h-14 w-full rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] px-11 text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition focus:border-[#6D5CFF] focus:ring-2 focus:ring-[#6D5CFF]/25"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-[#0F172A]">帳號身分</p>
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="帳號身分">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={role === "parent"}
                    disabled={loading}
                    onClick={() => setRole("parent")}
                    className={`rounded-[20px] border px-4 py-4 text-left transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D5CFF]/35 ${
                      role === "parent"
                        ? "border-[#6D5CFF] bg-[#F4F1FF] shadow-[0_10px_24px_rgba(109,92,255,0.25)]"
                        : "border-[#E5E7EB] bg-white hover:border-[#C4B5FD]"
                    }`}
                  >
                    <p className="text-sm font-bold text-[#0F172A]">我要購買教材</p>
                    <p className="mt-1 text-xs text-[#64748B]">適合家長、教育相關科系學生、在職老師、補教老師與自學使用者</p>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={role === "teacher"}
                    disabled={loading}
                    onClick={() => setRole("teacher")}
                    className={`rounded-[20px] border px-4 py-4 text-left transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D5CFF]/35 ${
                      role === "teacher"
                        ? "border-[#6D5CFF] bg-[#F4F1FF] shadow-[0_10px_24px_rgba(109,92,255,0.25)]"
                        : "border-[#E5E7EB] bg-white hover:border-[#C4B5FD]"
                    }`}
                  >
                    <p className="text-sm font-bold text-[#0F172A]">我要上架教材</p>
                    <p className="mt-1 text-xs text-[#64748B]">適合老師、教材創作者、教保員與教育工作者</p>
                  </button>
                </div>
              </div>

              <label htmlFor="terms" className="inline-flex items-center gap-2 text-sm text-[#64748B]">
                <input
                  id="terms"
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  className="size-4 rounded border-[#CBD5E1] text-[#6D5CFF] focus:ring-[#6D5CFF]/40"
                />
                我同意服務條款與隱私權政策
              </label>

              <button
                type="button"
                disabled={loading}
                onClick={() => void submit()}
                className="flex h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#6366F1] text-white font-bold shadow-[0_14px_28px_rgba(99,102,241,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(99,102,241,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D5CFF]/45 disabled:opacity-60"
              >
                {loading ? "送出中…" : "註冊"}
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
                以 Google 註冊（即將開放）
              </button>
              <button
                type="button"
                disabled
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-[#E5E7EB] bg-white text-[#64748B] transition hover:bg-[#F9FAFB] disabled:opacity-80"
              >
                <IconFacebook />
                以 Facebook 註冊（即將開放）
              </button>
            </div>

            <p className="mt-7 text-center text-sm text-[#64748B]">
              已有帳號？{" "}
              <Link href="/login" className="font-medium text-[#6D5CFF] hover:underline">
                立即登入
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
            <h2 className="text-5xl font-extrabold text-[#0F172A]">開啟專屬學習旅程</h2>
            <p className="mt-3 max-w-xl text-lg text-[#475569]">
              想購買教材或上架內容，都能在這裡找到最適合你的使用方式。
            </p>

            <div className="mt-7 grid grid-cols-4 gap-3">
              {[
                { icon: "🛍️", label: "購買教材" },
                { icon: "🧑‍🏫", label: "上架教材" },
                { icon: "🛡️", label: "安全審核" },
                { icon: "🗂️", label: "教材管理" },
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
                <span className="mt-3 inline-block rounded-full bg-[#EDE9FE] px-3 py-1 text-xs font-semibold text-[#6D5CFF]">角色選擇</span>
                <h3 className="mt-2 text-2xl font-bold text-[#0F172A]">購買 / 上架</h3>
                <p className="mt-1 text-sm text-[#64748B]">依身份啟用最適合你的功能面板</p>
                <p className="mt-3 text-sm font-semibold text-[#0F172A]">⭐ 體驗評分 <span className="font-normal text-[#64748B]">4.9</span></p>
              </article>

              <div className="ml-6 flex w-[260px] flex-col gap-4">
                <article className="rounded-3xl border border-white/65 bg-white/90 p-4 shadow-[0_18px_40px_rgba(79,70,229,0.18)]">
                  <p className="text-sm font-semibold text-[#334155]">角色推薦</p>
                  <p className="mt-2 text-3xl font-bold text-[#0F172A]">購買 / 上架</p>
                  <p className="mt-1 text-xs text-[#64748B]">可隨需求切換學習與教學路徑</p>
                </article>
                <article className="rounded-3xl border border-white/65 bg-white/90 p-4 shadow-[0_18px_40px_rgba(79,70,229,0.18)]">
                  <p className="text-sm font-semibold text-[#334155]">安心加入</p>
                  <p className="mt-2 text-4xl font-bold text-[#0F172A]">已審核</p>
                </article>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

async function parseRegisterError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string };
    if (data.message) return data.message;
  } catch {
    /* ignore */
  }
  return mapStatusMessage(response.status);
}
