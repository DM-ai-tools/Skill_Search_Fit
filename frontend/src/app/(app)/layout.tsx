"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { BackgroundAnalysisProvider } from "@/components/analysis/background-analysis-provider";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useAuthStore } from "@/stores/auth-store";
import { useProjectStore } from "@/stores/project-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function ImpersonationBanner() {
  const router = useRouter();
  const { user, fetchUser } = useAuthStore();
  const [exiting, setExiting] = useState(false);

  if (!user?.is_impersonating) return null;

  const exit = async () => {
    setExiting(true);
    try {
      await api.post("/auth/impersonate/exit");
      await fetchUser();
      router.push("/admin/users");
    } finally {
      setExiting(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 bg-warning/15 px-5 py-2.5 text-sm border-b border-warning/25">
      <div className="flex items-center gap-2 text-warning">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>
          Viewing as <strong>{user.name}</strong> ({user.email}) — admin impersonation mode
        </span>
      </div>
      <button
        onClick={exit}
        disabled={exiting}
        className="shrink-0 rounded-lg border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning transition-colors hover:bg-warning/20 disabled:opacity-60"
      >
        {exiting ? "Exiting..." : "Exit impersonation"}
      </button>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const pathname = usePathname();
  const isWorkspace = pathname.startsWith("/workspace");
  const isReportView =
    pathname.startsWith("/reports/view") || pathname.startsWith("/reports/pipeline-view");
  const hideSiteUrl = isWorkspace || isReportView;
  const compactHeader = hideSiteUrl;

  useEffect(() => {
    fetchProjects().catch(() => undefined);
  }, [fetchProjects]);

  return (
    <AuthGuard>
      <BackgroundAnalysisProvider>
        <div className="flex min-h-screen flex-col bg-background">
          <ImpersonationBanner />
          <div className="flex min-h-0 flex-1">
            <AppSidebar />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {!isWorkspace && <AppHeader compact={compactHeader} hideSiteUrl={hideSiteUrl} />}
              <main
                className={cn(
                  "flex-1",
                  isWorkspace && "min-h-0 overflow-hidden p-3 sm:p-4",
                  isReportView && "overflow-auto p-3 sm:p-4",
                  !isWorkspace && !isReportView && "overflow-auto p-6",
                )}
              >
                <div
                  className={cn(
                    isWorkspace && "h-full w-full",
                    isReportView && "w-full",
                    !isWorkspace && !isReportView && "mx-auto max-w-[1400px]",
                  )}
                >
                  {children}
                </div>
              </main>
            </div>
          </div>
        </div>
      </BackgroundAnalysisProvider>
    </AuthGuard>
  );
}
