"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckSquare, Copy, Download, ExternalLink, RefreshCw, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiSetupBanner } from "@/components/system/ai-setup-banner";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/format-api-error";
import { parseMarkdownSections } from "@/lib/plugin-report-presenters";
import { parseBlocksFromBody } from "@/lib/report-view-model";
import { renderReportBlocks } from "@/components/reports/structured-report-view";
import { cn } from "@/lib/utils";
import type {
  ImageBriefItem,
  InternalLinkInstruction,
  PublishReadyPage,
} from "@/lib/types";

// ── Utility ────────────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-primary border border-primary/30 hover:bg-primary/10 transition-colors"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function CharCount({ text, min, max }: { text: string; min: number; max: number }) {
  const len = text.length;
  const color =
    len === 0
      ? "text-muted-foreground"
      : len >= min && len <= max
      ? "text-green-600"
      : "text-destructive";
  return (
    <span className={`text-[11px] font-mono ${color}`}>
      {len} chars
    </span>
  );
}

// ── SERP Preview ───────────────────────────────────────────────────────────────

function SerpPreview({
  title,
  url,
  description,
}: {
  title: string;
  url: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-white p-4 font-sans shadow-sm">
      <p className="text-[11px] text-muted-foreground mb-1">Google Search Preview</p>
      <div className="max-w-xl space-y-0.5">
        <p className="text-[18px] font-medium text-[#1a0dab] leading-snug truncate">
          {title || "Page Title"}
        </p>
        <p className="text-[13px] text-[#006621] truncate">{url || "https://example.com/slug"}</p>
        <p className="text-[13px] text-[#545454] leading-relaxed line-clamp-2">
          {description || "Meta description will appear here..."}
        </p>
      </div>
    </div>
  );
}

// ── Tab: Full Preview ──────────────────────────────────────────────────────────

type PolishedArticleSection = {
  id: string;
  heading: string;
  level: number;
  content: string;
};

type PolishedArticlePreview = {
  display_title: string;
  display_subtitle: string;
  sections: PolishedArticleSection[];
  preview_model?: string;
};

function ArticlePreviewFallback({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return (
      <p className="text-sm italic text-gray-600">No article content extracted yet.</p>
    );
  }

  const sections = parseMarkdownSections(markdown);

  return (
    <div className="article-preview space-y-6 text-gray-900 [&_p]:text-gray-800 [&_li]:text-gray-800">
      {sections.map((sec, i) => {
        const blocks = parseBlocksFromBody(sec.body);
        const headingClass =
          sec.level <= 1
            ? "text-xl font-bold text-gray-900"
            : sec.level === 2
              ? "text-lg font-semibold text-gray-900"
              : "text-base font-semibold text-gray-800";

        return (
          <section key={`${sec.title}-${i}`}>
            {sec.title !== "Overview" && (
              <h2 className={`${headingClass} mb-3 mt-1`}>{sec.title}</h2>
            )}
            <div className="space-y-3">{renderReportBlocks(blocks)}</div>
          </section>
        );
      })}
    </div>
  );
}

