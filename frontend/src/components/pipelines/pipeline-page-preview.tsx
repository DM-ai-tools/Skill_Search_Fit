"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { formatApiError } from "@/lib/format-api-error";
import type { PipelinePageGeneration } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_MESSAGES = [
  "Capturing your site's design template…",
  "Extracting your brand colours and fonts…",
  "Inserting your content into the template…",
  "Applying SEO meta tags and schema…",
  "Almost ready…",
];

export function PipelinePagePreviewPanel({
  pipelineRunId,
  onComplete,
}: {
  pipelineRunId: string;
  onComplete?: () => void;
}) {
  const [job, setJob] = useState<PipelinePageGeneration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msgIndex, setMsgIndex] = useState(0);
  const [iframeHeight, setIframeHeight] = useState(640);
  const [showReject, setShowReject] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [showDeployConfirm, setShowDeployConfirm] = useState(false);

  const startGeneration = useCallback(async (force = false) => {
    await api.post<PipelinePageGeneration>(`/pipelines/runs/${pipelineRunId}/generate-page`, { force });
    const data = await api.get<PipelinePageGeneration>(
      `/pipelines/runs/${pipelineRunId}/page-generation`,
    );
    setJob(data);
    return data;
  }, [pipelineRunId]);

  const poll = useCallback(async () => {
    try {
      const data = await api.get<PipelinePageGeneration>(
        `/pipelines/runs/${pipelineRunId}/page-generation`,
      );
      setJob(data);
      setError("");
      if (data.status === "failed") {
        setError(data.error_message || "Page generation failed");
        return;
      }
      if (data.status === "generated" || data.status === "fallback" || data.status === "approved" || data.status === "deployed") {
        onComplete?.();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        try {
          await startGeneration();
        } catch (inner) {
          setError(formatApiError(inner, "Page generation unavailable"));
        }
        return;
      }
      setError(formatApiError(err, "Could not load page preview"));
    } finally {
      setLoading(false);
    }
  }, [pipelineRunId, onComplete, startGeneration]);

  const retryGeneration = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      await startGeneration(true);
    } catch (err) {
      setError(formatApiError(err, "Could not restart page generation"));
    } finally {
      setLoading(false);
    }
  }, [startGeneration]);

  useEffect(() => {
    poll();
    const id = setInterval(() => {
      if (job?.status === "generating") poll();
    }, 2000);
    return () => clearInterval(id);
  }, [poll, job?.status]);

  useEffect(() => {
    if (job?.status !== "generating") return;
    const id = setInterval(() => setMsgIndex((i) => (i + 1) % STATUS_MESSAGES.length), 3200);
    return () => clearInterval(id);
  }, [job?.status]);

  const generating = job?.status === "generating";
  const failed = job?.status === "failed";
  const ready = job?.status === "generated" || job?.status === "fallback" || job?.status === "approved" || job?.status === "deployed";
  const usedFallback = job?.status === "fallback";
  const v = job?.verification;

  const titleLen = job?.page_title?.length ?? 0;
  const metaLen = job?.meta_description?.length ?? 0;

  const handleApprove = async () => {
    setActionLoading("approve");
    try {
      const data = await api.post<PipelinePageGeneration>(
        `/pipelines/runs/${pipelineRunId}/page-generation/approve`,
        {},
      );
      setJob(data);
      setShowReject(false);
    } catch (err) {
      setError(formatApiError(err, "Approve failed"));
    } finally {
      setActionLoading("");
    }
  };

  const handleRegenerate = async () => {
    setActionLoading("regenerate");
    try {
      const data = await api.post<PipelinePageGeneration>(
        `/pipelines/runs/${pipelineRunId}/page-generation/regenerate`,
        { feedback },
      );
      setJob(data);
      setShowReject(false);
      setFeedback("");
    } catch (err) {
      setError(formatApiError(err, "Regenerate failed"));
    } finally {
      setActionLoading("");
    }
  };

  const handleDeploy = async () => {
    setActionLoading("deploy");
    try {
      const data = await api.post<PipelinePageGeneration>(
        `/pipelines/runs/${pipelineRunId}/page-generation/deploy`,
        {},
      );
      setJob(data);
      setShowDeployConfirm(false);
    } catch (err) {
      setError(formatApiError(err, "Deploy failed"));
    } finally {
      setActionLoading("");
    }
  };

  const downloadHtml = () => {
    if (!job?.html) return;
    const blob = new Blob([job.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(job.slug || "page").replace(/^\//, "")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !job) {
    return (
      <div className="glass-panel mt-4 rounded-2xl border border-white/10 p-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-white/14 bg-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.10)] backdrop-blur-xl dark:bg-black/20">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Your Page Is Being Generated</p>
        <p className="text-xs text-muted">
          We are inserting your content into your site&apos;s design template. This takes about 30–60 seconds.
        </p>
        {job?.page_title && (
          <p className="mt-1 text-xs text-primary">
            {job.page_title} · {job.slug}
          </p>
        )}
      </div>

      {usedFallback && ready && job?.error_message && (
        <div className="border-b border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          {job.error_message}
        </div>
      )}

      {generating && (
        <div className="space-y-3 px-4 py-6">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface/60">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
          <p className="text-sm text-muted">{STATUS_MESSAGES[msgIndex]}</p>
        </div>
      )}

      {failed && (
        <div className="space-y-3 px-4 py-6">
          <p className="text-sm text-destructive">
            {job?.error_message || "Page generation failed. You can retry with feedback or use the assembled fallback below."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => poll()} disabled={Boolean(actionLoading)}>
              Retry
            </Button>
            <Button size="sm" onClick={handleRegenerate} disabled={Boolean(actionLoading)}>
              Regenerate
            </Button>
          </div>
          {job?.html && (
            <p className="text-xs text-muted">
              A basic assembled HTML fallback is available below for download.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <p>{error}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void retryGeneration()}>
            Retry generation
          </Button>
        </div>
      )}

      {(ready || (failed && job?.html)) && job?.html && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2 text-xs">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">Ready to Review</span>
            <span className="text-muted">{v?.word_count ?? 0} words</span>
            <span className={cn(titleLen <= 60 ? "text-green-600" : "text-destructive")}>
              Title: {titleLen} chars
            </span>
            <span className={cn(metaLen <= 160 ? "text-green-600" : "text-destructive")}>
              Meta: {metaLen} chars
            </span>
          </div>

          {v && (
            <div className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-2 text-[11px]">
              <span className={v.h1_present ? "text-green-600" : "text-destructive"}>
                {v.h1_present ? "✓" : "✗"} H1: {v.h1 || "missing"}
              </span>
              <span className="text-muted">✓ Word count: {v.word_count}</span>
              <span className={v.schema_type !== "missing" ? "text-green-600" : "text-destructive"}>
                {v.schema_type !== "missing" ? "✓" : "✗"} Schema: {v.schema_type}
              </span>
              <span className="text-muted">✓ Links: {v.internal_links}</span>
              <span className={v.meta_complete ? "text-green-600" : "text-destructive"}>
                {v.meta_complete ? "✓" : "✗"} Meta tags
              </span>
              {!v.faq_present && <span className="text-destructive">✗ FAQ section missing</span>}
              {!v.cta_present && <span className="text-amber-600">⚠ CTA block not detected</span>}
            </div>
          )}

          <Tabs defaultValue="preview" className="w-full">
            <TabsList className="h-auto w-full justify-start rounded-none border-b border-white/10 bg-transparent p-0">
              {["preview", "seo", "source"].map((tab) => (
                <TabsTrigger key={tab} value={tab} className="rounded-none capitalize">
                  {tab === "preview" ? "Page Preview" : tab === "seo" ? "SEO & Meta" : "Source HTML"}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="preview" className="p-4">
              <iframe
                title="Generated page preview"
                srcDoc={job.html}
                className="w-full rounded-xl border border-border/60 bg-white"
                style={{ height: iframeHeight }}
                sandbox="allow-same-origin"
              />
              <input
                type="range"
                min={400}
                max={1200}
                value={iframeHeight}
                onChange={(e) => setIframeHeight(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </TabsContent>
            <TabsContent value="seo" className="space-y-2 p-4 text-sm">
              <p><strong>Title:</strong> {job.page_title}</p>
              <p><strong>Meta:</strong> {job.meta_description}</p>
              <p><strong>URL:</strong> {job.full_url}</p>
            </TabsContent>
            <TabsContent value="source" className="p-4">
              <div className="mb-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(job.html!)}>
                  <Copy className="mr-1 h-3 w-3" /> Copy
                </Button>
                <Button size="sm" variant="outline" onClick={downloadHtml}>
                  <Download className="mr-1 h-3 w-3" /> Download HTML
                </Button>
              </div>
              <pre className="max-h-96 overflow-auto rounded-lg bg-surface/60 p-3 text-[11px]">{job.html}</pre>
            </TabsContent>
          </Tabs>

          {showReject && (
            <div className="border-t border-white/10 px-4 py-3">
              <p className="mb-2 text-xs font-medium">What should be different?</p>
              <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} />
              <Button
                className="mt-2"
                size="sm"
                onClick={handleRegenerate}
                disabled={!!actionLoading || (job.regeneration_count >= 3)}
              >
                {actionLoading === "regenerate" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Regenerate"}
              </Button>
              {job.regeneration_count >= 3 && (
                <p className="mt-1 text-xs text-muted">Download the HTML file and make manual edits if needed.</p>
              )}
            </div>
          )}

          {showDeployConfirm && (
            <div className="border-t border-white/10 px-4 py-3 text-sm">
              <p className="font-medium">What will be published:</p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                <li>Page title: {job.page_title}</li>
                <li>URL slug: {job.slug}</li>
                <li>Status: Draft (publish from WordPress)</li>
              </ul>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowDeployConfirm(false)}>Cancel</Button>
                <Button size="sm" onClick={handleDeploy} disabled={!!actionLoading}>
                  Confirm & Deploy →
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setShowReject(true)}>
              <X className="mr-1 h-3 w-3" /> Reject
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-green-700" onClick={handleApprove} disabled={job.approved || !!actionLoading}>
                <Check className="mr-1 h-3 w-3" /> Approve
              </Button>
              <Button
                size="sm"
                onClick={() => setShowDeployConfirm(true)}
                disabled={!job.approved || job.deployed || !!actionLoading}
                title={!job.approved ? "Approve the page first" : undefined}
              >
                Deploy to WordPress →
              </Button>
            </div>
          </div>

          {job.wordpress_draft_url && (
            <div className="border-t border-white/10 px-4 py-3">
              <a
                href={job.wordpress_draft_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View Draft in WordPress <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
