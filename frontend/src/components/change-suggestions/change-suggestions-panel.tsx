"use client";

import { useEffect, useMemo, useState } from "react";
import { X, CheckCheck, XCircle, Sparkles, Send, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChangeCard } from "@/components/change-suggestions/change-card";
import { FilterBar, type Filters } from "@/components/change-suggestions/filter-bar";
import { PublishConfirmModal } from "@/components/change-suggestions/publish-confirm-modal";
import { useChangeSuggestionsStore } from "@/stores/change-suggestions-store";
import { useIntegrationsStore } from "@/stores/integrations-store";
import {
  changeSuggestionsApi,
  type ApprovalStatus,
  type ChangeDestination,
  type PayloadResponse,
  type PublishResponse,
} from "@/lib/change-suggestions-api";
import { integrationsApi } from "@/lib/integrations-api";
import type { ElementorCheckResponse, PlatformPublishResponse } from "@/lib/integrations-api";

type PanelTab = "review" | "publish";

const DESTINATIONS: ChangeDestination[] = ["WordPress", "Webflow", "Wix"];

interface ChangeSuggestionsPanelProps {
  open: boolean;
  suggestionId: string | null;
  onClose: () => void;
  preloading?: boolean;
  preloadError?: string | null;
  onRetryPreload?: () => void;
}

function ChangeCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-surface/50">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] animate-pulse bg-surface-elevated/70" />
      <div className="space-y-3 pl-5 pr-4 pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function ChangeSuggestionsPanel({
  open,
  suggestionId,
  onClose,
  preloading = false,
  preloadError = null,
  onRetryPreload,
}: ChangeSuggestionsPanelProps) {
  const {
    changes,
    overrides,
    loadSuggestion,
    setOverride,
    bulkApprove,
    bulkReject,
    setPublishResults,
    mergedChanges,
  } = useChangeSuggestionsStore();
  const publishWordPress = useIntegrationsStore((s) => s.publishWordPress);
  const publishWebflow = useIntegrationsStore((s) => s.publishWebflow);
  const publishWix = useIntegrationsStore((s) => s.publishWix);
  const integrationFor = useIntegrationsStore((s) => s.integrationFor);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<PanelTab>("review");
  const [filters, setFilters] = useState<Filters>({
    search: "",
    priority: "",
    changeType: "",
    destination: "",
  });
  const [selectedDest, setSelectedDest] = useState<ChangeDestination>("WordPress");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [payload, setPayload] = useState<PayloadResponse | null>(null);
  const [publishResult, setPublishResult] = useState<PublishResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [payloadExpanded, setPayloadExpanded] = useState(false);
  const [elementorStatus, setElementorStatus] = useState<ElementorCheckResponse | null>(null);
  const [checkingElementor, setCheckingElementor] = useState(false);
  const [elementorChecked, setElementorChecked] = useState(false);

  useEffect(() => {
    if (!open || !suggestionId) return;
    setTab("review");
    setFilters({ search: "", priority: "", changeType: "", destination: "" });
    setPayload(null);
    setPublishResult(null);
    setActionError("");
    setLoadError("");
    setElementorStatus(null);
    setElementorChecked(false);

    // Reuse pre-loaded state if this suggestion is already in the store
    const { suggestionId: stored, changes: current } = useChangeSuggestionsStore.getState();
    if (stored === suggestionId && current.length > 0) return;

    setLoading(true);
    changeSuggestionsApi
      .get(suggestionId)
      .then((data) => loadSuggestion(data))
      .catch(() => setLoadError("Failed to load change suggestions."))
      .finally(() => setLoading(false));
  // loadSuggestion is stable (Zustand); open/suggestionId are the real triggers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestionId]);

  useEffect(() => {
    if (tab !== "publish" || selectedDest !== "WordPress" || !suggestionId) return;
    if (elementorChecked) return;
    const wp = integrationFor("WordPress");
    if (wp?.status !== "connected") return;
    setCheckingElementor(true);
    integrationsApi.elementorCheck(suggestionId)
      .then((res) => { setElementorStatus(res); setElementorChecked(true); })
      .catch(() => { setElementorChecked(true); })
      .finally(() => setCheckingElementor(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedDest, suggestionId, elementorChecked]);

  const allChanges = useMemo(() => mergedChanges(), [changes, overrides]);

  const filtered = useMemo(
    () =>
      allChanges.filter((c) => {
        if (filters.priority && c.priority !== filters.priority) return false;
        if (filters.changeType && c.change_type !== filters.changeType) return false;
        if (filters.destination && c.destination !== filters.destination) return false;
        if (filters.search) {
          const q = filters.search.toLowerCase();
          if (!c.field_label.toLowerCase().includes(q) && !c.page_url.toLowerCase().includes(q))
            return false;
        }
        return true;
      }),
    [allChanges, filters],
  );

  const approvedCount = allChanges.filter((c) => c.approval_status === "approved").length;
  const pendingCount = allChanges.filter((c) => c.approval_status === "pending").length;

  const patch = (
    changeId: string,
    body: { approval_status?: ApprovalStatus; edited_content?: string },
  ) => {
    if (!suggestionId) return;
    changeSuggestionsApi.patchChange(suggestionId, changeId, body).catch(() => {});
  };

  const handleApprove = (changeId: string) => {
    const c = allChanges.find((ch) => ch.id === changeId);
    const next: ApprovalStatus = c?.approval_status === "approved" ? "pending" : "approved";
    setOverride(changeId, { approvalStatus: next });
    patch(changeId, { approval_status: next });
  };

  const handleReject = (changeId: string) => {
    const c = allChanges.find((ch) => ch.id === changeId);
    const next: ApprovalStatus = c?.approval_status === "rejected" ? "pending" : "rejected";
    setOverride(changeId, { approvalStatus: next });
    patch(changeId, { approval_status: next });
  };

  const handleEdit = (changeId: string, content: string) => {
    setOverride(changeId, { editedContent: content });
    patch(changeId, { edited_content: content });
  };

  const handleBulkApprove = () => {
    const ids = filtered.map((c) => c.id);
    bulkApprove(ids);
    ids.forEach((id) => patch(id, { approval_status: "approved" }));
  };

  const handleBulkReject = () => {
    const ids = filtered.map((c) => c.id);
    bulkReject(ids);
    ids.forEach((id) => patch(id, { approval_status: "rejected" }));
  };

  const handleGeneratePayload = async () => {
    if (!suggestionId) return;
    setGenerating(true);
    setActionError("");
    setPayload(null);
    try {
      const result = await changeSuggestionsApi.generatePayload(suggestionId, selectedDest);
      setPayload(result);
      setPayloadExpanded(true);
    } catch {
      setActionError("Failed to generate payload.");
    } finally {
      setGenerating(false);
    }
  };

  const _runPublish = async (dryRun: boolean) => {
    if (!suggestionId) return;
    const integration = integrationFor(selectedDest);
    if (integration?.status === "connected") {
      let res: PlatformPublishResponse;
      if (selectedDest === "WordPress") {
        res = await publishWordPress(suggestionId, dryRun);
      } else if (selectedDest === "Webflow") {
        res = await publishWebflow(suggestionId, dryRun);
      } else {
        res = await publishWix(suggestionId, dryRun);
      }
      const adapted: PublishResponse = {
        destination: selectedDest,
        dry_run: res.dry_run,
        results: res.results,
        audit_log_id: null,
      };
      if (typeof res.cache_cleared === "boolean") {
        Object.assign(adapted, { cache_cleared: res.cache_cleared });
      }
      setPublishResult(adapted);
      setPublishResults(adapted.results, dryRun);
    } else {
      const result = await changeSuggestionsApi.publish(suggestionId, selectedDest, dryRun);
      setPublishResult(result);
      setPublishResults(result.results, dryRun);
    }
  };

  const handleDryRun = async () => {
    if (!suggestionId) return;
    setPublishing(true);
    setActionError("");
    setPublishResult(null);
    try {
      await _runPublish(true);
    } catch {
      setActionError("Dry-run failed.");
    } finally {
      setPublishing(false);
    }
  };

  const handlePublishLive = async () => {
    if (!suggestionId) return;
    setConfirmOpen(false);
    setPublishing(true);
    setActionError("");
    try {
      await _runPublish(false);
    } catch {
      setActionError("Publish failed.");
    } finally {
      setPublishing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="cs-panel-overlay fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      {/* Backdrop */}
      <div
        className="cs-panel-backdrop absolute inset-0"
        onClick={onClose}
        aria-hidden
      />

      {/* Glass panel */}
      <div className="cs-panel-shell cs-panel-enter relative flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Change Suggestions
              </h2>
              {!loading && allChanges.length > 0 && (
                <p className="text-xs text-muted/70">
                  {approvedCount} approved · {pendingCount} pending · {allChanges.length} total
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="cs-panel-muted-hover flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-foreground"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 gap-1 px-6 pt-3">
          {(["review", "publish"] as PanelTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                tab === t
                  ? "bg-primary/15 text-primary"
                  : "cs-panel-muted-hover text-muted hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 sm:px-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              <span className="ml-3 text-sm text-muted">Loading suggestions…</span>
            </div>
          )}

          {loadError && (
            <div className="rounded-xl border border-destructive/25 bg-destructive-soft/30 px-4 py-3 text-sm text-destructive">
              {loadError}
            </div>
          )}

          {!loadError && preloadError && (
            <div className="rounded-xl border border-destructive/25 bg-destructive-soft/30 px-4 py-3 text-sm text-destructive">
              <p>{preloadError}</p>
              {onRetryPreload && (
                <Button size="sm" variant="outline" className="mt-3" onClick={onRetryPreload}>
                  Retry
                </Button>
              )}
            </div>
          )}

          {!loading && !loadError && !preloadError && tab === "review" && (
            <>
              {allChanges.length > 0 && (
                <div className="mb-4">
                  <FilterBar filters={filters} onChange={setFilters} />
                </div>
              )}

              {allChanges.length === 0 && preloading && (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                    Preparing your change suggestions…
                  </div>
                  {[0, 1, 2].map((i) => <ChangeCardSkeleton key={i} />)}
                </div>
              )}
              {allChanges.length === 0 && !preloading && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-muted">No changes extracted from this report.</p>
                </div>
              )}

              {allChanges.length > 0 && filtered.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-muted">No changes match the current filters.</p>
                </div>
              )}

              <div className="space-y-3">
                {filtered.map((change) => (
                  <ChangeCard
                    key={change.id}
                    change={change}
                    approvalStatus={change.approval_status}
                    editedContent={change.edited_content ?? undefined}
                    onApprove={() => handleApprove(change.id)}
                    onReject={() => handleReject(change.id)}
                    onEdit={(content) => handleEdit(change.id, content)}
                  />
                ))}
              </div>
            </>
          )}

          {!loading && !loadError && tab === "publish" && (
            <div className="space-y-5">
              {/* Destination selector */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                  Target platform
                </p>
                <div className="flex flex-wrap gap-2">
                  {DESTINATIONS.map((dest) => (
                    <button
                      key={dest}
                      onClick={() => {
                        setSelectedDest(dest);
                        setPayload(null);
                        setPublishResult(null);
                        setElementorStatus(null);
                        setElementorChecked(false);
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        selectedDest === dest
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border/40 bg-surface/40 text-muted hover:border-primary/25 hover:text-foreground",
                      )}
                    >
                      {dest}
                    </button>
                  ))}
                </div>
              </div>

              {/* CMS integration status banner */}
              {(() => {
                const cms = integrationFor(selectedDest);
                if (!cms || cms.status === "disconnected") {
                  return (
                    <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3 text-sm text-muted">
                      <span className="mt-0.5 text-primary">⚡</span>
                      <span>
                        Connect {selectedDest} in{" "}
                        <span className="font-medium text-foreground">Integrations</span> to publish
                        directly to your site.
                      </span>
                    </div>
                  );
                }
                if (cms.status === "reauth") {
                  return (
                    <div className="flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning-soft/15 px-4 py-3 text-sm text-warning">
                      <span className="mt-0.5">⚠</span>
                      <span>
                        {selectedDest} authentication expired. Reconnect your site in Integrations before
                        publishing.
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="flex items-center gap-2 rounded-xl border border-success/20 bg-success-soft/10 px-4 py-2.5 text-sm">
                    <span className="text-success">✓</span>
                    <span className="text-foreground/80">
                      Publishing to{" "}
                      <span className="font-medium text-foreground">{cms.site_url}</span> via your
                      connected integration.
                    </span>
                  </div>
                );
              })()}

              {/* Elementor status */}
              {selectedDest === "WordPress" && integrationFor("WordPress")?.status === "connected" && (
                <>
                  {checkingElementor && (
                    <p className="text-xs text-muted/60">Checking Elementor…</p>
                  )}
                  {elementorStatus?.setup_required && (
                    <div className="rounded-xl border border-warning/30 bg-warning-soft/10 px-4 py-3">
                      <p className="text-sm font-medium text-warning">Elementor REST API access required</p>
                      <p className="mt-1 text-xs text-muted">
                        Add this file to your WordPress site to enable direct publishing:
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted/80">
                        /wp-content/mu-plugins/elementor-rest-meta.php
                      </p>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-muted/80">
                        {elementorStatus.setup_instructions}
                      </pre>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => { setElementorChecked(false); setElementorStatus(null); }}
                      >
                        Re-check Connection
                      </Button>
                    </div>
                  )}
                  {elementorStatus && !elementorStatus.setup_required && elementorStatus.is_elementor_page && (
                    <p className="text-xs text-success/80">
                      ✓ Elementor detected · {elementorStatus.widget_count ?? "?"} widgets indexed
                    </p>
                  )}
                </>
              )}

              {/* Approval summary */}
              <div
                className={cn(
                  "flex items-center justify-between rounded-xl border px-4 py-3",
                  approvedCount > 0
                    ? "border-success/20 bg-success-soft/20"
                    : "border-border/30 bg-surface/30",
                )}
              >
                <p className="text-sm text-foreground">
                  <span
                    className={cn(
                      "font-semibold",
                      approvedCount > 0 ? "text-success" : "text-muted",
                    )}
                  >
                    {approvedCount}
                  </span>{" "}
                  change{approvedCount !== 1 ? "s" : ""} approved for{" "}
                  <span className="font-medium">{selectedDest}</span>
                </p>
                {approvedCount === 0 && (
                  <button
                    onClick={() => setTab("review")}
                    className="text-xs text-primary hover:underline"
                  >
                    Review →
                  </button>
                )}
              </div>

              {actionError && (
                <div className="rounded-xl border border-destructive/25 bg-destructive-soft/30 px-4 py-3 text-sm text-destructive">
                  {actionError}
                </div>
              )}

              {/* Publish actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGeneratePayload}
                  disabled={generating || approvedCount === 0}
                >
                  {generating ? "Generating…" : "Generate Payload"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDryRun}
                  disabled={publishing || approvedCount === 0}
                >
                  {publishing ? "Running…" : "Dry Run"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  disabled={publishing || approvedCount === 0}
                >
                  <Send className="h-3.5 w-3.5" />
                  Publish Live
                </Button>
              </div>

              {/* Payload preview */}
              {payload && (
                <div className="overflow-hidden rounded-xl border border-border/40 bg-surface/30">
                  <button
                    className="cs-panel-muted-hover flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground transition-colors"
                    onClick={() => setPayloadExpanded((v) => !v)}
                  >
                    <span>Payload preview ({payload.change_ids.length} changes)</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted transition-transform",
                        payloadExpanded && "rotate-180",
                      )}
                    />
                  </button>
                  {payloadExpanded && (
                    <pre className="overflow-x-auto whitespace-pre-wrap border-t border-border/30 px-4 pb-4 pt-3 text-[11px] leading-relaxed text-muted/80">
                      {payload.content}
                    </pre>
                  )}
                </div>
              )}

              {/* Publish results */}
              {publishResult && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted">
                    {publishResult.dry_run ? "Dry-run results" : "Publish results"}
                  </p>
                  {typeof (publishResult as { cache_cleared?: boolean | null }).cache_cleared === "boolean" && (
                    <p className={cn(
                      "text-xs",
                      (publishResult as { cache_cleared?: boolean | null }).cache_cleared
                        ? "text-success/80"
                        : "text-warning",
                    )}>
                      {(publishResult as { cache_cleared?: boolean | null }).cache_cleared
                        ? "✓ Elementor cache cleared"
                        : "⚠ Cache clear required — go to Elementor → Tools → Regenerate CSS"}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {publishResult.results.map((r) => {
                      const pr = r as typeof r & { widget_type?: string | null };
                      return (
                        <div
                          key={r.change_id}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                            r.success
                              ? "border-success/20 bg-success-soft/15"
                              : "border-destructive/20 bg-destructive-soft/15",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 text-xs font-bold",
                              r.success ? "text-success" : "text-destructive",
                            )}
                          >
                            {r.success ? "✓" : "✗"}
                          </span>
                          <div className="min-w-0">
                            <p className={cn(r.success ? "text-foreground" : "text-destructive")}>
                              {r.field_label}
                            </p>
                            {pr.widget_type && (
                              <p className="mt-0.5 text-xs text-muted/60">
                                Updated {pr.widget_type} widget
                              </p>
                            )}
                            {r.error && (
                              <p className="mt-0.5 text-xs text-destructive/70">{r.error}</p>
                            )}
                            {!r.success && r.error?.toLowerCase().includes("not found in elementor") && (
                              <button
                                className="mt-1 text-[11px] text-primary hover:underline"
                                onClick={() => navigator.clipboard.writeText(r.error ?? "")}
                              >
                                Copy content to paste manually
                              </button>
                            )}
                            <p className="truncate text-[11px] text-muted/60">{r.page_url}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer — review tab only */}
        {!loading && !loadError && tab === "review" && allChanges.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 sm:px-6">
            <span className="text-xs text-muted">
              <span className="font-semibold text-success">{approvedCount}</span> /{" "}
              {allChanges.length} approved
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleBulkReject}
                className="text-destructive hover:bg-destructive-soft/30 hover:text-destructive"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject all
              </Button>
              <Button size="sm" variant="outline" onClick={handleBulkApprove}>
                <CheckCheck className="h-3.5 w-3.5" />
                Approve all
              </Button>
              <Button
                size="sm"
                disabled={approvedCount === 0}
                onClick={() => setTab("publish")}
              >
                <Send className="h-3.5 w-3.5" />
                {approvedCount > 0 ? `Publish (${approvedCount})` : "Publish"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {confirmOpen && (
        <PublishConfirmModal
          destination={selectedDest}
          approvedCount={approvedCount}
          onConfirm={handlePublishLive}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
