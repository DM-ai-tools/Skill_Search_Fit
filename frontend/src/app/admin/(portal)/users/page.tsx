"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { BentoGrid, BentoSectionHeader, BentoTile } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<(User & { deleted_at?: string | null })[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" });
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  useEffect(() => {
    api.get<typeof users>("/admin/users").then(setUsers);
  }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post("/admin/users", form);
    setForm({ name: "", email: "", password: "", role: "user" });
    const refreshed = await api.get<typeof users>("/admin/users");
    setUsers(refreshed);
  };

  const deactivate = async (id: string) => {
    await api.delete(`/admin/users/${id}`);
    setDeactivateId(null);
    setUsers(await api.get<typeof users>("/admin/users"));
  };

  return (
    <div className="space-y-6">
      <BentoSectionHeader
        eyebrow="Admin"
        title="User management"
        description="Create accounts and manage access to the SEO workspace."
      />

      <form onSubmit={createUser} className="grid gap-2 bento-tile-strong md:grid-cols-5">
        <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <Input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </Select>
        <Button type="submit">Create user</Button>
      </form>

      <BentoGrid columns={2}>
        {users.map((u) => (
          <BentoTile key={u.id} className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">
                  {u.name} <span className="text-xs text-muted">({u.role})</span>
                </p>
                <p className="text-sm text-muted">{u.email}</p>
              </div>
              {!u.deleted_at && (
                <Button variant="destructive" size="sm" onClick={() => setDeactivateId(u.id)}>
                  Deactivate
                </Button>
              )}
              {u.deleted_at && <span className="text-xs text-muted">Deactivated</span>}
          </BentoTile>
        ))}
      </BentoGrid>
      <ConfirmDialog
        open={Boolean(deactivateId)}
        title="Deactivate this user?"
        description="This user will lose access to the workspace."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => deactivateId && deactivate(deactivateId)}
        onCancel={() => setDeactivateId(null)}
      />
    </div>
  );
}
