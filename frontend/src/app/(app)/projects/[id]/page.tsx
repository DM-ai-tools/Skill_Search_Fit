"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { ExecuteResponse, Output, Project, WorkspaceSession } from "@/lib/types";
import { ReportDownloadPanel } from "@/components/reports/report-download-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayPluginName } from "@/lib/plugin-catalog";
import { getOutputMarkdown } from "@/lib/report-utils";

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [sessions, setSessions] = useState<WorkspaceSession[]>([]);
  const [selected, setSelected] = useState<Output | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [p, outs, sess] = await Promise.all([
      api.get<Project>(`/projects/${projectId}`),
      api.get<Output[]>(`/projects/${projectId}/outputs`),
      api.get<WorkspaceSession[]>(`/projects/${projectId}/sessions`),
    ]);
    setProject(p);
    setOutputs(outs);
    setSessions(sess);
    if (outs.length > 0) setSelected(outs[0]);
  }, [projectId]);

  useEffect(() => {
    load().catch(() => setError("Failed to load project"));
  }, [load]);

  const selectedMarkdown = selected ? getOutputMarkdown(selected, selected.plugin_name) : "";
  const downloadResult: ExecuteResponse | null = selected
    ? {
        execution_id: selected.execution_id || selected.id,
        status: "completed",
        output: {
          markdown: selectedMarkdown,
          structured: selected.generated_output,
        },
        workflow_steps: [],
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 rounded-xl border border-border-strong/40 bg-surface/40 px-3 py-2 text-sm text-muted hover:text-foreground hover:bg-surface/70 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Projects
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{project?.project_name ?? "Project"}</h1>
          <p className="text-sm text-muted">
            {outputs.length} reports · {sessions.length} workspace sessions
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">All reports</h2>
          {outputs.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelected(o)}
              className={`w-full rounded-xl border p-3 text-left transition-all duration-150 ${
                selected?.id === o.id
                  ? "border-primary/30 bg-primary/10 shadow-[0_2px_12px_rgba(224,138,60,0.10)]"
                  : "border-border/40 bg-surface/40 hover:bg-surface/70 hover:border-border-strong/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    {o.plugin_name ? displayPluginName(o.plugin_name) : "Report"}
                  </p>
                  <p className="text-xs text-muted">{new Date(o.created_at).toLocaleString()}</p>
                </div>
              </div>
            </button>
          ))}
          {outputs.length === 0 && (
            <Card>
              <CardContent className="p-4 text-sm text-muted">
                No saved reports yet. Run a plugin from the library and save the output.
              </CardContent>
            </Card>
          )}

          {sessions.length > 0 && (
            <div className="pt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Recent changes
              </h2>
              <ul className="mt-2 space-y-2">
                {sessions.slice(0, 8).map((s) => (
                  <li key={s.id} className="rounded-xl border border-border/40 bg-surface/30 p-3 text-xs">
                    <p className="font-medium">
                      {s.plugin_name ? displayPluginName(s.plugin_name) : "Workspace"}
                    </p>
                    <p className="text-muted">Inputs updated {new Date(s.updated_at).toLocaleString()}</p>
                    {s.notes && <p className="mt-1 text-muted line-clamp-2">{s.notes}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        <section className="space-y-4">
          {selected && downloadResult ? (
            <>
              <ReportDownloadPanel
                result={downloadResult}
                pluginName={selected.plugin_name || "Report"}
              />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Report content</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border border-border/30 bg-background/60 p-4 text-sm text-foreground/80">
                    {selectedMarkdown}
                  </pre>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted">
                Select a report from the left to view and download it anytime.
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
