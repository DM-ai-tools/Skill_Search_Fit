"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Save, X } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminConfigEntry } from "@/lib/types";
import { BentoSectionHeader, BentoTile } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORY_LABELS: Record<string, string> = {
  database:    "Database",
  auth:        "Authentication & Sessions",
  app:         "App & Environment",
  rate_limits: "Rate Limits",
  anthropic:   "Anthropic / Claude",
  openrouter:  "OpenRouter",
  website_scan:"Website Scanning",
  wordpress:   "WordPress",
  webflow:     "Webflow",
  wix:         "Wix",
  mailchimp:   "Mailchimp",
};

interface EditingEntry {
  key: string;
  value: string;
}

export default function AdminConfigPage() {
  const [entries, setEntries] = useState<AdminConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditingEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<EditingEntry | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<AdminConfigEntry[]>("/admin/config")
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editing) setTimeout(() => editRef.current?.focus(), 50);
  }, [editing]);

  const grouped = entries.reduce<Record<string, AdminConfigEntry[]>>((acc, e) => {
    (acc[e.category] ??= []).push(e);
    return acc;
  }, {});

  const toggleReveal = (key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const startEdit = (entry: AdminConfigEntry) => {
    setEditing({ key: entry.key, value: "" });
  };

  const cancelEdit = () => {
    setEditing(null);
    setSaveMsg("");
  };

  const requestSave = () => {
    if (!editing || !editing.value.trim()) return;
    setPendingEdit(editing);
    setConfirmPassword("");
    setConfirmError("");
    setConfirmOpen(true);
  };

  const confirmSave = async () => {
    if (!pendingEdit) return;
    if (!confirmPassword) {
      setConfirmError("Password is required.");
      return;
    }
    setSaving(true);
    setConfirmError("");
    try {
      await api.patch("/admin/config", { key: pendingEdit.key, value: pendingEdit.value });
      setSaveMsg(`${pendingEdit.key.toUpperCase()} updated.`);
      setEditing(null);
      setConfirmOpen(false);
      // refresh config list
      const fresh = await api.get<AdminConfigEntry[]>("/admin/config");
      setEntries(fresh);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setConfirmError(msg);
    } finally {
      setSaving(false);
    }
  };

  const displayValue = (entry: AdminConfigEntry) => {
    if (!entry.is_secret) return entry.value || "—";
    if (revealed.has(entry.key)) return entry.value || "—";
    return entry.value ? "••••••••" : "—";
  };

  return (
    <div className="space-y-8">
      <BentoSectionHeader
        eyebrow="Admin"
        title="Configuration"
        description="View and update environment variables. Secret fields are always masked in transit."
      />

      {saveMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-2 text-sm text-success">
          {saveMsg}
          <button onClick={() => setSaveMsg("")} className="ml-auto text-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading configuration...</p>
      ) : (
        Object.entries(grouped).map(([cat, catEntries]) => (
          <section key={cat} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
              {CATEGORY_LABELS[cat] ?? cat}
            </h2>
            <BentoTile variant="strong" className="divide-y divide-border/30 p-0 overflow-hidden">
              {catEntries.map((entry) => (
                <div key={entry.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-[200px] flex-1">
                    <p className="font-mono text-xs font-semibold text-foreground">{entry.display_key}</p>
                    <p className="mt-0.5 text-xs text-muted">{entry.description}</p>
                  </div>

                  {editing?.key === entry.key ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        ref={editRef}
                        type={entry.is_secret ? "password" : "text"}
                        placeholder={`New value for ${entry.display_key}`}
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") requestSave();
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="max-w-sm font-mono text-xs"
                      />
                      <Button size="sm" onClick={requestSave}><Save className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted/90 min-w-[80px]">
                        {displayValue(entry)}
                      </span>
                      {entry.is_secret && entry.value && (
                        <button
                          onClick={() => toggleReveal(entry.key)}
                          className="text-muted hover:text-foreground transition-colors"
                          title={revealed.has(entry.key) ? "Hide" : "Show"}
                        >
                          {revealed.has(entry.key)
                            ? <EyeOff className="h-3.5 w-3.5" />
                            : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => startEdit(entry)}>
                        Edit
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </BentoTile>
          </section>
        ))
      )}

      {/* Password confirmation modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmOpen(false)} />
          <div
            className="relative w-full max-w-sm space-y-4 rounded-2xl p-6"
            style={{
              background: "rgba(20,26,36,0.92)",
              backdropFilter: "blur(24px) saturate(180%)",
              border: "1px solid rgba(244,241,236,0.10)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
            }}
          >
            <h3 className="text-base font-semibold">Confirm admin password</h3>
            <p className="text-sm text-muted">
              Enter your password to save changes to <span className="font-mono text-foreground">{pendingEdit?.key.toUpperCase()}</span>.
            </p>
            <Input
              type="password"
              placeholder="Your admin password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmSave()}
              autoFocus
            />
            {confirmError && <p className="text-xs text-destructive">{confirmError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={confirmSave} disabled={saving || !confirmPassword}>
                {saving ? "Saving..." : "Save change"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