function PolishedArticlePreviewView({ preview }: { preview: PolishedArticlePreview }) {
  return (
    <div className="article-preview space-y-6 text-gray-900 [&_p]:text-gray-800 [&_li]:text-gray-800">
      {preview.sections.map((sec) => {
        const blocks = parseBlocksFromBody(sec.content);
        const headingClass =
          sec.level <= 2
            ? "text-lg font-semibold text-gray-900"
            : "text-base font-semibold text-gray-800";

        return (
          <section key={sec.id}>
            {sec.heading && (
              <h2 className={`${headingClass} mb-3 mt-1`}>{sec.heading}</h2>
            )}
            <div className="space-y-3">
              {blocks.length > 0 ? (
                renderReportBlocks(blocks)
              ) : (
                <p className="text-[15px] leading-relaxed text-gray-800">{sec.content}</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FullPreviewTab({ page }: { page: PublishReadyPage }) {
  const { body, head } = page.blocks;
  const [preview, setPreview] = useState<PolishedArticlePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const previewKey = useMemo(
    () =>
      JSON.stringify({
        h1: body.h1,
        markdown: body.full_body_markdown,
        title: head.title_tag,
      }),
    [body.h1, body.full_body_markdown, head.title_tag],
  );

  const fetchPreview = async () => {
    if (!body.full_body_markdown.trim()) {
      setPreview(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api.post<PolishedArticlePreview>("/reports/preview-article", {
        h1: body.h1,
        title_tag: head.title_tag,
        meta_description: head.meta_description,
        full_body_markdown: body.full_body_markdown,
        full_url: page.full_url,
        word_count: body.word_count,
      });
      setPreview(data);
    } catch (err) {
      setError(formatApiError(err, "Could not generate article preview."));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  const displayTitle = preview?.display_title || body.h1;
  const displaySubtitle = preview?.display_subtitle || head.meta_description;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          AI-polished preview of the complete article body
        </p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {body.word_count.toLocaleString()} words
          </span>
          <button
            type="button"
            onClick={() => void fetchPreview()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-surface/80 px-2.5 py-1 text-xs font-medium text-muted hover:text-primary"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh preview
          </button>
        </div>
      </div>

      {loading && !preview && body.full_body_markdown.trim() && (
        <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 animate-pulse text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Formatting your article preview…</p>
              <p className="text-xs text-muted">
                OpenAI is cleaning layout only — your article content stays the same.
              </p>
            </div>
          </div>
          <div className="h-48 animate-pulse rounded-xl bg-white/60" />
        </div>
      )}

      {!loading && error && (
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error} Showing basic preview instead.
        </p>
      )}

      {(!loading || preview) && (
        <div className="rounded-2xl border border-border/60 bg-white p-6 shadow-sm">
          {displayTitle && (
            <h1 className="mb-2 text-2xl font-bold text-gray-900">{displayTitle}</h1>
          )}
          {displaySubtitle && (
            <p className="mb-5 text-sm leading-relaxed text-gray-600">{displaySubtitle}</p>
          )}
          {preview ? (
            <PolishedArticlePreviewView preview={preview} />
          ) : (
            <ArticlePreviewFallback markdown={body.full_body_markdown} />
          )}
          {preview?.preview_model && (
            <p className="mt-6 text-center text-[10px] text-gray-500">
              Preview formatted with {preview.preview_model} · content unchanged
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab: SEO & Meta ────────────────────────────────────────────────────────────

function SeoMetaTab({ page }: { page: PublishReadyPage }) {
  const { head, url_slug } = page.blocks;
  return (
    <div className="space-y-5">
      <SerpPreview
        title={head.title_tag}
        url={page.full_url}
        description={head.meta_description}
      />

      {[
        {
          label: "Title Tag",
          value: head.title_tag,
          min: 50,
          max: 60,
        },
        {
          label: "Meta Description",
          value: head.meta_description,
          min: 150,
          max: 160,
        },
      ].map(({ label, value, min, max }) => (
        <div key={label} className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
            <CharCount text={value} min={min} max={max} />
            <CopyButton text={value} />
          </div>
          <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground">
            {value || <span className="text-muted-foreground italic">Not extracted</span>}
          </p>
        </div>
      ))}

      {[
        { label: "Canonical URL", value: head.canonical_url },
        { label: "URL Slug", value: url_slug.slug },
        { label: "Breadcrumb", value: url_slug.breadcrumb },
      ].map(({ label, value }) => (
        <div key={label} className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
            <CopyButton text={value} />
          </div>
          <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm font-mono text-foreground">
            {value || <span className="text-muted-foreground italic">Not set</span>}
          </p>
        </div>
      ))}

      {/* Open Graph */}
      <details className="group">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary">
          Open Graph Tags ▸
        </summary>
        <div className="mt-2 space-y-1 rounded-lg border border-border/60 bg-muted/30 p-3">
          {Object.entries(head.open_graph).map(([key, val]) => (
            <div key={key} className="flex gap-2 text-xs">
              <span className="font-mono text-muted-foreground w-32 shrink-0">og:{key}</span>
              <span className="text-foreground truncate">{val}</span>
            </div>
          ))}
        </div>
      </details>

      {/* Twitter Card */}
      <details className="group">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary">
          Twitter Card Tags ▸
        </summary>
        <div className="mt-2 space-y-1 rounded-lg border border-border/60 bg-muted/30 p-3">
          {Object.entries(head.twitter_card).map(([key, val]) => (
            <div key={key} className="flex gap-2 text-xs">
              <span className="font-mono text-muted-foreground w-32 shrink-0">twitter:{key}</span>
              <span className="text-foreground truncate">{val}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ── Tab: Body Content ──────────────────────────────────────────────────────────

function BodyContentTab({ page }: { page: PublishReadyPage }) {
  const { body } = page.blocks;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <CopyButton text={body.full_body_markdown} label="Copy Article Body" />
        <span className="font-mono text-[11px] text-muted-foreground">
          {body.word_count.toLocaleString()} words
        </span>
      </div>
      <pre className="whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-foreground font-sans leading-relaxed max-h-[600px] overflow-y-auto">
        {body.full_body_markdown || "No body content extracted."}
      </pre>
    </div>
  );
}

// ── Tab: Schema ────────────────────────────────────────────────────────────────

function SchemaTab({ page }: { page: PublishReadyPage }) {
  const { head } = page.blocks;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            head.schema_valid
              ? "bg-green-500/15 text-green-700 border border-green-500/25"
              : "bg-destructive/15 text-destructive border border-destructive/25"
          }`}
        >
          {head.schema_valid ? (
            <Check className="h-3 w-3" />
          ) : (
            <span>✗</span>
          )}
          {head.schema_valid ? "Valid JSON-LD" : "Invalid or missing JSON-LD"}
        </span>
        {head.schema_jsonld && <CopyButton text={head.schema_jsonld} label="Copy Schema" />}
      </div>

      {head.schema_jsonld ? (
        <pre className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm font-mono text-foreground overflow-x-auto max-h-[500px] overflow-y-auto">
          {head.schema_jsonld}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No schema JSON-LD was extracted from the pipeline output.
          The On-Page SEO or Create Content step should produce a JSON-LD block.
        </p>
      )}
    </div>
  );
}

// ── Tab: Linking Instructions ──────────────────────────────────────────────────

function LinkingTab({ page }: { page: PublishReadyPage }) {
  const { internal_linking_instructions } = page.blocks;
  const { inbound_links, outbound_links_inserted, pillar_link_confirmed } =
    internal_linking_instructions;

  return (
    <div className="space-y-6">
      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
            outbound_links_inserted
              ? "bg-green-500/15 text-green-700 border-green-500/25"
              : "bg-muted/30 text-muted-foreground border-border/40"
          }`}
        >
          <Check className="h-3 w-3" />
          Outbound links inserted
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
            pillar_link_confirmed
              ? "bg-green-500/15 text-green-700 border-green-500/25"
              : "bg-muted/30 text-muted-foreground border-border/40"
          }`}
        >
          <Check className="h-3 w-3" />
          Pillar page link confirmed
        </span>
      </div>

      {/* Inbound links table */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Inbound Link Actions (add to existing pages)
        </p>
        {inbound_links.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  {["Source Page", "Find This Text", "Use This Anchor Text", "Placement"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {inbound_links.map((link: InternalLinkInstruction, i: number) => (
                  <tr key={i} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-primary">{link.source_page}</td>
                    <td className="px-3 py-2 text-xs text-foreground max-w-[200px] truncate">
                      {link.find_text}
                    </td>
                    <td className="px-3 py-2 text-xs font-medium text-foreground">
                      {link.anchor_text}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{link.placement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No inbound link instructions extracted. The Internal Linking step should produce a
            table of recommended inbound links.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Tab: Image Brief ───────────────────────────────────────────────────────────

function ImageBriefTab({ page }: { page: PublishReadyPage }) {
  const { image_brief } = page.blocks;
  if (image_brief.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No image alt texts extracted. The Create Content or On-Page SEO step should include image
        alt text recommendations.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {image_brief.map((item: ImageBriefItem, i: number) => {
        const parts = item.dimensions.split("x").map(Number);
        const w = parts[0] ?? 16;
        const h = parts[1] ?? 9;
        const ratio = h > 0 && w > 0 ? h / w : 9 / 16;
        return (
          <div
            key={i}
            className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {item.position}
              </p>
              <span className="text-[11px] text-muted-foreground">{item.dimensions}px</span>
            </div>
            {/* Aspect ratio placeholder */}
            <div
              className="w-full rounded-lg bg-muted/40 border border-border/40 flex items-center justify-center text-muted-foreground text-sm"
              style={{ aspectRatio: `${w}/${h}`, maxHeight: 180 }}
            >
              {item.alt_text}
            </div>
            <div className="space-y-1 text-xs">
              <p>
                <span className="text-muted-foreground font-mono">Alt text: </span>
                <span className="text-foreground">{item.alt_text}</span>
                <CopyButton text={item.alt_text} />
              </p>
              <p>
                <span className="text-muted-foreground font-mono">File name: </span>
                <span className="font-mono text-foreground">{item.file_name}</span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab: Publish Checklist ─────────────────────────────────────────────────────

function PublishChecklistTab({ checklist }: { checklist: string }) {
  const lines = checklist.split("\n");
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const checkableLines = lines.filter((l) => l.trimStart().startsWith("- [ ]"));
  const total = checkableLines.length;
  const done = Object.values(checked).filter(Boolean).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  let checkboxIndex = 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-mono text-muted-foreground uppercase tracking-widest">Progress</span>
          <span
            className={`font-semibold ${pct === 100 ? "text-green-600" : "text-foreground"}`}
          >
            {done}/{total} — {pct}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted/40 border border-border/40 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {pct === 100 && (
          <p className="text-green-600 text-xs font-medium">All done — Ready to Publish ✓</p>
        )}
      </div>

      {/* Checklist items */}
      <div className="space-y-0.5">
        {lines.map((line, i) => {
          if (line.trimStart().startsWith("- [ ]")) {
            const idx = checkboxIndex++;
            const isChecked = checked[idx] ?? false;
            const text = line.replace(/^[\s-]*\[\s*\]\s*/, "");
            return (
              <button
                key={i}
                type="button"
                onClick={() => setChecked((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                className="flex items-start gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors group"
              >
                {isChecked ? (
                  <CheckSquare className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                ) : (
                  <Square className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                )}
                <span
                  className={`text-sm ${
                    isChecked ? "line-through text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {text}
                </span>
              </button>
            );
          }
          if (line.startsWith("##")) {
            return (
              <p
                key={i}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground pt-4 pb-1"
              >
                {line.replace(/^#+\s*/, "")}
              </p>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PublishReadyPageView({ page }: { page: PublishReadyPage }) {
  const { validation } = page;

  const handleDownloadHtml = () => {
    const blob = new Blob([page.downloads.html_file], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page.slug.replace("/", "") || "page"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([page.blocks.body.full_body_markdown], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page.slug.replace("/", "") || "page"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-border/70 overflow-hidden">
      {/* Header */}
      <CardHeader className="border-b border-border/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary/80">
              Full Content Page Pipeline
            </p>
            <CardTitle className="mt-1 text-xl tracking-tight">
              Your Publish-Ready Page
            </CardTitle>
            {page.full_url && (
              <a
                href={page.full_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                {page.full_url}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Status badge + download buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${
                validation.is_complete
                  ? "bg-green-500/15 text-green-700 border-green-500/25"
                  : "bg-amber-500/15 text-amber-600 border-amber-400/25"
              }`}
            >
              {validation.is_complete ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Complete ✓
                </>
              ) : (
                <>⚠ Needs Review</>
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleDownloadMarkdown}
            >
              <Download className="h-3.5 w-3.5" />
              .md
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleDownloadHtml}
            >
              <Download className="h-3.5 w-3.5" />
              HTML
            </Button>
            <CopyButton text={page.blocks.body.full_body_markdown} label="Copy Body" />
          </div>
        </div>

        {/* Validation errors/warnings */}
        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className="mt-4 space-y-2">
            {validation.errors.map((e, i) => (
              <p
                key={i}
                className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                ✗ {e}
              </p>
            ))}
            {validation.warnings.map((w, i) => (
              <p
                key={i}
                className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-700"
              >
                ⚠ {w}
              </p>
            ))}
          </div>
        )}
      </CardHeader>

      {/* Tabs */}
      <CardContent className="p-0">
        <div className="px-4 pt-4">
          <AiSetupBanner mode="presentation" />
        </div>
        <Tabs defaultValue="preview" className="w-full">
          <TabsList className="w-full rounded-none border-b border-border/60 bg-muted/30 h-auto p-0 justify-start overflow-x-auto">
            {[
              { value: "preview", label: "Full Preview" },
              { value: "seo", label: "SEO & Meta" },
              { value: "body", label: "Body Content" },
              { value: "schema", label: "Schema" },
              { value: "linking", label: "Linking" },
              { value: "images", label: "Images" },
              { value: "checklist", label: "Checklist" },
            ].map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="p-5">
            <TabsContent value="preview" className="mt-0">
              <FullPreviewTab page={page} />
            </TabsContent>
            <TabsContent value="seo" className="mt-0">
              <SeoMetaTab page={page} />
            </TabsContent>
            <TabsContent value="body" className="mt-0">
              <BodyContentTab page={page} />
            </TabsContent>
            <TabsContent value="schema" className="mt-0">
              <SchemaTab page={page} />
            </TabsContent>
            <TabsContent value="linking" className="mt-0">
              <LinkingTab page={page} />
            </TabsContent>
            <TabsContent value="images" className="mt-0">
              <ImageBriefTab page={page} />
            </TabsContent>
            <TabsContent value="checklist" className="mt-0">
              <PublishChecklistTab checklist={page.blocks.publish_checklist} />
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
