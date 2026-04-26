"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthSplitLayout } from "../../components/layout/AuthSplitLayout";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Input } from "../../components/ui/Input";
import { IconEye, IconEyeOff, IconFacebook, IconGoogle } from "../../components/ui/icons";
import type { LoginResponse } from "../../lib/auth";
import { mapStatusMessage } from "../../lib/auth";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Email 格式不正確"),
  password: z.string().min(1, "請輸入密碼"),
});

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
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      router.push(redirect || "/");
    } catch {
      setMessage(mapStatusMessage(500));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitLayout illustrationSide="login">
      <div className="mx-auto w-full max-w-md space-y-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-[#6C63FF]">EduMarket</p>
          <h1 className="mt-2 text-3xl font-bold text-[#1F2937]">Welcome Back!</h1>
          <p className="mt-2 text-sm text-[#6B7280]">登入以繼續您的學習之旅</p>
        </div>

        <div className="space-y-4">
          <Input
            id="login-email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={loading}
          />
          <Input
            id="login-password"
            label="密碼"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={loading}
            rightSlot={
              <button
                type="button"
                className="rounded-xl p-2 text-[#6B7280] hover:bg-[#F4F1FF] hover:text-[#6C63FF]"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "隱藏密碼" : "顯示密碼"}
              >
                {showPw ? <IconEyeOff /> : <IconEye />}
              </button>
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Checkbox id="remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} label="記住我" />
            <Link href="/login" className="text-sm font-medium text-[#6C63FF] hover:underline" onClick={(e) => e.preventDefault()}>
              忘記密碼？
            </Link>
          </div>
          <Button type="button" fullWidth disabled={loading} onClick={() => void handleLogin()}>
            {loading ? "登入中…" : "登入"}
          </Button>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#9CA3AF]">
          <span className="h-px flex-1 bg-[#E5E7EB]" />
          或
          <span className="h-px flex-1 bg-[#E5E7EB]" />
        </div>

        <div className="flex flex-col gap-3">
          <Button type="button" variant="social" fullWidth disabled className="opacity-70">
            <IconGoogle />
            以 Google 登入（即將開放）
          </Button>
          <Button type="button" variant="social" fullWidth disabled className="opacity-70">
            <IconFacebook />
            以 Facebook 登入（即將開放）
          </Button>
        </div>

        <p className="text-center text-sm text-[#6B7280]">
          還沒有帳號？{" "}
          <Link href="/register" className="font-semibold text-[#6C63FF] hover:underline">
            立即註冊
          </Link>
        </p>
        {message ? <p className="text-center text-sm text-[#F59E0B]">{message}</p> : null}
      </div>
    </AuthSplitLayout>
  );
}
