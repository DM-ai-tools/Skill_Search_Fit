"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import type { ChangeType } from "@/lib/change-suggestions-api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function readTimeMinutes(text: string): number {
  return Math.max(1, Math.ceil(wordCount(text) / 200));
}

function extractSchemaJson(content: string): { ok: boolean; type?: string; error?: string } {
  const trimmed = content.trim();
  let raw = trimmed;
  const match = trimmed.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (match) raw = match[1].trim();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const type = String(parsed["@type"] ?? "");
    return { ok: true, type: type || undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}

function isOgBlock(text: string): boolean {
  return /og:title|property="og:/i.test(text);
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function renderBasicHtml(html: string): string {
  return html
    .replace(/<h1[^>]*>/gi, '<h1 class="text-xl font-bold mt-4 mb-2">')
    .replace(/<h2[^>]*>/gi, '<h2 class="text-lg font-semibold mt-3 mb-2">')
    .replace(/<h3[^>]*>/gi, '<h3 class="text-base font-semibold mt-2 mb-1">')
    .replace(/<p[^>]*>/gi, '<p class="mb-2 leading-relaxed">');
}

// ── Metadata ──────────────────────────────────────────────────────────────────

function CharCounter({ value, limit }: { value: string; limit: number }) {
  const len = value.length;
  const over = len > limit;
  return (
    <span className={cn("font-mono text-[10px]", over ? "text-destructive" : "text-muted")}>
      {len}/{limit}
    </span>
  );
}

function SerpPreview({ title, url, description }: { title: string; url: string; description: string }) {
  const displayUrl = url || "example.com/page";
  return (
    <div className="serp-preview-card">
      <p className="serp-preview-title">{title || "Page title"}</p>
      <p className="serp-preview-url">{displayUrl}</p>
      <p className="serp-preview-desc">{description || "Meta description preview…"}</p>
    </div>
  );
}

function OgCardPreview({ content }: { content: string }) {
  const title = content.match(/og:title"[^>]*content="([^"]+)"/i)?.[1] ?? "Share title";
  const desc =
    content.match(/og:description"[^>]*content="([^"]+)"/i)?.[1] ?? "Share description";
  const image = content.match(/og:image"[^>]*content="([^"]+)"/i)?.[1];
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface-elevated">
      {image ? (
        <div
          className="h-28 bg-cover bg-center"
          style={{ backgroundImage: `url(${image})` }}
        />
      ) : (
        <div className="flex h-28 items-center justify-center bg-muted/20 text-xs text-muted">
          OG image
        </div>
      )}
      <div className="p-3">
        <p className="text-xs uppercase text-muted">Social preview</p>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted line-clamp-2">{desc}</p>
      </div>
    </div>
  );
}

function MetadataChangeView({
  current,
  proposed,
  fieldLabel,
  pageUrl,
}: {
  current: string;
  proposed: string;
  fieldLabel: string;
  pageUrl: string;
}) {
  const label = fieldLabel.toLowerCase();
  const isTitle = label.includes("title") && !label.includes("description");
  const isDesc = label.includes("description");
  const isOg = isOgBlock(proposed);

  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-1 gap-2 text-xs min-[640px]:grid-cols-2">
        <div className="cs-diff-current surface-nested rounded-xl border border-border p-3">
          <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
            Current
          </p>
          <p className="whitespace-pre-wrap break-words leading-relaxed text-muted">{current}</p>
        </div>
        <div className="cs-diff-proposed surface-nested rounded-xl border border-primary/35 p-3 ring-1 ring-primary/15">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
              Publish-ready
            </p>
            {isTitle && <CharCounter value={proposed} limit={60} />}
            {isDesc && <CharCounter value={proposed} limit={160} />}
          </div>
          <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground">{proposed}</p>
        </div>
      </div>
      {isOg ? (
        <OgCardPreview content={proposed} />
      ) : (
        <SerpPreview
          title={isTitle ? proposed : isDesc ? stripHtml(current).slice(0, 60) : proposed.slice(0, 60)}
          url={pageUrl}
          description={isDesc ? proposed : ""}
        />
      )}
    </div>
  );
}

// ── Schema ────────────────────────────────────────────────────────────────────

function SchemaChangeView({ proposed }: { proposed: string }) {
  const validation = useMemo(() => extractSchemaJson(proposed), [proposed]);
  const formatted = useMemo(() => {
    const match = proposed.match(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    const raw = match ? match[1].trim() : proposed.trim();
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }, [proposed]);

  const richTestUrl = useMemo(() => {
    const encoded = encodeURIComponent(proposed);
    return `https://search.google.com/test/rich-results?code=${encoded}`;
  }, [proposed]);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {validation.type && (
          <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
            {validation.type}
          </span>
        )}
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold",
            validation.ok
              ? "border-success/30 bg-success-soft/30 text-success"
              : "border-destructive/30 bg-destructive-soft/30 text-destructive",
          )}
        >
          {validation.ok ? "Valid JSON-LD ✓" : `Invalid JSON ✗`}
        </span>
        <a
          href={richTestUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          Preview Rich Result <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {validation.error && (
        <p className="text-xs text-destructive">{validation.error}</p>
      )}
      <pre className="code-block-themed">
        {formatted}
      </pre>
    </div>
  );
}

// ── Technical ─────────────────────────────────────────────────────────────────

function TechnicalChangeView({ current, proposed, fieldLabel }: { current: string; proposed: string; fieldLabel: string }) {
  const locationHint = useMemo(() => {
    const label = fieldLabel.toLowerCase();
    if (label.includes("robots")) return "robots.txt";
    if (label.includes("canonical") || proposed.includes('rel="canonical"')) return "<head>";
    if (label.includes("redirect") || proposed.includes("RewriteRule")) return "server config";
    if (proposed.includes("<img")) return "page HTML";
    return "implementation";
  }, [fieldLabel, proposed]);

  return (
    <div className="mt-3 space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
        Location: {locationHint}
      </p>
      <div className="grid grid-cols-1 gap-2 text-xs">
        <div className="rounded-xl border border-destructive/20 bg-destructive-soft/10 p-3">
          <p className="mb-1 font-mono text-[10px] font-semibold uppercase text-destructive">Current</p>
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-destructive/80 line-through">
            {current}
          </pre>
        </div>
        <div className="rounded-xl border border-success/25 bg-success-soft/10 p-3">
          <p className="mb-1 font-mono text-[10px] font-semibold uppercase text-success">Proposed</p>
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-foreground">{proposed}</pre>
        </div>
      </div>
    </div>
  );
}

// ── Content (incl. long-form) ─────────────────────────────────────────────────

function FullArticleModal({
  open,
  onClose,
  title,
  content,
  onApprove,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
  onApprove?: () => void;
}) {
  if (!open) return null;
  const wc = wordCount(content);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="modal-overlay" onClick={onClose} />
      <div className="cs-panel-shell relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted">
              {wc.toLocaleString()} words · ~{readTimeMinutes(content)} min read
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-surface-elevated" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className="flex-1 overflow-y-auto px-5 py-4 text-sm text-foreground"
          dangerouslySetInnerHTML={{ __html: renderBasicHtml(content) }}
        />
        {onApprove && (
          <div className="sticky bottom-0 border-t border-border bg-surface px-5 py-3">
            <Button onClick={onApprove} className="w-full sm:w-auto">
              Approve
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ContentChangeView({
  current,
  proposed,
  fieldLabel,
  onApprove,
}: {
  current: string;
  proposed: string;
  fieldLabel: string;
  onApprove?: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const len = proposed.length;
  const isLong = len >= 1000;
  const isMedium = len >= 200 && len < 1000;

  if (isLong) {
    const preview = proposed.slice(0, 300);
    return (
      <>
        <div className="mt-3 rounded-xl border border-border bg-surface-elevated p-3 text-xs">
          <p className="mb-1 font-mono text-[10px] uppercase text-muted">Current</p>
          <p className="text-muted line-clamp-2">{current}</p>
          <p className="mt-3 mb-1 font-mono text-[10px] uppercase text-primary">Publish-ready preview</p>
          <p className="text-foreground whitespace-pre-wrap">{preview}…</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted">
              {wordCount(proposed).toLocaleString()} words · ~{readTimeMinutes(proposed)} min
            </span>
            <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
              View Full Article
            </Button>
          </div>
        </div>
        <FullArticleModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={fieldLabel}
          content={proposed}
          onApprove={onApprove}
        />
      </>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-2 text-xs min-[640px]:grid-cols-2">
      <div className="cs-diff-current surface-nested rounded-xl border border-border p-3">
        <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
          Current {isMedium && <span className="normal-case">({wordCount(current)} words)</span>}
        </p>
        <p className="whitespace-pre-wrap break-words leading-relaxed text-muted max-h-48 overflow-y-auto">
          {current}
        </p>
      </div>
      <div className="cs-diff-proposed surface-nested rounded-xl border border-primary/35 p-3 ring-1 ring-primary/15">
        <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
          Publish-ready {isMedium && <span className="normal-case">({wordCount(proposed)} words)</span>}
        </p>
        <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground max-h-48 overflow-y-auto">
          {proposed}
        </p>
      </div>
    </div>
  );
}

// ── Capture form ──────────────────────────────────────────────────────────────

function CaptureFormChangeView({ current, proposed }: { current: string; proposed: string }) {
  const headline = proposed.match(/<h[12][^>]*>([^<]+)/i)?.[1] ?? proposed.split("\n")[0];
  const button = proposed.match(/<button[^>]*>([^<]+)/i)?.[1] ?? "Subscribe";
  return (
    <div className="mt-3 space-y-2">
      {current && (
        <p className="text-xs text-muted">
          <span className="font-mono text-[10px] uppercase">Current: </span>
          {current}
        </p>
      )}
      <div className="rounded-xl border border-border bg-surface-elevated p-5 text-center">
        <p className="text-base font-semibold text-foreground">{headline}</p>
        <div className="mx-auto mt-3 flex max-w-sm gap-2">
          <div className="h-9 flex-1 rounded-lg border border-border bg-surface" />
          <div className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{button}</div>
        </div>
      </div>
    </div>
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ChangeTypeViewProps {
  changeType: ChangeType;
  current: string;
  proposed: string;
  fieldLabel: string;
  pageUrl: string;
  onApprove?: () => void;
}

export function ChangeTypeView({
  changeType,
  current,
  proposed,
  fieldLabel,
  pageUrl,
  onApprove,
}: ChangeTypeViewProps) {
  switch (changeType) {
    case "metadata":
      return (
        <MetadataChangeView
          current={current}
          proposed={proposed}
          fieldLabel={fieldLabel}
          pageUrl={pageUrl}
        />
      );
    case "schema":
      return <SchemaChangeView proposed={proposed} />;
    case "technical":
      return <TechnicalChangeView current={current} proposed={proposed} fieldLabel={fieldLabel} />;
    case "capture-form":
      return <CaptureFormChangeView current={current} proposed={proposed} />;
    case "content":
    default:
      return (
        <ContentChangeView
          current={current}
          proposed={proposed}
          fieldLabel={fieldLabel}
          onApprove={onApprove}
        />
      );
  }
}
