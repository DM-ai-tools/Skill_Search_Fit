"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { BentoGrid, BentoSectionHeader, BentoTile } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProfilePage() {
  const { user, fetchUser } = useAuthStore();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.patch("/users/me", { name, email });
      await fetchUser();
      setMessage("Profile updated");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await api.patch("/users/me/password", { current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Password change failed");
    }
  };

  return (
    <div className="space-y-6">
      <BentoSectionHeader
        eyebrow="Account"
        title="Profile"
        description="Manage account identity and sign-in security."
      />
      {message && (
        <p className="rounded-xl border border-success/25 bg-success-soft/20 px-4 py-2.5 text-sm text-success">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-destructive/25 bg-destructive-soft/20 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <BentoGrid columns={2}>
        <BentoTile variant="strong" className="space-y-4">
          <div>
            <p className="font-semibold text-foreground">Account</p>
            <p className="mt-1 text-sm text-muted">Update the name and email shown across the workspace.</p>
          </div>
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
            </div>
            <Button type="submit">Save profile</Button>
          </form>
        </BentoTile>

        <BentoTile className="space-y-4">
          <div>
            <p className="font-semibold text-foreground">Security</p>
            <p className="mt-1 text-sm text-muted">Change your password without affecting saved workspace data.</p>
          </div>
          <form onSubmit={savePassword} className="space-y-4">
            <div>
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} className="mt-1.5" />
            </div>
            <Button type="submit">Update password</Button>
          </form>
        </BentoTile>
      </BentoGrid>
    </div>
  );
}
