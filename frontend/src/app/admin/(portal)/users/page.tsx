"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { AdminUserRow } from "@/lib/types";
import { BentoSectionHeader, BentoTile } from "@/components/bento";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type EditForm = { name: string; email: string; role: string; password: string };

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState("");
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "user" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", email: "", role: "", password: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [impersonateId, setImpersonateId] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState(false);

  const load = async () => {
    const data = await api.get<AdminUserRow[]>("/admin/users");
    setUsers(data);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q);
  });

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      await api.post("/admin/users", createForm);
      setCreateForm({ name: "", email: "", password: "", role: "user" });
      await load();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const deactivate = async (id: string) => {
    await api.delete(`/admin/users/${id}`);
    setDeactivateId(null);
    await load();
  };

  const startEdit = (u: AdminUserRow) => {
    setEditingId(u.id);
    setEditForm({ name: u.name, email: u.email, role: u.role, password: "" });
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setEditSaving(true);
    setEditError("");
    try {
      const payload: Record<string, string> = { name: editForm.name, email: editForm.email, role: editForm.role };
      if (editForm.password) payload.password = editForm.password;
      await api.patch(`/admin/users/${editingId}`, payload);
      setEditingId(null);
      await load();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setEditSaving(false);
    }
  };

  const handleImpersonate = async (id: string) => {
    setImpersonating(true);
    try {
      await api.post(`/admin/users/${id}/impersonate`);
      router.push("/dashboard");
    } catch {
      setImpersonating(false);
    }
  };

  return (
    <div className="space-y-6">
      <BentoSectionHeader
        eyebrow="Admin"
        title="User management"
        description="Create, edit, and manage access to the SEO workspace."
      />

      {/* Create user */}
      <BentoTile variant="strong" className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Create user</p>
        <form onSubmit={createUser} className="grid gap-2 md:grid-cols-5">
          <Input placeholder="Name" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required />
          <Input placeholder="Email" type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
          <Input placeholder="Password" type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
          <Select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </Select>
          <Button type="submit" disabled={creating}>{creating ? "Creating..." : "Create user"}</Button>
        </form>
        {createError && <p className="text-xs text-destructive">{createError}</p>}
      </BentoTile>

      {/* Search */}
      <Input
        placeholder="Search by name, email or role..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* User table */}
      <div className="overflow-hidden rounded-2xl border border-border/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-surface/60">
              {["Name", "Email", "Role", "Status", "Created", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">No users found.</td></tr>
            )}
            {filtered.map((u) => (
              <>
                <tr
                  key={u.id}
                  className={cn(
                    "transition-colors hover:bg-surface/40",
                    editingId === u.id && "bg-surface/60",
                  )}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                  <td className="px-4 py-3 text-muted">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {u.deleted_at
                      ? <Badge variant="danger">Deactivated</Badge>
                      : <Badge variant="outline">Active</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => startEdit(u)}>Edit</Button>
                      {!u.deleted_at && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setImpersonateId(u.id)}
                            disabled={impersonating}
                          >
                            Impersonate
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeactivateId(u.id)}
                          >
                            Deactivate
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Inline edit row */}
                {editingId === u.id && (
                  <tr key={`${u.id}-edit`} className="bg-surface/80">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <Input
                          placeholder="Name"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="max-w-[160px]"
                        />
                        <Input
                          placeholder="Email"
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="max-w-[200px]"
                        />
                        <Select
                          value={editForm.role}
                          onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </Select>
                        <Input
                          placeholder="New password (optional)"
                          type="password"
                          value={editForm.password}
                          onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                          className="max-w-[180px]"
                        />
                        <Button size="sm" onClick={saveEdit} disabled={editSaving}>
                          {editSaving ? "Saving..." : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                        {editError && <p className="text-xs text-destructive">{editError}</p>}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Deactivate confirm */}
      <ConfirmDialog
        open={Boolean(deactivateId)}
        title="Deactivate this user?"
        description="This user will lose access to the workspace. Their data is preserved."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => deactivateId && deactivate(deactivateId)}
        onCancel={() => setDeactivateId(null)}
      />

      {/* Impersonate confirm */}
      <ConfirmDialog
        open={Boolean(impersonateId)}
        title="Impersonate this user?"
        description="You will be logged in as this user. An exit banner will be shown. All activity will be attributed to the user, not you."
        confirmLabel="Impersonate"
        onConfirm={() => impersonateId && handleImpersonate(impersonateId)}
        onCancel={() => setImpersonateId(null)}
      />
    </div>
  );
}
