"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Plugin } from "@/lib/types";
import { BentoGrid, BentoSectionHeader, BentoTile } from "@/components/bento";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function AdminPluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [form, setForm] = useState({
    plugin_name: "",
    description: "",
    category: "research",
    icon: "puzzle",
  });

  const load = () => api.get<Plugin[]>("/admin/plugins").then(setPlugins);
  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/admin/plugins", { ...form, input_fields: [], status: "enabled" });
    setForm({ plugin_name: "", description: "", category: "research", icon: "puzzle" });
    await load();
  };

  const toggleStatus = async (id: string, status: string) => {
    await api.patch(`/admin/plugins/${id}/status`, { status: status === "enabled" ? "disabled" : "enabled" });
    await load();
  };

  return (
    <div className="space-y-6">
      <BentoSectionHeader
        eyebrow="Admin"
        title="Plugin management"
        description="Create, edit, and enable SEO skill plugins."
      />

      <form onSubmit={create} className="bento-tile-strong space-y-3">
        <h2 className="font-medium">Create plugin</h2>
        <div className="grid gap-2 md:grid-cols-2">
          <Input placeholder="Plugin name" value={form.plugin_name} onChange={(e) => setForm({ ...form, plugin_name: e.target.value })} required />
          <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Input placeholder="Icon key (e.g. search)" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
        </div>
        <Textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <Button type="submit">Create plugin</Button>
      </form>

      <BentoGrid columns={2}>
        {plugins.map((p) => (
          <BentoTile key={p.id} className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{p.plugin_name}</p>
                  <Badge variant={p.status === "enabled" ? "default" : "outline"}>{p.status}</Badge>
                  <Badge variant="secondary">v{p.schema_version}</Badge>
                </div>
                <p className="text-sm text-muted">{p.description}</p>
              </div>
              <div className="flex gap-2">
                <Link href={`/admin/plugins/${p.id}`}>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </Link>
                <Button variant="outline" size="sm" onClick={() => toggleStatus(p.id, p.status)}>
                  {p.status === "enabled" ? "Disable" : "Enable"}
                </Button>
              </div>
          </BentoTile>
        ))}
      </BentoGrid>
    </div>
  );
}
