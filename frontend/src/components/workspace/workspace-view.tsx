"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { ExecuteResponse, Output, Plugin, PluginAutofillResult, WorkspaceSession } from "@/lib/types";
import { useProjectStore } from "@/stores/project-store";
import { DynamicForm } from "@/components/plugins/dynamic-form";
import { BentoSectionHeader, BentoTile } from "@/components/bento";
import { ProjectGatePanel } from "@/components/projects/project-gate-panel";
import { ReportDownloadPanel } from "@/components/reports/report-download-panel";
import { ExecutionProgress } from "@/components/workspace/execution-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatApiError } from "@/lib/format-api-error";
import { displayPluginName, getPluginCategory } from "@/lib/plugin-catalog";
import { getPluginRunLabel } from "@/lib/plugin-actions";
import { getOutputMarkdown } from "@/lib/report-utils";
import { normalizePluginInputs, resolveSelectValue } from "@/lib/plugin-field-utils";
import { getApiCapabilities } from "@/lib/api-capabilities";
import { FileText, Sparkles } from "lucide-react";

const EXECUTION_STEPS = ["Validate inputs", "Load prompt template", "AI execution", "Process response"];

export function WorkspaceView({
  pluginId,
  projectId,
  siteUrl,
}: {
  pluginId: string;
  projectId?: string;
  siteUrl?: string;
}) {
  const router = useRouter();
  const { activeProjectId, setActiveProject } = useProjectStore();
  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [viewingOutput, setViewingOutput] = useState<Output | null>(null);
  const [schemaWarning, setSchemaWarning] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [autofillValues, setAutofillValues] = useState<Record<string, unknown>>({});
  const [confidenceScores, setConfidenceScores] = useState<Record<string, number>>({});
  const [formKey, setFormKey] = useState("initial");
  const [autofilling, setAutofilling] = useState(false);
  const [staleApi, setStaleApi] = useState(false);
  const [postRunWarning, setPostRunWarning] = useState("");
  const [fieldSuggestions, setFieldSuggestions] = useState<Record<string, string[]>>({});
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(false);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveProjectId = projectId || activeProjectId;

  const loadData = useCallback(async () => {
    const p = await api.get<Plugin>(`/plugins/${pluginId}`);
    setPlugin(p);

    if (effectiveProjectId) {
      const sessions = await api.get<WorkspaceSession[]>(`/projects/${effectiveProjectId}/sessions`);
      const match = sessions.find((s) => s.plugin_id === pluginId);
      if (match) {
        setSession(match);
        setNotes(match.notes || "");
        if (match.schema_version !== p.schema_version) {
          setSchemaWarning(true);
        }
      }
      const outs = await api.get<Output[]>(`/projects/${effectiveProjectId}/outputs`);
      setOutputs(outs.filter((o) => o.plugin_id === pluginId));
    }
  }, [pluginId, effectiveProjectId]);

  useEffect(() => {
    getApiCapabilities().then((caps) => setStaleApi(!caps.websiteAnalysis));
  }, []);

  useEffect(() => {
    loadData().catch(() => setError("Failed to load workspace"));
  }, [loadData]);

  useEffect(() => {
    if (projectId) setActiveProject(projectId);
  }, [projectId, setActiveProject]);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  const startProgress = () => {
    setActiveStep(0);
    setProgress(5);
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        return p + 4;
      });
      setActiveStep((s) => Math.min(s + 1, EXECUTION_STEPS.length - 1));
    }, 1200);
  };

  const finishProgress = () => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    setActiveStep(EXECUTION_STEPS.length);
    setProgress(100);
  };

  const applyAutofillResult = (res: PluginAutofillResult) => {
    const values: Record<string, unknown> = {};
    const scores: Record<string, number> = {};
    const suggestions: Record<string, string[]> = {};
    if (res.fields && Object.keys(res.fields).length > 0) {
      for (const [key, item] of Object.entries(res.fields)) {
        const field = plugin?.input_fields?.find((f) => f.name === key);
        const rawValue =
          field?.type === "select" ? resolveSelectValue(field, item.value) : item.value;
        values[key] = rawValue;
        scores[key] = item.confidence;
        if (item.suggestions?.length) {
          suggestions[key] = field?.type === "select"
            ? item.suggestions.map((s) => resolveSelectValue(field, s))
            : item.suggestions;
        }
      }
    } else {
      for (const [key, val] of Object.entries(res.recommended_values || {})) {
        const conf = res.confidence_scores?.[key] ?? 0;
        values[key] = val;
        scores[key] = conf;
      }
    }
    setAutofillValues(values);
    setConfidenceScores(scores);
    if (Object.keys(suggestions).length > 0) setFieldSuggestions(suggestions);
    setSuggestionsEnabled(true);
    setFormKey(`autofill-${Date.now()}`);
  };

  const handleAutofill = async () => {
    if (!plugin || !siteUrl) return;
    setAutofilling(true);
    setError("");
    try {
      const caps = await getApiCapabilities();
      if (!caps.websiteAnalysis) {
        setStaleApi(true);
        setError(
          "Website analysis API is unavailable. Stop the API terminal, then run: npm run dev:api"
        );
        return;
      }
      try {
        const cached = await api.get<PluginAutofillResult>(
          `/website-analysis/plugins/${pluginId}/prefill?url=${encodeURIComponent(siteUrl)}`
        );
        applyAutofillResult(cached);
        return;
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 404) {
          setError("AI recommendations are still being prepared. Continue browsing and try again shortly.");
          return;
        }
      }
      const res = await api.post<PluginAutofillResult>(
        `/website-analysis/plugins/${pluginId}/autofill`,
        { url: siteUrl }
      );
      applyAutofillResult(res);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 404) {
        setStaleApi(true);
        setError(
          "Website analysis API not found (stale backend). Restart the API: npm run dev:api"
        );
      } else {
        setError(formatApiError(err, "AI autofill failed. Fill fields manually."));
      }
    } finally {
      setAutofilling(false);
    }
  };

  const handleRun = async (inputs: Record<string, unknown>) => {
    if (!plugin || !effectiveProjectId) return;
    const normalizedInputs = normalizePluginInputs(plugin.input_fields || [], inputs);
    const invalidSelectFields: string[] = [];
    const missingRequiredFields: string[] = [];
    for (const field of plugin.input_fields || []) {
      const value = normalizedInputs[field.name];
      const isEmpty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "");
      if (field.required && isEmpty) {
        missingRequiredFields.push(field.name);
        continue;
      }
      if (field.type === "select" && typeof value === "string" && value) {
        const validValues = (field.options || []).map((o) => o.value);
        if (!validValues.includes(value)) {
          invalidSelectFields.push(field.name);
        }
      }
    }
    if (missingRequiredFields.length || invalidSelectFields.length) {
      const segments: string[] = [];
      if (missingRequiredFields.length) {
        segments.push(`Missing required fields: ${missingRequiredFields.join(", ")}`);
      }
      if (invalidSelectFields.length) {
        segments.push(`Invalid dropdown values: ${invalidSelectFields.join(", ")}`);
      }
      setError(segments.join(" | "));
      return;
    }
    setError("");
    setPostRunWarning("");
    setRunning(true);
    setResult(null);
    setViewingOutput(null);
    startProgress();
    try {
      const res = await api.post<ExecuteResponse>(`/execute/${pluginId}`, {
        project_id: effectiveProjectId,
        inputs: normalizedInputs,
        schema_version: plugin.schema_version,
      });
      finishProgress();
      setResult(res);
      setSchemaWarning(false);

      router.push(`/reports/view?executionId=${res.execution_id}&pluginId=${plugin.id}`);
      return;
    } catch (err) {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setProgress(0);
      setActiveStep(0);
      if (err instanceof ApiError && err.code === "SCHEMA_OUTDATED") {
        setSchemaWarning(true);
        setError("Plugin form was updated. Please review your inputs and try again.");
      } else {
        setError(formatApiError(err, "Execution failed"));
      }
    } finally {
      setRunning(false);
    }
  };

  const handleSaveOutput = async () => {
    if (!result || !plugin || !effectiveProjectId) return;
    setSaving(true);
    try {
      await api.post("/outputs", {
        project_id: effectiveProjectId,
        plugin_id: plugin.id,
        execution_id: result.execution_id,
        input_snapshot: session?.inputs || {},
        schema_version: plugin.schema_version,
        generated_output: result.output,
      });
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const saveNotes = useCallback(async () => {
    if (!effectiveProjectId || !plugin) return;
    await api.put("/workspace/notes", {
      project_id: effectiveProjectId,
      plugin_id: plugin.id,
      notes,
    });
  }, [effectiveProjectId, plugin, notes]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (notes) saveNotes().catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [notes, saveNotes]);

  const activeMarkdown = viewingOutput
    ? getOutputMarkdown(viewingOutput)
    : result?.output.markdown ?? "";

  if (!effectiveProjectId) {
    return (
      <div className="mx-auto max-w-lg">
        <ProjectGatePanel
          title="Select or create a project"
          description="A project is required to run plugins and save outputs."
        />
      </div>
    );
  }

  if (!plugin) {
    return <p className="text-muted">Loading workspace...</p>;
  }

  const defaultValues = suggestionsEnabled ? autofillValues : {};

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <BentoSectionHeader
        eyebrow="Plugin Workspace"
        title={displayPluginName(plugin.plugin_name)}
        description={plugin.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/plugins" className="text-sm text-primary hover:underline">
              ← Plugins
            </Link>
            {(result?.output?.structured?.preview === true ||
              result?.output?.structured?.ai_mode === "preview") && <Badge variant="warning">Preview mode</Badge>}
            {result?.output?.structured?.ai_mode === "claude" && <Badge variant="default">Claude</Badge>}
          </div>
        }
      />

      {schemaWarning && (
        <div className="rounded-xl border border-warning/25 bg-warning-soft/20 px-4 py-3 text-sm text-warning">
          This plugin&apos;s form has been updated — please review your inputs before running.
        </div>
      )}

      {staleApi && (
        <div className="rounded-xl border border-destructive/25 bg-destructive-soft/20 px-4 py-3 text-sm text-destructive">
          The API server is missing website analysis routes (likely a stale process).
          Press Ctrl+C in the API terminal, then run{" "}
          <code className="rounded-lg border border-border/30 bg-surface/50 px-1.5 py-0.5 text-xs">npm run dev:api</code>{" "}
          (port 8000).
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_1fr_300px]">
        <BentoTile variant="strong" className="flex flex-col overflow-auto p-4">
          <h2 className="text-sm font-semibold">Inputs</h2>
          <p className="mt-1 text-xs text-muted">
            Fields start empty. Click Generate by AI to fill values and open suggestion dropdowns.
          </p>
          {siteUrl && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full border-primary/30 bg-primary/8 text-primary hover:bg-primary/15"
              onClick={handleAutofill}
              disabled={autofilling || running}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {autofilling ? "Generating..." : "Generate by AI"}
            </Button>
          )}
          <div className="mt-4 flex-1">
            <DynamicForm
              fields={plugin.input_fields || []}
              defaultValues={defaultValues}
              onSubmit={handleRun}
              disabled={running}
              pluginName={plugin.plugin_name}
              pluginId={pluginId}
              siteUrl={siteUrl}
              formKey={formKey}
              confidenceScores={confidenceScores}
              fieldSuggestions={fieldSuggestions}
              suggestionsEnabled={suggestionsEnabled}
            />
          </div>
          <Button type="submit" form="plugin-form" className="mt-4 w-full" disabled={running}>
            {running ? "Running…" : getPluginRunLabel(getPluginCategory(plugin.plugin_name, plugin.category), displayPluginName(plugin.plugin_name))}
          </Button>
        </BentoTile>

        <BentoTile className="flex min-h-0 flex-col overflow-auto p-4">
          <ExecutionProgress
            steps={EXECUTION_STEPS}
            activeStep={activeStep}
            progress={progress}
            running={running}
          />

          {result && !viewingOutput && (
            <div className="mb-4">
              <ReportDownloadPanel
                result={result}
                pluginName={plugin.plugin_name}
                onSave={handleSaveOutput}
                saving={saving}
              />
            </div>
          )}

          {activeMarkdown ? (
            <div className="flex-1 overflow-auto rounded-xl border border-border/30 bg-background/60">
              <pre className="p-4 text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap font-[inherit]">
                {activeMarkdown}
              </pre>
            </div>
          ) : (
            !running && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface ring-1 ring-border">
                  <FileText className="h-5 w-5 text-muted/50" />
                </div>
                <p className="text-sm text-muted">
                  Fill in inputs or use{" "}
                  <span className="font-medium text-foreground">Generate by AI</span>, then{" "}
                  {getPluginRunLabel(getPluginCategory(plugin.plugin_name, plugin.category), displayPluginName(plugin.plugin_name)).toLowerCase()}.
                </p>
              </div>
            )
          )}
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          {postRunWarning && <p className="mt-4 text-sm text-warning">{postRunWarning}</p>}
        </BentoTile>

        <BentoTile className="flex flex-col gap-4 overflow-auto p-4">
          <div>
            <h2 className="text-sm font-semibold">Notes</h2>
            <Textarea
              className="mt-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Workspace notes..."
              rows={4}
            />
          </div>

          <div className="flex-1 overflow-auto">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Saved reports</h2>
              <Link
                href={`/projects/${effectiveProjectId}`}
                className="text-xs text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <ul className="space-y-1.5">
              {outputs.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setViewingOutput(o);
                      setResult(null);
                    }}
                    className={cn(
                      "w-full rounded-xl border p-2.5 text-left text-xs transition-all duration-150",
                      viewingOutput?.id === o.id
                        ? "border-primary/30 bg-primary/8"
                        : "border-border/40 bg-surface/30 hover:border-border-strong/50 hover:bg-surface/60",
                    )}
                  >
                    <p className="font-medium text-foreground">
                      {o.plugin_name ? displayPluginName(o.plugin_name) : "Report"}
                    </p>
                    <p className="mt-0.5 text-muted">{new Date(o.created_at).toLocaleString()}</p>
                  </button>
                </li>
              ))}
              {outputs.length === 0 && (
                <p className="rounded-xl border border-dashed border-border/40 px-3 py-4 text-center text-xs text-muted">
                  No saved reports yet
                </p>
              )}
            </ul>
          </div>
        </BentoTile>
      </div>
    </div>
  );
}
