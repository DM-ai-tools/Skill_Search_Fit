"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { ExecuteResponse, InputField, Output, Plugin, PluginAutofillResult, WorkspaceSession } from "@/lib/types";
import { useProjectStore } from "@/stores/project-store";
import { DynamicForm } from "@/components/plugins/dynamic-form";
import { BentoTile } from "@/components/bento";
import { ProjectGatePanel } from "@/components/projects/project-gate-panel";
import { ReportDownloadPanel } from "@/components/reports/report-download-panel";
import { WorkspaceGenerationPanel } from "@/components/workspace/workspace-generation-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatApiError } from "@/lib/format-api-error";
import { displayPluginName, getPluginCategory } from "@/lib/plugin-catalog";
import { getPluginRunLabel } from "@/lib/plugin-actions";
import { getExecutionMarkdown, getOutputMarkdown } from "@/lib/report-utils";
import { validateAutofillValues } from "@/lib/autofill-validation";
import { normalizePluginInputs, resolveSelectValue } from "@/lib/plugin-field-utils";
import { getApiCapabilities } from "@/lib/api-capabilities";
import { FileText, LogOut, Sparkles } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { HeaderProjectControls } from "@/components/layout/header-project-controls";

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
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };
  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [generating, setGenerating] = useState(false);
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
  const [autofillWarning, setAutofillWarning] = useState("");
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingResultRef = useRef<ExecuteResponse | null>(null);

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

    const resolveFieldValue = (field: InputField | undefined, raw: unknown) => {
      if (field?.type === "select") return resolveSelectValue(field, raw);
      return raw;
    };

    if (res.fields && Object.keys(res.fields).length > 0) {
      for (const [key, item] of Object.entries(res.fields)) {
        const field = plugin?.input_fields?.find((f) => f.name === key);
        let rawValue = item.value ?? res.recommended_values?.[key];
        if (
          (rawValue === null || rawValue === undefined || rawValue === "") &&
          item.suggestions?.length
        ) {
          rawValue = item.suggestions[0];
        }
        values[key] = resolveFieldValue(field, rawValue);
        scores[key] = item.confidence;
        if (item.suggestions?.length) {
          suggestions[key] = field?.type === "select"
            ? item.suggestions.map((s) => resolveSelectValue(field, s))
            : item.suggestions;
        }
      }
    } else {
      for (const [key, val] of Object.entries(res.recommended_values || {})) {
        const field = plugin?.input_fields?.find((f) => f.name === key);
        values[key] = resolveFieldValue(field, val);
        scores[key] = res.confidence_scores?.[key] ?? 0;
      }
    }

    for (const field of plugin?.input_fields || []) {
      const current = values[field.name];
      const isEmpty =
        current === undefined ||
        current === null ||
        (typeof current === "string" && current.trim() === "");
      if (!isEmpty) continue;
      const fallback = res.recommended_values?.[field.name];
      if (fallback !== undefined && fallback !== null && fallback !== "") {
        values[field.name] = resolveFieldValue(field, fallback);
        scores[field.name] = res.confidence_scores?.[field.name] ?? scores[field.name] ?? 0.5;
      }
    }

    for (const field of plugin?.input_fields || []) {
      const existing = values[field.name];
      if (existing !== undefined && existing !== null) continue;
      if (field.type === "checkbox") values[field.name] = false;
      else if (field.type === "number") values[field.name] = "";
      else values[field.name] = "";
    }

    const validationErrors = validateAutofillValues(plugin?.input_fields || [], values);
    if (validationErrors.length > 0) {
      setAutofillWarning(
        validationErrors.map((e) => e.message).join(". ") +
          ". Review highlighted fields before running.",
      );
    } else {
      setAutofillWarning("");
    }

    setAutofillValues(values);
    setConfidenceScores(scores);
    if (Object.keys(suggestions).length > 0) setFieldSuggestions(suggestions);
    setSuggestionsEnabled(true);
    setFormKey(`autofill-${Date.now()}`);
  };

  const countEmptyRequiredAutofillFields = (res: PluginAutofillResult) => {
    const fields = plugin?.input_fields || [];
    let empty = 0;
    for (const field of fields) {
      if (!field.required) continue;
      const fromFields = res.fields?.[field.name]?.value;
      const fromRecommended = res.recommended_values?.[field.name];
      const raw = fromFields ?? fromRecommended;
      if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
        empty += 1;
      }
    }
    return empty;
  };

  const isCompetitorsAutofillEmpty = (res: PluginAutofillResult) => {
    const competitorFields = (plugin?.input_fields || []).filter((field) =>
      /competitor/i.test(field.name),
    );
    if (competitorFields.length === 0) return false;
    return competitorFields.every((field) => {
      const raw = res.fields?.[field.name]?.value ?? res.recommended_values?.[field.name];
      return raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
    });
  };

  const handleAutofill = async () => {
    if (!plugin || !siteUrl) return;
    setAutofilling(true);
    setError("");
    setAutofillWarning("");
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
        if (countEmptyRequiredAutofillFields(cached) >= 2 || isCompetitorsAutofillEmpty(cached)) {
          const res = await api.post<PluginAutofillResult>(
            `/website-analysis/plugins/${pluginId}/autofill`,
            { url: siteUrl }
          );
          applyAutofillResult(res);
        } else {
          applyAutofillResult(cached);
        }
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
    setGenerating(true);
    setResult(null);
    setViewingOutput(null);
    pendingResultRef.current = null;
    startProgress();
    try {
      const res = await api.post<ExecuteResponse>(`/execute/${pluginId}`, {
        project_id: effectiveProjectId,
        inputs: normalizedInputs,
        schema_version: plugin.schema_version,
      });
      finishProgress();
      setGenerating(false);
      setSchemaWarning(false);
      router.push(`/reports/view?executionId=${res.execution_id}&pluginId=${plugin.id}`);
      return;
    } catch (err) {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setProgress(0);
      setActiveStep(0);
      setGenerating(false);
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

  const handleStreamComplete = () => {
    const res = pendingResultRef.current;
    setGenerating(false);
    setProgress(0);
    setActiveStep(0);
    if (res && plugin) {
      router.push(`/reports/view?executionId=${res.execution_id}&pluginId=${plugin.id}`);
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
    ? getOutputMarkdown(viewingOutput, viewingOutput.plugin_name)
    : getExecutionMarkdown(result?.output, plugin?.plugin_name);

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
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {/* ── Top controls bar ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <Link href="/plugins" className="text-sm font-medium text-primary hover:underline">
          ← Plugins
        </Link>
        <div className="flex items-center gap-2">
          <HeaderProjectControls />
          <span className="hidden text-xs text-muted sm:block">{user?.name}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Log out"
            className="h-8 w-8 text-muted hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

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

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[minmax(260px,22%)_minmax(0,1fr)_minmax(240px,20%)]">
        <BentoTile variant="strong" className="flex min-h-0 flex-col overflow-hidden p-0">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-4 pb-2 space-y-4">
            {siteUrl && (
              <button
                type="button"
                onClick={handleAutofill}
                disabled={autofilling || running || generating}
                className="ai-gen-btn group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />
                <div className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                {autofilling ? (
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : (
                  <Sparkles className="h-4 w-4 shrink-0 text-primary transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
                )}
                <span className="text-primary">
                  {autofilling ? "Generating…" : "Generate by AI"}
                </span>
              </button>
            )}
            {autofillWarning && (
              <div className="rounded-xl border border-warning/25 bg-warning-soft/20 px-3 py-2.5 text-xs text-warning">
                {autofillWarning}
              </div>
            )}
            <DynamicForm
              fields={plugin.input_fields || []}
              defaultValues={defaultValues}
              onSubmit={handleRun}
              disabled={running || generating}
              pluginName={plugin.plugin_name}
              pluginId={pluginId}
              siteUrl={siteUrl}
              formKey={formKey}
              confidenceScores={confidenceScores}
              fieldSuggestions={fieldSuggestions}
              suggestionsEnabled={suggestionsEnabled}
            />
          </div>

          <div className="shrink-0 border-t border-border/50 bg-surface-elevated/60 p-4 pt-3">
            <Button type="submit" form="plugin-form" className="w-full" disabled={running || generating}>
              {running || generating ? "Running…" : getPluginRunLabel(getPluginCategory(plugin.plugin_name, plugin.category), displayPluginName(plugin.plugin_name))}
            </Button>
          </div>
        </BentoTile>

        <BentoTile className="relative flex min-h-0 flex-col overflow-hidden p-0">
          {(running || generating) ? (
            <WorkspaceGenerationPanel
              embedded
              progress={progress}
              pluginName={plugin.plugin_name}
              markdown={getExecutionMarkdown(result?.output, plugin.plugin_name)}
              onComplete={handleStreamComplete}
              label={result?.output?.markdown ? "Rendering report" : "Generating report"}
            />
          ) : (
          <>
            {result && !viewingOutput && (
              <div className="mb-4 space-y-3 p-4 pb-0">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {(result.output?.structured?.preview === true ||
                    result.output?.structured?.ai_mode === "preview") && (
                    <Badge variant="warning">Preview mode</Badge>
                  )}
                  {result.output?.structured?.ai_mode === "claude" && (
                    <Badge variant="default">Claude</Badge>
                  )}
                </div>
                <ReportDownloadPanel
                  result={result}
                  pluginName={plugin.plugin_name}
                  onSave={handleSaveOutput}
                  saving={saving}
                />
              </div>
            )}

            {activeMarkdown ? (
              <div className="flex-1 overflow-auto rounded-xl border border-border/30 bg-background/60 mx-4 mb-4">
                <pre className="p-4 text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap font-[inherit]">
                  {activeMarkdown}
                </pre>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface ring-1 ring-border">
                  <FileText className="h-5 w-5 text-muted/50" />
                </div>
                <p className="text-sm text-muted">
                  Fill in inputs or use{" "}
                  <span className="font-medium text-foreground">Generate by AI</span>, then{" "}
                  {getPluginRunLabel(getPluginCategory(plugin.plugin_name, plugin.category), displayPluginName(plugin.plugin_name)).toLowerCase()}.
                </p>
              </div>
            )}
          </>
          )}
          {error && !running && !generating && (
            <p className="px-4 pb-4 text-sm text-destructive">{error}</p>
          )}
          {postRunWarning && !running && !generating && (
            <p className="px-4 pb-4 text-sm text-warning">{postRunWarning}</p>
          )}
        </BentoTile>

        <BentoTile className="flex min-h-0 flex-col overflow-hidden p-4">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain">
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
          </div>
        </BentoTile>
      </div>
    </div>
  );
}
