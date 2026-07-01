"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { fetchSystemCapabilities, type SystemCapabilities } from "@/lib/system-capabilities";
import { cn } from "@/lib/utils";

type BannerMode = "execution" | "presentation" | "all";

export function AiSetupBanner({
  mode = "all",
  className,
}: {
  mode?: BannerMode;
  className?: string;
}) {
  const [caps, setCaps] = useState<SystemCapabilities | null>(null);

  useEffect(() => {
    void fetchSystemCapabilities().then(setCaps).catch(() => setCaps(null));
  }, []);

  if (!caps) return null;

  const needsExecution = mode === "execution" || mode === "all";
  const needsPresentation = mode === "presentation" || mode === "all";

  if (needsExecution && !caps.live_ai) {
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive",
          className,
        )}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Preview mode — no live AI configured</p>
          <p className="mt-1 text-destructive/90">
            Add <code className="rounded bg-black/20 px-1">ANTHROPIC_API_KEY</code> or{" "}
            <code className="rounded bg-black/20 px-1">OPENAI_API_KEY</code> to{" "}
            <code className="rounded bg-black/20 px-1">backend/.env</code> and restart the API.
            Runs will return placeholder output, not real SEO analysis.
          </p>
        </div>
      </div>
    );
  }

  if (needsPresentation && caps.live_ai && !caps.openai_configured) {
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100",
          className,
        )}
      >
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div>
          <p className="font-medium text-amber-50">OpenAI not configured for presentation features</p>
          <p className="mt-1 text-amber-100/90">
            Plugin runs use {caps.primary_executor === "claude" ? "Claude" : "AI"}, but report
            presentation, article preview polish, and PDF enhancement need{" "}
            <code className="rounded bg-black/20 px-1">OPENAI_API_KEY</code> on the backend.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
