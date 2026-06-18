"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AdminDashboardStats } from "@/lib/types";
import { BentoGrid, BentoSectionHeader, BentoStatTile, BentoTile } from "@/components/bento";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);

  useEffect(() => {
    api.get<AdminDashboardStats>("/admin/dashboard").then(setStats);
  }, []);

  if (!stats) return <p className="text-muted">Loading stats...</p>;

  return (
    <div className="space-y-8">
      <BentoSectionHeader
        eyebrow="Admin"
        title="Platform overview"
        description="Operational health, usage, and catalog activity."
      />
      <BentoGrid columns={4}>
        {[
          { label: "Active users", value: stats.total_active_users },
          { label: "Projects", value: stats.total_projects },
          { label: "Executions (7d)", value: stats.executions_last_7_days },
          { label: "New signups (7d)", value: stats.new_signups_last_7_days },
          { label: "Saved outputs", value: stats.total_saved_outputs },
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

      <section>
        <h2 className="text-lg font-semibold">Top plugins (30 days)</h2>
        <BentoTile span="wide" className="mt-4 space-y-2">
          {stats.top_plugins_last_30_days.map((p) => (
            <div key={p.plugin_id} className="flex justify-between rounded-xl border border-border/40 bg-surface/40 p-4 hover:bg-surface/60 transition-colors">
              <span>{p.plugin_name}</span>
              <span className="text-muted">{p.execution_count} runs</span>
            </div>
          ))}
          {stats.top_plugins_last_30_days.length === 0 && (
            <p className="text-sm text-muted">No executions yet.</p>
          )}
        </BentoTile>
      </section>
    </div>
  );
}
