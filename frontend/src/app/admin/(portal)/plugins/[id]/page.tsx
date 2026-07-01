"use client";

import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Plugin } from "@/lib/types";
import { BentoGrid, BentoSectionHeader, BentoTile } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadErrorBanner } from "@/components/ui/load-error-banner";

export default function AdminPluginEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [fieldsJson, setFieldsJson] = useState("[]");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Plugin>(`/admin/plugins/${id}`)
      .then((detail) => {
        setPlugin(detail);
        setFieldsJson(JSON.stringify(detail.input_fields || [], null, 2));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load plugin"));
  }, [id]);

  const save = async () => {
    if (!plugin) return;
    setError("");
    let input_fields: unknown[];
    try {
      input_fields = JSON.parse(fieldsJson);
    } catch {
      setError("Invalid JSON for input fields.");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.patch<Plugin>(`/admin/plugins/${id}`, {
        plugin_name: plugin.plugin_name,
        description: plugin.description,
        category: plugin.category,
        icon: plugin.icon,
        input_fields,
      });
      setPlugin(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plugin");
    } finally {
      setSaving(false);
    }
  };

  if (!plugin) return <p className="text-muted">Loading...</p>;

  return (
    <div className="space-y-6">
      <BentoSectionHeader
        eyebrow="Admin"
        title="Edit plugin"
        description={`Schema version: ${plugin.schema_version}`}
      />
      {error && <LoadErrorBanner message={error} />}

      <BentoGrid columns={3}>
        <BentoTile variant="strong" className="space-y-3">
          <p className="font-semibold text-foreground">Metadata</p>
          <Input value={plugin.plugin_name} onChange={(e) => setPlugin({ ...plugin, plugin_name: e.target.value })} />
          <Input value={plugin.category} onChange={(e) => setPlugin({ ...plugin, category: e.target.value })} />
          <Input value={plugin.icon} onChange={(e) => setPlugin({ ...plugin, icon: e.target.value })} />
          <Textarea value={plugin.description} onChange={(e) => setPlugin({ ...plugin, description: e.target.value })} rows={4} />
        </BentoTile>
        <BentoTile span="hero" className="space-y-3">
          <label className="text-sm font-medium">Input fields (JSON)</label>
          <Textarea className="mt-1 font-mono text-xs" value={fieldsJson} onChange={(e) => setFieldsJson(e.target.value)} rows={18} />
          <Button onClick={save} disabled={saving}>{saved ? "Saved!" : saving ? "Saving..." : "Save plugin"}</Button>
        </BentoTile>
      </BentoGrid>
    </div>
  );
}
