"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flame, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { AuthLeftPanel } from "@/components/marketing/auth-left-panel";

export default function SignupPage() {
  const router = useRouter();
  const signup = useAuthStore((s) => s.signup);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!agreedToTerms) {
      setError("Please accept the Terms & Conditions to continue.");
      return;
    }

    setLoading(true);
    try {
      await signup(name, email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;
  const passwordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  return (
    /* Full-screen overlay — covers marketing nav/footer */
    <div className="fixed inset-0 z-[60] flex bg-background">
      {/* ── Left panel ── */}
      <AuthLeftPanel />

      {/* ── Right panel: signup form ── */}
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
            <h1 className="text-2xl font-bold text-foreground">
              Create your account
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              Free to start — no card needed
            </p>
          </div>

          {/* Form card */}
          <div className="marketing-auth-card rounded-2xl border border-border/60 bg-surface p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full name */}
              <div>
                <Label htmlFor="name" className="text-sm font-medium text-foreground">
                  Full name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="auth-input mt-1.5"
                  placeholder="Jane Smith"
                  autoComplete="name"
                />
              </div>

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
                <Label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="auth-input pr-10"
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
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

              {/* Confirm password */}
              <div>
                <Label htmlFor="confirm" className="text-sm font-medium text-foreground">
                  Confirm password
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="confirm"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className={
                      "auth-input pr-10 " +
                      (passwordMismatch
                        ? "border-destructive/50 focus:border-destructive/70"
                        : passwordsMatch
                        ? "border-success/50 focus:border-success/70"
                        : "")
                    }
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-foreground focus:outline-none"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {passwordMismatch && (
                  <p className="mt-1 text-xs text-destructive">
                    Passwords don&apos;t match
                  </p>
                )}
                {passwordsMatch && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="h-3 w-3" />
                    Passwords match
                  </p>
                )}
              </div>

              {/* Terms */}
              <div className="flex items-start gap-2.5 pt-1">
                <input
                  id="terms"
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-border/60 bg-surface-elevated"
                  style={{ accentColor: "var(--primary)" }}
                />
                <Label
                  htmlFor="terms"
                  className="cursor-pointer text-sm leading-relaxed text-muted"
                >
                  I agree to the{" "}
                  <Link
                    href="#"
                    className="text-primary transition-opacity hover:opacity-75"
                  >
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="#"
                    className="text-primary transition-opacity hover:opacity-75"
                  >
                    Privacy Policy
                  </Link>
                </Label>
              </div>

              {/* Error */}
              {error && (
                <p className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-2.5 text-sm text-destructive">
                  {error}
                </p>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Creating account…
                  </span>
                ) : (
                  "Create account"
                )}
              </Button>
            </form>

            {/* Switch to login */}
            <p className="mt-5 text-center text-sm text-muted">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium text-primary transition-opacity hover:opacity-75"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
