"use client";

import { useState } from "react";
import { useChangeSuggestionsStore } from "@/stores/change-suggestions-store";
import { changeSuggestionsApi, type ChangeDestination } from "@/lib/change-suggestions-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResultsTable } from "@/components/change-suggestions/results-table";
import { PublishConfirmModal } from "@/components/change-suggestions/publish-confirm-modal";
import { formatApiError } from "@/lib/format-api-error";
import { Download, Copy, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

const DESTINATIONS: ChangeDestination[] = ["WordPress", "Webflow", "Wix", "Mailchimp"];

type DestState = {
  payload: string | null;
  generating: boolean;
  publishing: boolean;
  copied: boolean;
  error: string;
};

export function PublishStep() {
  const { suggestionId, mergedChanges, publishResults, publishDryRun, setPublishResults, setStep } =
    useChangeSuggestionsStore();

  const changes = mergedChanges();
  const approved = changes.filter((c) => c.approval_status === "approved");

  const destinationsWithApproved = DESTINATIONS.filter((d) =>
    approved.some((c) => c.destination === d),
  );

  const [livePublish, setLivePublish] = useState(false);
  const [confirmDest, setConfirmDest] = useState<ChangeDestination | null>(null);
  const [destStates, setDestStates] = useState<Record<string, DestState>>({});
  const [globalError, setGlobalError] = useState("");

  const getState = (dest: string): DestState =>
    destStates[dest] ?? {
      payload: null,
      generating: false,
      publishing: false,
      copied: false,
      error: "",
    };

  const setDs = (dest: string, update: Partial<DestState>) =>
    setDestStates((s) => ({ ...s, [dest]: { ...getState(dest), ...update } }));

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
    const state = getState(dest);
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
    const state = getState(dest);
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
      setGlobalError(formatApiError(err));
    }
  };

  if (approved.length === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-12 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
        <p className="font-semibold">No approved changes</p>
        <p className="text-sm text-muted">
          Go back to the Review step and approve at least one change before publishing.
        </p>
        <Button variant="outline" onClick={() => setStep("review")}>
          ← Back to review
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Publish</h1>
          <p className="mt-1 text-muted">
            {approved.length} approved change{approved.length !== 1 ? "s" : ""} ready to publish.
          </p>
        </div>
        <Button variant="outline" onClick={() => setStep("review")}>
          ← Back to review
        </Button>
      </div>

      {/* live-publish toggle */}
      <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1 text-sm text-amber-800">
          <strong>Dry-run mode is on.</strong> Publishing will simulate the action without touching
          your live site. Toggle to enable real publishing.
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-amber-900">
          <span>{livePublish ? "Live publish ON" : "Dry-run"}</span>
          <button
            role="switch"
            aria-checked={livePublish}
            onClick={() => setLivePublish((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              livePublish ? "bg-destructive" : "bg-secondary"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-foreground shadow transition-transform ${
                livePublish ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </label>
      </div>

      {globalError && <p className="text-sm text-destructive">{globalError}</p>}

      {/* per-destination cards */}
      {destinationsWithApproved.map((dest) => {
        const ds = getState(dest);
        const destApproved = approved.filter((c) => c.destination === dest);
        return (
          <Card key={dest}>
            <CardHeader>
              <CardTitle className="text-base">
                {dest}
                <span className="ml-2 text-sm font-normal text-muted">
                  ({destApproved.length} change{destApproved.length !== 1 ? "s" : ""})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ds.error && <p className="text-sm text-destructive">{ds.error}</p>}

              {/* payload controls */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGeneratePayload(dest)}
                  disabled={ds.generating}
                >
                  {ds.generating ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
                  ) : (
                    "Preview payload"
                  )}
                </Button>
                {ds.payload && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => handleDownload(dest)}>
                      <Download className="mr-2 h-4 w-4" /> Download
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleCopy(dest)}>
                      {ds.copied ? (
                        <><CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> Copied</>
                      ) : (
                        <><Copy className="mr-2 h-4 w-4" /> Copy</>
                      )}
                    </Button>
                  </>
                )}
              </div>

              {/* payload preview */}
              {ds.payload && (
                <pre className="max-h-60 overflow-auto rounded-xl border border-border bg-background p-4 text-xs leading-relaxed text-foreground">
                  {ds.payload.slice(0, 3000)}
                  {ds.payload.length > 3000 && "\n…(truncated — download for full output)"}
                </pre>
              )}

              {/* publish button */}
              <Button
                onClick={() => initiatePublish(dest)}
                disabled={ds.publishing}
                variant={livePublish ? "destructive" : "default"}
                className="w-full"
              >
                {ds.publishing ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing…</>
                ) : livePublish ? (
                  `Publish LIVE to ${dest}`
                ) : (
                  `Dry-run publish to ${dest}`
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {/* results */}
      {publishResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publish results</CardTitle>
          </CardHeader>
          <CardContent>
            <ResultsTable results={publishResults} dryRun={publishDryRun} />
          </CardContent>
        </Card>
      )}

      {/* confirmation modal */}
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
