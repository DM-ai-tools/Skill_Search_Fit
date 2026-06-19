"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useChangeSuggestionsStore } from "@/stores/change-suggestions-store";
import {
  changeSuggestionsApi,
  type ApprovalStatus,
  type ChangeDestination,
} from "@/lib/change-suggestions-api";
import { ChangeCard } from "@/components/change-suggestions/change-card";
import { FilterBar, type Filters } from "@/components/change-suggestions/filter-bar";
import { ResultsTable } from "@/components/change-suggestions/results-table";
import { PublishConfirmModal } from "@/components/change-suggestions/publish-confirm-modal";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatApiError } from "@/lib/format-api-error";
import {
  ArrowLeft,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Download,
  Copy,
  CheckCircle2,
} from "lucide-react";

const DESTINATIONS: ChangeDestination[] = ["WordPress", "Webflow", "Wix", "Mailchimp"];

type View = "review" | "publish";

type DestState = {
  payload: string | null;
  generating: boolean;
  publishing: boolean;
  copied: boolean;
  error: string;
};

export default function PlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSuggestionId = searchParams.get("suggestionId");

  const {
    suggestionId,
    filename,
    mergedChanges,
    setOverride,
    bulkApprove,
    bulkReject,
    loadSuggestion,
    setPublishResults,
    publishResults,
    publishDryRun,
    reset,
  } = useChangeSuggestionsStore();

  const changes = mergedChanges();

  // ── Load from URL if store doesn't have this report ───────────────────────
  useEffect(() => {
    if (!urlSuggestionId || urlSuggestionId === suggestionId) return;
    changeSuggestionsApi.get(urlSuggestionId).then(loadSuggestion).catch(() => setLoadError(true));
  }, [urlSuggestionId, suggestionId, loadSuggestion]);

  // ── Local state ───────────────────────────────────────────────────────────
  const [view, setView] = useState<View>("review");
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    priority: "",
    changeType: "",
    destination: "",
  });
  const [error, setError] = useState("");
  const [livePublish, setLivePublish] = useState(false);
  const [confirmDest, setConfirmDest] = useState<ChangeDestination | null>(null);
  const [destStates, setDestStates] = useState<Record<string, DestState>>({});

  // ── Derived ───────────────────────────────────────────────────────────────
  const counts = useMemo(
    () => ({
      approved: changes.filter((c) => c.approval_status === "approved").length,
      rejected: changes.filter((c) => c.approval_status === "rejected").length,
      pending: changes.filter((c) => c.approval_status === "pending").length,
      total: changes.length,
    }),
    [changes],
  );

  const filtered = useMemo(() => {
    return changes.filter((c) => {
      if (filters.priority && c.priority !== filters.priority) return false;
      if (filters.changeType && c.change_type !== filters.changeType) return false;
      if (filters.destination && c.destination !== filters.destination) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (
          !c.field_label.toLowerCase().includes(q) &&
          !c.page_url.toLowerCase().includes(q) &&
          !c.proposed_content.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [changes, filters]);

  const grouped = useMemo(() => {
    const result: Record<string, Record<string, typeof filtered>> = {};
    for (const dest of DESTINATIONS) {
      const byPage: Record<string, typeof filtered> = {};
      for (const c of filtered.filter((x) => x.destination === dest)) {
        (byPage[c.page_url] ||= []).push(c);
      }
      if (Object.keys(byPage).length > 0) result[dest] = byPage;
    }
    return result;
  }, [filtered]);

  const approved = changes.filter((c) => c.approval_status === "approved");
  const destinationsWithApproved = DESTINATIONS.filter((d) =>
    approved.some((c) => c.destination === d),
  );
  const approvalPct = counts.total
    ? Math.round((counts.approved / counts.total) * 100)
    : 0;

  // ── Review sync helpers ───────────────────────────────────────────────────
  const syncChange = async (
    changeId: string,
    update: { approval_status?: ApprovalStatus; edited_content?: string },
  ) => {
    if (!suggestionId) return;
    try {
      await changeSuggestionsApi.patchChange(suggestionId, changeId, update);
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const handleApprove = (changeId: string) => {
    setOverride(changeId, { approvalStatus: "approved" });
    syncChange(changeId, { approval_status: "approved" });
  };

  const handleReject = (changeId: string) => {
    setOverride(changeId, { approvalStatus: "rejected" });
    syncChange(changeId, { approval_status: "rejected" });
  };

  const handleEdit = (changeId: string, content: string) => {
    setOverride(changeId, { editedContent: content });
    syncChange(changeId, { edited_content: content });
  };

  const handleBulkApprove = () => {
    const ids = filtered.map((c) => c.id);
    bulkApprove(ids);
    ids.forEach((id) => syncChange(id, { approval_status: "approved" }));
  };

  const handleBulkReject = () => {
    const ids = filtered.map((c) => c.id);
    bulkReject(ids);
    ids.forEach((id) => syncChange(id, { approval_status: "rejected" }));
  };

  // ── Publish helpers ───────────────────────────────────────────────────────
  const getDs = (dest: string): DestState =>
    destStates[dest] ?? {
      payload: null,
      generating: false,
      publishing: false,
      copied: false,
      error: "",
    };

  const setDs = (dest: string, update: Partial<DestState>) =>
    setDestStates((s) => ({ ...s, [dest]: { ...getDs(dest), ...update } }));

  const handleGeneratePayload = async (dest: ChangeDestination) => {
    if (!suggestionId) return;
    setDs(dest, { generating: true, error: "" });
    try {
      const resp = await changeSuggestionsApi.generatePayload(suggestionId, dest);
      setDs(dest, { payload: resp.content, generating: false });
    } catch (err) {
      setDs(dest, { generating: false, error: formatApiError(err) });
    }
  };

  const handleDownload = (dest: ChangeDestination) => {
    const state = getDs(dest);
    if (!state.payload) return;
    const ext = dest === "Mailchimp" ? "json" : "html";
    const blob = new Blob([state.payload], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dest.toLowerCase()}-payload.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async (dest: ChangeDestination) => {
    const state = getDs(dest);
    if (!state.payload) return;
    await navigator.clipboard.writeText(state.payload);
    setDs(dest, { copied: true });
    setTimeout(() => setDs(dest, { copied: false }), 2000);
  };

  const initiatePublish = (dest: ChangeDestination) => {
    if (livePublish) {
      setConfirmDest(dest);
    } else {
      doPublish(dest, true);
    }
  };

  const doPublish = async (dest: ChangeDestination, isDryRun: boolean) => {
    if (!suggestionId) return;
    setConfirmDest(null);
    setDs(dest, { publishing: true, error: "" });
    try {
      const resp = await changeSuggestionsApi.publish(suggestionId, dest, isDryRun);
      setPublishResults(resp.results, resp.dry_run);
      setDs(dest, { publishing: false });
    } catch (err) {
      setDs(dest, { publishing: false, error: formatApiError(err) });
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (!suggestionId || changes.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        {urlSuggestionId && !loadError ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted">Loading report…</p>
          </>
        ) : (
          <>
            {loadError && (
              <p className="text-sm text-destructive">Failed to load report.</p>
            )}
            <p className="font-medium text-muted">No report loaded.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/reports/review")}
            >
              Upload a report
            </Button>
          </>
        )}
      </div>
    );
  }

  // ── Page ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      {/* ── Sticky plan header ─────────────────────────────────────────────── */}
      <div className="glass-panel-strong sticky top-0 z-20 rounded-2xl px-5 py-4">
        {/* Top row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: back + identity */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/reports/review")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Back to upload"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                Implementation Plan
              </p>
              <p className="truncate text-sm font-semibold text-foreground leading-tight">
                {filename}
              </p>
            </div>
          </div>

          {/* Right: stats + action */}
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 text-sm sm:flex">
              <span className="flex items-center gap-1 font-medium text-success">
                <Check className="h-3.5 w-3.5" />
                {counts.approved}
              </span>
              <span className="flex items-center gap-1 font-medium text-destructive">
                <X className="h-3.5 w-3.5" />
                {counts.rejected}
              </span>
              <span className="text-muted">{counts.pending} pending</span>
            </div>
            {view === "review" ? (
              <Button
                size="sm"
                onClick={() => setView("publish")}
                disabled={counts.approved === 0}
                className="disabled:opacity-40"
              >
                Proceed to publish →
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setView("review")}>
                ← Back to review
              </Button>
            )}
            <button
              onClick={reset}
              className="text-xs text-muted/60 hover:text-muted transition-colors"
              title="Clear and start over"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Tab switcher — below on all screens */}
        <div className="mt-3 flex items-center gap-0.5 rounded-xl border border-border/40 bg-background/60 p-0.5 w-fit">
          <button
            onClick={() => setView("review")}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              view === "review"
                ? "bg-surface-elevated text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            Review
            <span className="ml-1.5 font-mono text-[10px] text-muted/60">
              {counts.total}
            </span>
          </button>
          <button
            onClick={() => setView("publish")}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              view === "publish"
                ? "bg-surface-elevated text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            Publish
            {counts.approved > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold text-primary-foreground">
                {counts.approved}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <p className="rounded-xl border border-destructive/25 bg-destructive-soft/20 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* ── Body: sidebar + main ───────────────────────────────────────────── */}
      <div className="flex gap-5 items-start">
        {/* ── Left sidebar (≥lg) ─────────────────────────────────────────── */}
        <aside className="hidden lg:flex w-64 xl:w-72 shrink-0 sticky top-[120px] self-start flex-col gap-4">
          {/* Approval progress — bento sidebar stats */}
          <div className="bento-grid-4 gap-2">
            <div className="bento-tile bento-wide col-span-full space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Progress
                </p>
                <p className="font-mono text-2xl font-bold tabular-nums text-primary">{approvalPct}%</p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${approvalPct}%` }}
                />
              </div>
            </div>
            <div className="bento-tile text-center py-3">
              <p className="text-xl font-bold tabular-nums text-success">{counts.approved}</p>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted">Done</p>
            </div>
            <div className="bento-tile text-center py-3">
              <p className="text-xl font-bold tabular-nums text-destructive">{counts.rejected}</p>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted">Skip</p>
            </div>
            <div className="bento-tile text-center py-3 col-span-2">
              <p className="text-xl font-bold tabular-nums text-foreground">{counts.pending}</p>
              <p className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted">Open</p>
            </div>
          </div>

          {/* Bulk actions (review only) */}
          {view === "review" && (
            <div className="glass-panel rounded-2xl p-4 space-y-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">
                Bulk actions
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={handleBulkApprove}
              >
                <Check className="h-3.5 w-3.5 text-success" />
                Approve visible ({filtered.length})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start gap-2 text-muted hover:text-foreground"
                onClick={handleBulkReject}
              >
                <X className="h-3.5 w-3.5" />
                Reject visible
              </Button>
            </div>
          )}

          {/* Filters (review only) */}
          {view === "review" && (
            <div className="glass-panel rounded-2xl p-4">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted mb-3">
                Filter
              </p>
              <FilterBar filters={filters} onChange={setFilters} layout="vertical" />
            </div>
          )}
        </aside>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">
          {/* Mobile: filter strip */}
          {view === "review" && (
            <div className="mb-4 lg:hidden">
              <FilterBar filters={filters} onChange={setFilters} />
            </div>
          )}

          {/* ── Review mode ─────────────────────────────────────────────── */}
          {view === "review" && (
            <div className="space-y-6">
              {filtered.length === 0 && (
                <p className="py-16 text-center text-sm text-muted">
                  No changes match the current filters.
                </p>
              )}
              {Object.entries(grouped).map(([dest, byPage]) => (
                <section key={dest} className="space-y-3">
                  <h2 className="pl-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted/70">
                    {dest}
                  </h2>
                  {Object.entries(byPage).map(([pageUrl, pageChanges]) => (
                    <div key={pageUrl} className="space-y-2">
                      <p className="truncate pl-1 text-[11px] font-medium text-muted/50">
                        {pageUrl}
                      </p>
                      {pageChanges.map((c) => (
                        <ChangeCard
                          key={c.id}
                          change={c}
                          approvalStatus={c.approval_status}
                          editedContent={c.edited_content ?? undefined}
                          onApprove={() => handleApprove(c.id)}
                          onReject={() => handleReject(c.id)}
                          onEdit={(content) => handleEdit(c.id, content)}
                        />
                      ))}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}

          {/* ── Publish mode ─────────────────────────────────────────────── */}
          {view === "publish" && (
            <div className="space-y-4">
              {approved.length === 0 ? (
                <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
                  <AlertTriangle className="h-10 w-10 text-warning" />
                  <p className="font-semibold text-foreground">No approved changes</p>
                  <p className="text-sm text-muted">
                    Go back to Review and approve at least one change.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setView("review")}>
                    ← Back to review
                  </Button>
                </div>
              ) : (
                <>
                  {/* Dry-run toggle */}
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/25 bg-warning-soft/20 px-4 py-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                    <p className="flex-1 text-sm text-warning/90">
                      <strong>{livePublish ? "Live mode on." : "Dry-run mode."}</strong>{" "}
                      {livePublish
                        ? "Changes will be pushed to your live site."
                        : "Simulating publish — nothing will change."}
                    </p>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-warning/80">
                      <span>{livePublish ? "Live" : "Test"}</span>
                      <Switch
                        checked={livePublish}
                        onCheckedChange={setLivePublish}
                        className={livePublish ? "bg-destructive" : undefined}
                      />
                    </label>
                  </div>

                  {/* Per-destination panels */}
                  {destinationsWithApproved.map((dest) => {
                    const ds = getDs(dest);
                    const destApproved = approved.filter((c) => c.destination === dest);
                    return (
                      <div
                        key={dest}
                        className="glass-panel overflow-hidden rounded-2xl"
                      >
                        {/* Panel header */}
                        <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
                          <div>
                            <p className="font-semibold text-foreground">{dest}</p>
                            <p className="mt-0.5 text-xs text-muted">
                              {destApproved.length} change
                              {destApproved.length !== 1 ? "s" : ""} approved
                            </p>
                          </div>
                          <Button
                            onClick={() => initiatePublish(dest)}
                            disabled={ds.publishing}
                            variant={livePublish ? "destructive" : "default"}
                            size="sm"
                          >
                            {ds.publishing ? (
                              <>
                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                Publishing…
                              </>
                            ) : livePublish ? (
                              "Publish LIVE"
                            ) : (
                              "Dry-run publish"
                            )}
                          </Button>
                        </div>

                        {/* Panel body */}
                        <div className="space-y-4 p-5">
                          {ds.error && (
                            <p className="text-sm text-destructive">{ds.error}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleGeneratePayload(dest)}
                              disabled={ds.generating}
                            >
                              {ds.generating ? (
                                <>
                                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                  Generating…
                                </>
                              ) : (
                                "Preview payload"
                              )}
                            </Button>
                            {ds.payload && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDownload(dest)}
                                >
                                  <Download className="mr-2 h-3.5 w-3.5" />
                                  Download
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCopy(dest)}
                                >
                                  {ds.copied ? (
                                    <>
                                      <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-success" />
                                      Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="mr-2 h-3.5 w-3.5" />
                                      Copy
                                    </>
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                          {ds.payload && (
                            <pre className="max-h-56 overflow-auto rounded-xl border border-border bg-background/80 p-4 font-mono text-xs leading-relaxed text-foreground">
                              {ds.payload.slice(0, 3000)}
                              {ds.payload.length > 3000 &&
                                "\n…(truncated — download for full output)"}
                            </pre>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Publish results */}
                  {publishResults && (
                    <div className="glass-panel rounded-2xl p-5">
                      <p className="mb-3 text-sm font-semibold text-foreground">
                        Publish results
                      </p>
                      <ResultsTable results={publishResults} dryRun={publishDryRun} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Confirm modal ─────────────────────────────────────────────────── */}
      {confirmDest && (
        <PublishConfirmModal
          destination={confirmDest}
          approvedCount={approved.filter((c) => c.destination === confirmDest).length}
          onConfirm={() => doPublish(confirmDest, false)}
          onCancel={() => setConfirmDest(null)}
        />
      )}
    </div>
  );
}
