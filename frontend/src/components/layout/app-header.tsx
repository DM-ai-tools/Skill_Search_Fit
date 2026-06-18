"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { SiteUrlControl } from "@/components/site-url-control";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useAnalysisStore, SCAN_STATUS_LABELS } from "@/stores/analysis-store";
import { useAuthStore } from "@/stores/auth-store";
import { useProjectStore } from "@/stores/project-store";

export function AppHeader({ title }: { title?: string }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { projects, activeProjectId, setActiveProject } = useProjectStore();
  const phase = useAnalysisStore((s) => s.phase);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const busy = phase === "scanning" || phase === "analyzing" || phase === "generating";

  return (
    <header className="glass-panel-strong mx-3 mt-3 flex min-h-[56px] flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2 sm:px-5">
      {/* Left: title + URL */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        {title && (
          <>
            <h1 className="shrink-0 text-sm font-semibold text-foreground">{title}</h1>
            <div className="hidden h-4 w-px bg-border/60 sm:block" />
          </>
        )}

        <SiteUrlControl compact disabled={busy} className="sm:max-w-sm" />
        {busy && (
          <span className="flex items-center gap-1.5 text-xs text-ai-accent">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ai-accent" />
            {SCAN_STATUS_LABELS[phase]}
          </span>
        )}
      </div>

      {/* Right: project selector + user */}
      <div className="flex items-center gap-3">
        {projects.length > 0 && (
          <div className="hidden sm:block">
            <Select
              className="h-8 min-w-36 text-xs"
              value={activeProjectId || ""}
              onChange={(e) => setActiveProject(e.target.value || null)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <span className="hidden text-xs text-muted sm:block">{user?.name}</span>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          aria-label="Log out"
          className="h-8 w-8 text-muted hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
