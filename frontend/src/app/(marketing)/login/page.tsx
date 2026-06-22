"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Flame, Eye, EyeOff, ShieldCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { AuthLeftPanel } from "@/components/marketing/auth-left-panel";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, false, remember);
      const redirect = searchParams.get("redirect") || "/dashboard";
      router.push(redirect);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    /* Full-screen overlay — covers marketing nav/footer */
    <div className="fixed inset-0 z-[60] flex bg-background">
      {/* ── Left panel ── */}
      <AuthLeftPanel />

      {/* ── Right panel: login form ── */}
      <div className="flex w-full flex-col items-center justify-center overflow-y-auto bg-background px-6 py-12 md:w-1/2">
        <div className="auth-enter auth-enter-d1 w-full max-w-sm">

          {/* Mobile-only logo */}
          <div className="mb-8 flex flex-col items-center gap-3 md:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25">
              <Flame className="h-6 w-6 text-primary" />
            </div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/70">
              SkillSearchFit
            </p>
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
            <p className="mt-1.5 text-sm text-muted">
              Sign in to your account
            </p>
          </div>

          {/* Form card */}
          <div className="marketing-auth-card rounded-2xl border border-border/60 bg-surface p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <Label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="auth-input mt-1.5"
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-foreground">
                    Password
                  </Label>
                  <Link
                    href="#"
                    className="text-xs text-primary transition-opacity hover:opacity-75"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="auth-input pr-10"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-2.5">
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border border-border/60 bg-surface-elevated"
                  style={{ accentColor: "var(--primary)" }}
                />
                <Label htmlFor="remember" className="cursor-pointer text-sm text-muted">
                  Keep me signed in
                </Label>
              </div>

              {/* Error */}
              {error && (
                <p className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-2.5 text-sm text-destructive">
                  {error}
                </p>
              )}

              {/* Submit */}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Signing in…
                  </span>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>

            {/* Switch to signup */}
            <p className="mt-5 text-center text-sm text-muted">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-medium text-primary transition-opacity hover:opacity-75"
              >
                Create one free
              </Link>
            </p>
          </div>

          {/* ── Admin login separator ── */}
          <div className="mt-6">
            <div className="relative flex items-center gap-3">
              <div className="flex-1 border-t border-border/40" />
              <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted/60">
                Admin access
              </span>
              <div className="flex-1 border-t border-border/40" />
            </div>

            {/* Glassmorphism admin button */}
            <Link href="/admin/login" className="mt-3 block">
              <div className="auth-glass-btn group flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 transition-transform duration-300 group-hover:scale-110">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Admin Portal
                  </p>
                  <p className="text-xs text-muted">
                    Requires administrator credentials
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background text-muted">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
