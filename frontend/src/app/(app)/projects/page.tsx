"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useProjectStore } from "@/stores/project-store";
import { BentoGrid, BentoSectionHeader, BentoStatTile, BentoTile } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { LoadErrorBanner } from "@/components/ui/load-error-banner";
import { Dialog } from "@/components/ui/dialog";
import { FileText, FolderKanban, Plus, Pencil, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";

export default function ProjectsPage() {
  const { projects, fetchProjects, createProject, error: loadError, loading, clearError } = useProjectStore();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    fetchProjects().catch(() => undefined);
  }, [fetchProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      await createProject(name);
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string, project_name: string) => {
    await api.patch(`/projects/${id}`, { project_name });
    await fetchProjects();
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const next = renameTarget.name.trim();
    if (!next) return;
    setRenaming(true);
    try {
      await handleRename(renameTarget.id, next);
      setRenameTarget(null);
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/projects/${id}`);
    setDeleteId(null);
    await fetchProjects();
  };

  return (
    <div className="space-y-6">
      <BentoSectionHeader
        eyebrow="Workspace"
        title="Projects"
        description="Organize plugin outputs and workspace sessions."
      />

      {loadError && (
        <LoadErrorBanner
          message={loadError}
          onRetry={async () => {
            clearError();
            await fetchProjects();
          }}
          retrying={loading}
        />
      )}

      <BentoGrid columns={3}>
        <BentoStatTile
          label="Projects"
          value={projects.length}
          tone="secondary"
          icon={<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-soft ring-1 ring-secondary/25"><FolderKanban className="h-5 w-5 text-secondary" /></div>}
        />
        <BentoStatTile
          label="Saved outputs"
          value={projects.reduce((sum, project) => sum + (project.output_count || 0), 0)}
          icon={<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft ring-1 ring-primary/25"><FileText className="h-5 w-5 text-primary" /></div>}
        />
        <BentoTile span="wide" variant="strong">
          <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted/60">
            New project
          </p>
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={creating} className="shrink-0 gap-1.5">
              <Plus className="h-4 w-4" />
              {creating ? "Creating…" : "Create"}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </BentoTile>
      </BentoGrid>

      {/* Projects list */}
      {projects.length > 0 ? (
        <BentoGrid columns={3}>
          {projects.map((p) => (
            <div
              key={p.id}
              className="bento-tile flex flex-col justify-between gap-4"
            >
              <Link href={`/projects/${p.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                <p className="font-medium text-foreground">{p.project_name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {p.output_count} outputs · Created {new Date(p.created_at).toLocaleDateString()}
                </p>
              </Link>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted hover:text-foreground"
                  onClick={() => setRenameTarget({ id: p.id, name: p.project_name })}
                  aria-label="Rename project"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted hover:text-destructive"
                  onClick={() => setDeleteId(p.id)}
                  aria-label="Delete project"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </BentoGrid>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/40 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary-soft ring-1 ring-secondary/25">
            <FolderKanban className="h-6 w-6 text-secondary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No projects yet</p>
            <p className="mt-1 text-sm text-muted">Create a project above to start saving outputs.</p>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete this project?"
        description="The project will be retained for 30 days before permanent removal."
        confirmLabel="Delete project"
        destructive
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
      <Dialog
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Rename project"
        className="max-w-md"
      >
        <div className="space-y-4 p-5">
          <Input
            value={renameTarget?.name ?? ""}
            onChange={(e) => setRenameTarget((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
            placeholder="Project name"
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename().catch(() => undefined);
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenameTarget(null)} disabled={renaming}>
              Cancel
            </Button>
            <Button onClick={() => submitRename().catch(() => undefined)} disabled={renaming || !renameTarget?.name.trim()}>
              {renaming ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
