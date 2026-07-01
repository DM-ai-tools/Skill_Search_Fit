"use client";

import { Download, FileJson, FileText, Copy, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { BentoActionTile, BentoGrid, BentoTile } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { displayPluginName } from "@/lib/plugin-catalog";
import { getExecutionMarkdown } from "@/lib/report-utils";
import type { ExecuteResponse } from "@/lib/types";

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function ReportDownloadPanel({
  result,
  pluginName,
  onSave,
  saving,
  saveLabel,
}: {
  result: ExecuteResponse;
  pluginName: string;
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const markdown = getExecutionMarkdown(result.output, pluginName);
  const baseName = `${slugify(displayPluginName(pluginName))}-report`;
  const generatedAt = new Date().toLocaleString();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <BentoTile variant="strong" className="space-y-4">
      <div>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">Report ready</p>
            <p className="mt-1 text-sm text-muted">
              {displayPluginName(pluginName)} · Generated {generatedAt}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted">
        <p className="font-medium text-foreground">Execution ID</p>
        <p className="mt-1 break-all font-mono">{result.execution_id}</p>
      </div>

      <BentoGrid columns={3} className="gap-2">
        <BentoActionTile
          icon={<FileText className="h-5 w-5" />}
          label="Markdown"
          action={<Button variant="outline" className="w-full" onClick={() => downloadBlob(markdown, `${baseName}.md`, "text/markdown")}>Download</Button>}
          className="p-3"
        />
        <BentoActionTile
          icon={<FileJson className="h-5 w-5" />}
          label="JSON"
          action={<Button variant="outline" className="w-full" onClick={() => downloadBlob(JSON.stringify(result, null, 2), `${baseName}.json`, "application/json")}>Download</Button>}
          className="p-3"
        />
        <BentoActionTile
          icon={copied ? <CheckCircle2 className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
          label={copied ? "Copied" : "Copy report"}
          action={<Button variant="outline" className="w-full" onClick={handleCopy}>{copied ? "Copied" : "Copy"}</Button>}
          className="p-3"
        />
      </BentoGrid>

      {onSave && (
        <Button className="w-full" onClick={onSave} disabled={saving}>
          {saving ? "Saving to project..." : saveLabel ?? "Save report to project"}
        </Button>
      )}
    </BentoTile>
  );
}
