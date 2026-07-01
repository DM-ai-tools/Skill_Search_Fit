"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadStep } from "./_steps/upload-step";
import { BentoSectionHeader } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeSuggestionsApi, type ChangeSuggestionResponse } from "@/lib/change-suggestions-api";
import { formatApiError } from "@/lib/format-api-error";
import { Clock3, RotateCcw, Search } from "lucide-react";
import { useChangeSuggestionsStore } from "@/stores/change-suggestions-store";

export default function ChangeSuggestionsPage() {
  const { reset } = useChangeSuggestionsStore();
  const router = useRouter();
  const [history, setHistory] = useState<ChangeSuggestionResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const loadHistory = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await changeSuggestionsApi.list();
      setHistory(rows);
    } catch (err) {
      setError(formatApiError(err, "Could not load suggestion history"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory().catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => item.filename.toLowerCase().includes(q) || item.id.toLowerCase().includes(q));
  }, [history, query]);

  return (
    <div className="space-y-8">
      <BentoSectionHeader
        eyebrow="Change Suggestions"
        title="New Report"
        description="Upload an audit report and Claude will generate an implementation plan."
        actions={<Button
          variant="ghost"
          size="sm"
          onClick={reset}
          title="Clear stored report"
          className="flex items-center gap-1.5 text-muted hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Clear
        </Button>}
      />
      <section className="space-y-3 rounded-xl border border-border/40 bg-surface/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">History</h2>
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by filename or id"
              className="pl-8"
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted">Loading history...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted">No previous reports yet.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/reports/plan?suggestionId=${item.id}`)}
                className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-left hover:bg-background"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.filename}</p>
                  <p className="truncate text-xs text-muted">{item.id}</p>
                </div>
                <div className="ml-3 flex items-center gap-2 text-xs text-muted">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>{new Date(item.updated_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
      <UploadStep />
    </div>
  );
}
