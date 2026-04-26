"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { AuthSplitLayout } from "../../components/layout/AuthSplitLayout";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Input } from "../../components/ui/Input";
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
    <AuthSplitLayout illustrationSide="register">
      <div className="mx-auto w-full max-w-md space-y-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-[#6C63FF]">EduMarket</p>
          <h1 className="mt-2 text-3xl font-bold text-[#1F2937]">Create Account</h1>
          <p className="mt-2 text-sm text-[#6B7280]">加入我們，開啟學習新旅程</p>
        </div>

        <div className="space-y-4">
          <Input id="reg-name" label="姓名" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} />
          <Input
            id="reg-email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <Input
            id="reg-password"
            label="密碼"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <Input
            id="reg-confirm"
            label="確認密碼"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
          />
          <fieldset className="space-y-2 rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] p-4">
            <legend className="px-1 text-sm font-medium text-[#1F2937]">帳號身分</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="role" checked={role === "parent"} onChange={() => setRole("parent")} />
              家長（購買教材）
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="role" checked={role === "teacher"} onChange={() => setRole("teacher")} />
              老師（上架教材）
            </label>
          </fieldset>
          <Checkbox id="terms" checked={terms} onChange={(e) => setTerms(e.target.checked)} label="我同意服務條款與隱私權政策" />
          <Button type="button" fullWidth disabled={loading} onClick={() => void submit()}>
            {loading ? "送出中…" : "註冊"}
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <Button type="button" variant="social" fullWidth disabled className="opacity-70">
            <IconGoogle />
            以 Google 註冊（即將開放）
          </Button>
          <Button type="button" variant="social" fullWidth disabled className="opacity-70">
            <IconFacebook />
            以 Facebook 註冊（即將開放）
          </Button>
        </div>

        <p className="text-center text-sm text-[#6B7280]">
          已有帳號？{" "}
          <Link href="/login" className="font-semibold text-[#6C63FF] hover:underline">
            立即登入
          </Link>
        </p>
        {message ? <p className="text-center text-sm text-[#F59E0B]">{message}</p> : null}
      </div>
    </AuthSplitLayout>
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
