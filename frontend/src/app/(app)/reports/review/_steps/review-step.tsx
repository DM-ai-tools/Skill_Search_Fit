"use client";

import { useMemo, useState } from "react";
import { useChangeSuggestionsStore } from "@/stores/change-suggestions-store";
import { changeSuggestionsApi } from "@/lib/change-suggestions-api";
import type { ApprovalStatus, ChangeDestination } from "@/lib/change-suggestions-api";
import { ChangeCard } from "@/components/change-suggestions/change-card";
import { FilterBar, type Filters } from "@/components/change-suggestions/filter-bar";
import { Button } from "@/components/ui/button";
import { formatApiError } from "@/lib/format-api-error";

const DESTINATIONS: ChangeDestination[] = ["WordPress", "Webflow", "Wix"];

export function ReviewStep() {
  const { suggestionId, mergedChanges, setOverride, bulkApprove, bulkReject, setStep } =
    useChangeSuggestionsStore();

  const changes = mergedChanges();

  const [filters, setFilters] = useState<Filters>({
    search: "",
    priority: "",
    changeType: "",
    destination: "",
  });

  const [error, setError] = useState("");

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

  const counts = useMemo(
    () => ({
      approved: changes.filter((c) => c.approval_status === "approved").length,
      rejected: changes.filter((c) => c.approval_status === "rejected").length,
      pending: changes.filter((c) => c.approval_status === "pending").length,
    }),
    [changes],
  );

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

  // Group by destination → page_url
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

  const canProceed = counts.approved > 0;

  return (
    <div className="space-y-6">
      {/* sticky summary bar */}
      <div className="sticky-bar-shadow sticky top-0 z-20 rounded-xl border border-border/40 bg-surface/80 p-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-semibold text-foreground">{changes.length} changes</span>
            <span className="text-success">{counts.approved} approved</span>
            <span className="text-destructive">{counts.rejected} rejected</span>
            <span className="text-muted">{counts.pending} pending</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleBulkApprove}>
              Approve all visible
            </Button>
            <Button size="sm" variant="ghost" onClick={handleBulkReject}>
              Reject all visible
            </Button>
            <Button size="sm" onClick={() => setStep("publish")} disabled={!canProceed}>
              Proceed to Publish →
            </Button>
          </div>
        </div>
      </div>

      {/* filters */}
      <FilterBar filters={filters} onChange={setFilters} />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {filtered.length === 0 && (
        <p className="py-12 text-center text-muted">No changes match the current filters.</p>
      )}

      {/* grouped cards */}
      {Object.entries(grouped).map(([dest, byPage]) => (
        <section key={dest} className="space-y-4">
          <h2 className="text-base font-semibold text-foreground">{dest}</h2>
          {Object.entries(byPage).map(([pageUrl, pageChanges]) => (
            <div key={pageUrl} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{pageUrl}</p>
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
  );
}
