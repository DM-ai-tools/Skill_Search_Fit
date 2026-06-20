"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Puzzle, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminDashboardStats, ActivityLog } from "@/lib/types";
import { BentoGrid, BentoSectionHeader, BentoStatTile, BentoTile } from "@/components/bento";
import { Button } from "@/components/ui/button";

function fmtDate(d: string) {
  return new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    api.get<AdminDashboardStats>("/admin/dashboard").then(setStats);
    api.get<ActivityLog[]>("/admin/logs?limit=20").then(setLogs);
  }, []);

  if (!stats) return <p className="text-muted">Loading stats...</p>;

  return (
    <div className="space-y-8">
      <BentoSectionHeader
        eyebrow="Admin"
        title="Platform overview"
        description="Operational health, usage, and catalog activity."
      />

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/plugins">
          <Button variant="outline" size="sm" className="gap-2">
            <Puzzle className="h-4 w-4" /> Add Plugin
          </Button>
        </Link>
        <Link href="/admin/users">
          <Button variant="outline" size="sm" className="gap-2">
            <UserPlus className="h-4 w-4" /> Invite User
          </Button>
        </Link>
        <Link href="/admin/reports">
          <Button variant="outline" size="sm" className="gap-2">
            <FileText className="h-4 w-4" /> View All Reports
          </Button>
        </Link>
      </div>

      {/* Stats tiles */}
      <BentoGrid columns={4}>
        {[
          { label: "Active users",      value: stats.total_active_users },
          { label: "Projects",          value: stats.total_projects },
          { label: "Executions (7d)",   value: stats.executions_last_7_days },
          { label: "New signups (7d)",  value: stats.new_signups_last_7_days },
          { label: "Saved outputs",     value: stats.total_saved_outputs },
          { label: "Total plugins",     value: stats.total_plugins },
          { label: "Enabled plugins",   value: stats.enabled_plugins },
        ].map((s, index) => (
          <BentoStatTile
            key={s.label}
            label={s.label}
            value={s.value}
            span={index === 0 ? "hero" : "default"}
            tone={index === 0 ? "primary" : "default"}
          />
        ))}
      </BentoGrid>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Top plugins */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Top plugins (30 days)</h2>
          <BentoTile span="wide" className="space-y-2">
            {stats.top_plugins_last_30_days.map((p) => (
              <div key={p.plugin_id} className="flex justify-between rounded-xl border border-border/40 bg-surface/40 px-4 py-3 transition-colors hover:bg-surface/60">
                <span className="text-sm font-medium">{p.plugin_name}</span>
                <span className="text-sm text-muted">{p.execution_count} runs</span>
              </div>
            ))}
            {stats.top_plugins_last_30_days.length === 0 && (
              <p className="text-sm text-muted">No executions yet.</p>
            )}
          </BentoTile>
        </section>

        {/* Recent activity */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Recent activity</h2>
            <Link href="/admin/logs" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <BentoTile className="space-y-1 p-0 overflow-hidden">
            {logs.length === 0 && (
              <p className="p-4 text-sm text-muted">No activity yet.</p>
            )}
            {logs.slice(0, 12).map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-3 border-b border-border/20 px-4 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{log.action}</p>
                  <p className="text-xs text-muted">{log.user_name ?? "—"}</p>
                </div>
                <span className="shrink-0 text-xs text-muted">{fmtDate(log.timestamp)}</span>
              </div>
            ))}
          </BentoTile>
        </section>
      </div>
    </div>
  );
}
