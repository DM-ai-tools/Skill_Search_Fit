"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AdminReportListItem, AdminReportDetail } from "@/lib/types";
import { BentoSectionHeader, BentoTile } from "@/components/bento";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";

function statusVariant(s: string): "default" | "secondary" | "danger" | "outline" {
  if (s === "completed") return "default";
  if (s === "failed") return "danger";
  if (s === "running") return "secondary";
  return "outline";
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), limit: "30" });
      if (statusFilter) q.set("status", statusFilter);
      const data = await api.get<AdminReportListItem[]>(`/admin/reports?${q}`);
      setReports(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string) => {
    await api.delete(`/admin/reports/${id}`);
    setDeleteId(null);
    if (detail?.id === id) setDetail(null);
    await load();
  };

  const openDetail = async (id: string) => {
    if (detail?.id === id) { setDetail(null); return; }
    setDetailLoading(true);
    try {
      const d = await api.get<AdminReportDetail>(`/admin/reports/${id}`);
      setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = reports.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.user_name.toLowerCase().includes(q) ||
      r.user_email.toLowerCase().includes(q) ||
      r.plugin_name.toLowerCase().includes(q) ||
      (r.project_name || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <BentoSectionHeader
        eyebrow="Admin"
        title="Reports"
        description="All plugin executions across all users."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search user, plugin, project..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-xl border border-border/60 bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
          <option value="pending">Pending</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => load()}>Refresh</Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading reports...</p>
      ) : filtered.length === 0 ? (
        <BentoTile><p className="text-sm text-muted">No reports found.</p></BentoTile>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id}>
              <BentoTile
                interactive
                className="cursor-pointer transition-colors hover:bg-surface-elevated/60"
                onClick={() => openDetail(r.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{r.plugin_name}</span>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      {r.project_name && (
                        <span className="text-xs text-muted">{r.project_name}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {r.user_name} · {r.user_email} · {fmtDate(r.started_at)}
                    </p>
                    {r.error_message && (
                      <p className="text-xs text-destructive line-clamp-1">{r.error_message}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }}
                  >
                    Delete
                  </Button>
                </div>
              </BentoTile>

              {/* Inline detail panel */}
              {detail?.id === r.id && (
                <div
                  className="mt-1 overflow-hidden rounded-xl border border-border/40"
                  style={{
                    background: "rgba(20,26,36,0.82)",
                    backdropFilter: "blur(24px) saturate(180%) brightness(1.08)",
                  }}
                >
                  <div className="space-y-3 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted">Inputs</p>
                    <pre className="overflow-auto rounded-xl border border-border/30 bg-background/60 p-3 text-xs text-foreground/80">
                      {JSON.stringify(detail.inputs, null, 2)}
                    </pre>
                    {detail.result && (
                      <>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Output</p>
                        <pre className="max-h-96 overflow-auto rounded-xl border border-border/30 bg-background/60 p-3 text-xs text-foreground/80">
                          {typeof detail.result === "object"
                            ? (detail.result as Record<string,unknown>).markdown as string
                                ?? JSON.stringify(detail.result, null, 2)
                            : String(detail.result)}
                        </pre>
                      </>
                    )}
                  </div>
                </div>
              )}
              {detailLoading && detail === null && (
                <p className="px-2 py-1 text-xs text-muted">Loading detail...</p>
              )}
            </div>
          ))}
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
          disabled={filtered.length < 30}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete this report?"
        description="This will permanently delete the execution record. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
