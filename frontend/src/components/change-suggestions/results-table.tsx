"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import type { PublishItemResult } from "@/lib/change-suggestions-api";

interface ResultsTableProps {
  results: PublishItemResult[];
  dryRun: boolean;
}

export function ResultsTable({ results, dryRun }: ResultsTableProps) {
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="font-medium text-success">✓ {succeeded} succeeded</span>
        {failed > 0 && (
          <span className="font-medium text-destructive">✗ {failed} failed</span>
        )}
        {dryRun && (
          <span className="ml-auto rounded-full border border-warning/30 bg-warning-soft/40 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-warning">
            Dry run — nothing published
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-surface/60">
              <th className="px-4 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                Field
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                Page
              </th>
              <th className="px-4 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                Result
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {results.map((r) => (
              <tr
                key={r.change_id}
                className="bg-background/30 transition-colors hover:bg-surface/50"
              >
                <td className="px-4 py-3 font-medium text-foreground">{r.field_label}</td>
                <td className="max-w-[200px] truncate px-4 py-3 text-muted">{r.page_url}</td>
                <td className="px-4 py-3">
                  {r.success ? (
                    <span className="flex items-center gap-1.5 text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      {dryRun ? "Would succeed" : "Published"}
                    </span>
                  ) : (
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-destructive">
                        <XCircle className="h-4 w-4" />
                        Failed
                      </span>
                      {r.error && <span className="text-xs text-muted">{r.error}</span>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
