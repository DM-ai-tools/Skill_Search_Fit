"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ActivityLog } from "@/lib/types";
import { BentoSectionHeader, BentoTile } from "@/components/bento";
import { Input } from "@/components/ui/input";

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [action, setAction] = useState("");

  useEffect(() => {
    const q = action ? `?action=${encodeURIComponent(action)}` : "";
    api.get<ActivityLog[]>(`/admin/logs${q}`).then(setLogs);
  }, [action]);

  return (
    <div className="space-y-6">
      <BentoSectionHeader
        eyebrow="Admin"
        title="Activity logs"
        description="Audit administrative actions and metadata."
      />
      <BentoTile variant="strong" className="max-w-md">
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">Filter</p>
        <Input placeholder="Filter by action..." value={action} onChange={(e) => setAction(e.target.value)} />
      </BentoTile>
      <div className="space-y-2">
        {logs.map((log) => (
          <BentoTile key={log.id} className="text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{log.action}</span>
                <span className="text-muted">{new Date(log.timestamp).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-muted">
                {log.user_name || "—"} ({log.user_email || "—"})
              </p>
              <pre className="mt-2 overflow-auto rounded-xl border border-border/30 bg-background/60 p-2 text-xs text-foreground/80">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
          </BentoTile>
        ))}
      </div>
    </div>
  );
}
