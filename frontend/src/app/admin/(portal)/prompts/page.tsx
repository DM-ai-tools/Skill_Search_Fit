"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Plugin } from "@/lib/types";
import { BentoGrid, BentoSectionHeader, BentoTile } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function AdminPromptsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [prompts, setPrompts] = useState({ primary: "", system: "", followup: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Plugin[]>("/admin/plugins").then(setPlugins);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    api.get<{ prompts: { prompt_type: string; prompt_content: string }[] }>(
      `/admin/plugins/${selectedId}/prompts`,
    ).then((res) => {
      const map = { primary: "", system: "", followup: "" };
      res.prompts.forEach((p) => {
        if (p.prompt_type in map) {
          map[p.prompt_type as keyof typeof map] = p.prompt_content;
        }
      });
      setPrompts(map);
    });
  }, [selectedId]);

  const save = async () => {
    if (!selectedId) return;
    await api.put(`/admin/plugins/${selectedId}/prompts`, {
      prompts: [
        { prompt_type: "primary", prompt_content: prompts.primary },
        { prompt_type: "system", prompt_content: prompts.system },
        { prompt_type: "followup", prompt_content: prompts.followup },
      ],
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <BentoSectionHeader
        eyebrow="Admin"
        title="Prompt management"
        description="Edit prompt templates used by plugin executions."
      />
      <BentoTile variant="strong" className="max-w-2xl">
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">Plugin</p>
        <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select plugin...</option>
          {plugins.map((p) => (
            <option key={p.id} value={p.id}>
              {p.plugin_name}
            </option>
          ))}
        </Select>
      </BentoTile>

      {selectedId && (
        <BentoGrid columns={3}>
          {(["primary", "system", "followup"] as const).map((type) => (
            <BentoTile key={type}>
              <label className="text-sm font-medium capitalize">{type} prompt</label>
              <Textarea
                className="mt-1 font-mono text-xs"
                rows={6}
                value={prompts[type]}
                onChange={(e) => setPrompts({ ...prompts, [type]: e.target.value })}
              />
            </BentoTile>
          ))}
          <BentoTile span="wide" className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted">Save all prompt template changes for the selected plugin.</p>
            <Button onClick={save}>{saved ? "Saved!" : "Save prompts"}</Button>
          </BentoTile>
        </BentoGrid>
      )}
    </div>
  );
}
