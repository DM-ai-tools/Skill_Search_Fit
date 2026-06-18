"use client";

import { useEffect, useState } from "react";
import { Globe, Loader2, RefreshCw } from "lucide-react";
import { useAnalysisActions } from "@/components/analysis/background-analysis-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSiteStore } from "@/stores/site-store";
import { cn } from "@/lib/utils";

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(normalizeUrl(value));
    return Boolean(url.hostname.includes("."));
  } catch {
    return false;
  }
}

export function SiteUrlControl({
  compact = false,
  showRerun = false,
  disabled = false,
  className,
}: {
  compact?: boolean;
  showRerun?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const { siteUrl, hydrated, setSiteUrl } = useSiteStore();
  const { startScan } = useAnalysisActions();
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hydrated && siteUrl) setUrlInput(siteUrl);
  }, [hydrated, siteUrl]);

  const save = async (force = false) => {
    if (!isValidUrl(urlInput)) {
      setUrlError("Enter a valid website URL.");
      return;
    }
    const normalized = normalizeUrl(urlInput);
    setUrlInput(normalized);
    setUrlError("");
    setSiteUrl(normalized);
    setSaving(true);
    try {
      await startScan(normalized, force || normalized === siteUrl);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("min-w-0 flex-1", className)}>
      {!compact && (
        <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted/60">
          Company URL
        </p>
      )}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/50" />
          <Input
            type="url"
            placeholder="https://yoursite.com"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setUrlError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && save(false)}
            className={cn("pl-9", compact && "h-8 text-xs")}
          />
        </div>
        <Button
          size={compact ? "sm" : "default"}
          variant={compact ? "outline" : "default"}
          onClick={() => save(false)}
          disabled={disabled || saving}
          className="shrink-0"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : compact ? "Set site" : "Save URL"}
        </Button>
        {showRerun && (
          <Button size={compact ? "sm" : "default"} variant="outline" onClick={() => save(true)} disabled={disabled || saving}>
            <RefreshCw className={cn("h-3.5 w-3.5", saving && "animate-spin")} />
            Re-run
          </Button>
        )}
      </div>
      {urlError && <p className="mt-1 text-xs text-destructive">{urlError}</p>}
    </div>
  );
}
