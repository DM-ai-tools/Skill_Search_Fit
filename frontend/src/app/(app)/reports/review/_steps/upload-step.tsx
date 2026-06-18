"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { BentoActionTile, BentoGrid, BentoTile } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { FileCheck2, FileText, Loader2, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useReportReviewStore } from "@/stores/report-review-store";
import { reportReviewApi } from "@/lib/report-review-api";
import { formatApiError } from "@/lib/format-api-error";

export function UploadStep() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("pasted-report");
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { loadReport } = useReportReviewStore();

  const handleFile = (file: File) => {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setText((e.target?.result as string) ?? "");
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async () => {
    const content = text.trim();
    if (!content) {
      setError("Paste or upload a report first.");
      return;
    }
    setError("");
    setUploading(true);

    try {
      const report = await reportReviewApi.upload(content, filename);
      setUploading(false);
      setExtracting(true);
      const withChanges = await reportReviewApi.extract(report.id);
      loadReport(withChanges);
      router.push(`/reports/plan?reportId=${report.id}`);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  };

  const busy = uploading || extracting;

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="mx-auto max-w-3xl space-y-1 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Upload Report</h1>
        <p className="text-sm text-muted">
          Paste your audit report or upload a{" "}
          <code className="rounded-md border border-border/30 bg-surface/50 px-1 font-mono text-xs">.md</code> /{" "}
          <code className="rounded-md border border-border/30 bg-surface/50 px-1 font-mono text-xs">.html</code> file. Claude
          extracts every discrete change into a reviewable list.
        </p>
      </div>

      <BentoGrid columns={3}>
        {/* Drag-drop zone */}
        <BentoTile
          span="hero"
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 text-center transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            dragOver ? "border-primary/50 bg-primary/8" : "hover:border-primary/30 hover:bg-surface/50",
          )}
        >
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-2xl border border-border transition-colors",
              dragOver ? "border-primary/40 bg-primary/12" : "bg-surface/50",
            )}
          >
            <Upload className={cn("h-6 w-6 transition-colors", dragOver ? "text-primary" : "text-muted")} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Drag & drop a file, or{" "}
              <span className="text-primary underline underline-offset-2">click to browse</span>
            </p>
            <p className="mt-0.5 text-xs text-muted">.md · .html · .txt</p>
          </div>
          {filename !== "pasted-report" && (
            <p className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 font-mono text-xs font-medium text-primary">
              {filename}
            </p>
          )}
        </BentoTile>

        <BentoActionTile
          icon={<FileCheck2 className="h-5 w-5" />}
          label="Structured extraction"
          description="Claude turns audit prose into discrete, reviewable implementation changes."
        />
        <BentoActionTile
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Review before publish"
          description="Every change lands in the plan screen first; nothing is published from upload."
        />
      </BentoGrid>
      <input
        ref={fileRef}
        type="file"
        accept=".md,.html,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {/* Paste area */}
      <BentoTile span="wide">
        <label className="mb-2 flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-widest text-muted">
          <FileText className="h-3.5 w-3.5" />
          Paste report text
        </label>
        <textarea
          rows={14}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the full text of your SEO/content audit report here…"
          className="w-full rounded-xl border border-border-strong/40 bg-background/50 p-4 text-sm leading-relaxed text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </BentoTile>

      {error && (
        <p className="rounded-xl border border-destructive/25 bg-destructive-soft/20 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mx-auto max-w-2xl">
        <Button
          onClick={handleSubmit}
          disabled={busy}
          size="lg"
          className="w-full focus-visible:ring-2 focus-visible:ring-primary"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {uploading ? "Uploading…" : "Extracting changes with Claude…"}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Upload & extract changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
