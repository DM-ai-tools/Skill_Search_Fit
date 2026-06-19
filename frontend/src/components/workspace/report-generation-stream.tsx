"use client";

import { useEffect, useRef, useState } from "react";
import { displayPluginName } from "@/lib/plugin-catalog";
import { normalizeReportMarkdown, normalizeStreamLine } from "@/lib/report-normalizer";
import { cn } from "@/lib/utils";

function placeholderLines(pluginName: string, variant: "plugin" | "site-analysis"): string[] {
  if (variant === "site-analysis") {
    return [
      "Crawling sitemap and page inventory…",
      "Extracting business signals from homepage…",
      "Classifying site type and market category…",
      "Mapping internal link structure…",
      "Discovering competitor landscape…",
      "Building AI prefill recommendations…",
      "Scoring technical and content signals…",
      "Finalizing site intelligence profile…",
    ];
  }
  const name = displayPluginName(pluginName);
  return [
    `Starting ${name} analysis…`,
    "Validating inputs and loading prompt template…",
    "Connecting to AI execution layer…",
    "## Executive Summary",
    "Gathering signals from indexed sources…",
    "Analyzing patterns across response surfaces…",
    "### Key Findings",
    "Measuring visibility and citation frequency…",
    "Comparing against competitive landscape…",
    "### Recommendations",
    "Prioritizing high-impact optimization paths…",
    "Structuring report sections…",
    "Applying formatting and scoring models…",
    "Finalizing narrative output…",
  ];
}

const WAIT_LINES = [
  "Still analyzing data sources…",
  "Refining model output…",
  "Cross-checking findings…",
  "Almost there…",
];

function isHeading(line: string): boolean {
  return /^#{1,3}\s/.test(line);
}

export function ReportGenerationStream({
  pluginName,
  markdown,
  onComplete,
  compact = false,
  fill = false,
  variant = "plugin",
  active = true,
}: {
  pluginName: string;
  markdown?: string;
  onComplete?: () => void;
  compact?: boolean;
  fill?: boolean;
  variant?: "plugin" | "site-analysis";
  active?: boolean;
}) {
  const [completedLines, setCompletedLines] = useState<string[]>([]);
  const [activeLine, setActiveLine] = useState("");
  const [renderingReal, setRenderingReal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markdownRef = useRef(markdown);
  markdownRef.current = markdown;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const MAX_REAL_LINES = 36;

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let lineIndex = 0;
    let charIndex = 0;
    let typed = "";
    let sourceLines = placeholderLines(pluginName, variant);
    let usingReal = false;
    let waitIndex = 0;

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const finish = () => {
      if (cancelled || variant === "site-analysis") return;
      timerRef.current = setTimeout(() => {
        if (!cancelled) onCompleteRef.current?.();
      }, 700);
    };

    const realLines = () => {
      const normalized = normalizeReportMarkdown(
        { markdown: markdownRef.current, structured: null },
        pluginName,
      );
      return normalized
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => normalizeStreamLine(line))
        .filter((l) => l.length > 0)
        .slice(0, MAX_REAL_LINES);
    };

    const tick = () => {
      if (cancelled) return;

      if (!usingReal && markdownRef.current?.trim()) {
        usingReal = true;
        setRenderingReal(true);
        sourceLines = realLines();
        lineIndex = 0;
        charIndex = 0;
        typed = "";
        setCompletedLines([]);
        setActiveLine("");
      }

      if (lineIndex >= sourceLines.length) {
        if (!usingReal) {
          if (!markdownRef.current?.trim()) {
            sourceLines = [...sourceLines, WAIT_LINES[waitIndex % WAIT_LINES.length]];
            waitIndex += 1;
          } else {
            timerRef.current = setTimeout(tick, 200);
            return;
          }
        } else {
          if (typed) {
            setCompletedLines((prev) => [...prev, typed]);
            setActiveLine("");
          }
          finish();
          return;
        }
      }

      if (lineIndex >= sourceLines.length) {
        timerRef.current = setTimeout(tick, 200);
        return;
      }

      const target = sourceLines[lineIndex];
      const delay = usingReal ? (target.length > 80 ? 12 : 22) : isHeading(target) ? 28 : 18;

      if (charIndex < target.length) {
        charIndex += usingReal ? 2 : 1;
        typed = target.slice(0, charIndex);
        setActiveLine(typed);
        timerRef.current = setTimeout(tick, delay);
        return;
      }

      setCompletedLines((prev) => [...prev, target]);
      setActiveLine("");
      typed = "";
      charIndex = 0;
      lineIndex += 1;

      const pause = usingReal ? 60 : isHeading(target) ? 320 : 180;
      timerRef.current = setTimeout(tick, pause);
    };

    setCompletedLines([]);
    setActiveLine("");
    timerRef.current = setTimeout(tick, 400);

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [pluginName, variant, active]);

  useEffect(() => {
    if (!active) {
      setCompletedLines([]);
      setActiveLine("");
      setRenderingReal(false);
    }
  }, [active]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [completedLines, activeLine]);

  const visibleLines = compact && !fill ? completedLines.slice(-3) : completedLines;

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden",
        compact && !fill
          ? "h-[88px] rounded-lg border border-border/30 bg-background/50"
          : "min-h-0 flex-1 rounded-xl border border-primary/15 bg-background/70",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-background via-background/80 to-transparent",
          compact ? "h-6" : "h-20",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background/90 to-transparent",
          compact ? "h-5" : "h-12",
        )}
      />

      {!compact && (
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/80">
            {renderingReal ? "Rendering report" : "Generating report"}
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        className={cn(
          "report-stream-scroll flex-1 overflow-y-auto",
          compact ? "px-3 py-2" : "px-5 py-4",
        )}
      >
        <div className={compact ? "space-y-1" : "space-y-2"}>
          {visibleLines.map((line, i) => (
            <p
              key={`${i}-${line.slice(0, 24)}`}
              className={cn(
                "report-stream-line leading-relaxed",
                compact ? "text-xs" : "text-sm",
                isHeading(line)
                  ? cn("font-semibold text-primary", compact ? "mt-1 first:mt-0" : "mt-3 first:mt-0")
                  : "text-foreground/75",
              )}
            >
              {line.replace(/^#{1,3}\s+/, "")}
            </p>
          ))}
          {activeLine && (
            <p
              className={cn(
                "leading-relaxed",
                compact ? "text-xs" : "text-sm",
                isHeading(activeLine) ? "font-semibold text-primary" : "text-foreground",
              )}
            >
              {activeLine.replace(/^#{1,3}\s+/, "")}
              <span className="ml-0.5 inline-block w-2 animate-pulse text-primary">▍</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
