"use client";

import { useEffect } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { BackgroundAnalysisProvider } from "@/components/analysis/background-analysis-provider";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useProjectStore } from "@/stores/project-store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const fetchProjects = useProjectStore((s) => s.fetchProjects);

  useEffect(() => {
    fetchProjects().catch(() => undefined);
  }, [fetchProjects]);

  return (
    <AuthGuard>
      <BackgroundAnalysisProvider>
        <div className="flex min-h-screen bg-background">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppHeader />
            <main className="flex-1 overflow-auto p-6">
              <div className="mx-auto max-w-[1400px]">{children}</div>
            </main>
          </div>
        </div>
      </BackgroundAnalysisProvider>
    </AuthGuard>
  );
}
