"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { api } from "@/lib/api";
import type { ActivityLog } from "@/lib/types";
import { BentoSectionHeader, BentoTile } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function fmtDate(d: string) {
  return new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
}

function exportCsv(logs: ActivityLog[]) {
  const header = ["timestamp", "action", "user_name", "user_email", "ip_address", "metadata"];
  const rows = logs.map((l) => [
    l.timestamp,
    l.action,
    l.user_name ?? "",
    l.user_email ?? "",
    l.ip_address ?? "",
    JSON.stringify(l.metadata),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), limit: "30" });
      if (action) q.set("action", action);
      if (dateFrom) q.set("date_from", new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        q.set("date_to", end.toISOString());
      }
      const data = await api.get<ActivityLog[]>(`/admin/logs?${q}`);
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilters = () => { setPage(1); load(); };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <BentoSectionHeader
        eyebrow="Admin"
        title="Audit Trail"
        description="Full searchable log of every admin and user action in the system."
      />

      {/* Filters */}
      <BentoTile variant="strong" className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1 space-y-1">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted">Action</label>
          <Input
            placeholder="Filter by action..."
            value={action}
            onChange={(e) => setAction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
        </div>
        <Button onClick={applyFilters} size="sm">Apply</Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setAction(""); setDateFrom(""); setDateTo(""); setPage(1); }}
        >
          Clear
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-1.5"
          onClick={() => exportCsv(logs)}
          disabled={logs.length === 0}
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </BentoTile>

      {/* Log table */}
      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : logs.length === 0 ? (
        <BentoTile><p className="text-sm text-muted">No activity found.</p></BentoTile>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-surface/60">
                {["", "Timestamp", "Action", "User", "IP"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {logs.map((log) => (
                <Fragment key={log.id}>
                  <tr
                    className="cursor-pointer transition-colors hover:bg-surface/40"
                    onClick={() => toggleExpand(log.id)}
                  >
                    <td className="px-3 py-3 text-muted">
                      {expanded.has(log.id)
                        ? <ChevronDown className="h-3.5 w-3.5" />
                        : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{fmtDate(log.timestamp)}</td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{log.action}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-foreground">{log.user_name ?? "—"}</p>
                      <p className="text-xs text-muted">{log.user_email ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{log.ip_address ?? "—"}</td>
                  </tr>
                  {expanded.has(log.id) && (
                    <tr className="bg-surface/60">
                      <td colSpan={5} className="px-6 py-3">
                        <pre className={cn(
                          "overflow-auto rounded-xl border border-border/30 bg-background/60 p-3 text-xs text-foreground/80",
                          "max-h-48"
                        )}>
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span className="text-sm text-muted">Page {page}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={logs.length < 30}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
