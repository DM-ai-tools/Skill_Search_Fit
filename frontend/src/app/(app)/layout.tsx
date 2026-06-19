"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { BackgroundAnalysisProvider } from "@/components/analysis/background-analysis-provider";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useProjectStore } from "@/stores/project-store";
import { cn } from "@/lib/utils";

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
        <div className="flex min-h-screen bg-background">
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
      </BackgroundAnalysisProvider>
    </AuthGuard>
  );
}
