"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

export function AuthGuard({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const router = useRouter();
  const { user, loading, fetchUser } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetchUser().finally(() => setChecked(true));
  }, [fetchUser]);

  useEffect(() => {
    if (!checked || loading) return;
    if (!user) {
      router.replace(adminOnly ? "/admin/login" : "/login");
      return;
    }
    if (adminOnly && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, loading, checked, adminOnly, router]);

  if (!checked || loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted">
        Loading...
      </div>
    );
  }

  if (adminOnly && user.role !== "admin") return null;

  return <>{children}</>;
}
