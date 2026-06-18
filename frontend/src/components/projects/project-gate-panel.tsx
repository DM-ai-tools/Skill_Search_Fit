"use client";

import { useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { BentoTile } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useProjectStore } from "@/stores/project-store";

export function ProjectGatePanel({
  title = "Choose a project",
  description = "Select where this work should be saved, or create a new project.",
  compact = false,
}: {
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const { projects, activeProjectId, setActiveProject, createProject } = useProjectStore();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError("");
    try {
      await createProject(trimmed);
      setName("");
    } catch {
      setError("Could not create project.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <BentoTile variant="strong" className={compact ? "space-y-3 p-4" : "space-y-4"}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary-soft text-secondary ring-1 ring-secondary/25">
          <FolderKanban className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        </div>
      </div>

      {projects.length > 0 && (
        <Select value={activeProjectId || ""} onChange={(e) => setActiveProject(e.target.value || null)}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.project_name}
            </option>
          ))}
        </Select>
      )}

      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={creating} size={compact ? "sm" : "default"} className="shrink-0">
          <Plus className="h-4 w-4" />
          {creating ? "Creating" : "Create"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </BentoTile>
  );
}
