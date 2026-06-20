"use client";

import Link from "next/link";
import { LayoutDashboard, FolderKanban, Puzzle, User, ShieldCheck } from "lucide-react";
import { ShellSidebar } from "@/components/layout/shell-sidebar";
import { useAuthStore } from "@/stores/auth-store";

const nav = [
  { href: "/dashboard",  label: "Dashboard",     icon: LayoutDashboard },
  { href: "/plugins",    label: "Plugin Library", icon: Puzzle },
  { href: "/projects",   label: "Projects",       icon: FolderKanban },
  { href: "/profile",    label: "Profile",        icon: User },
];

export function AppSidebar() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex flex-col">
      <ShellSidebar
        items={nav}
        homeHref="/dashboard"
        footerLabel="SEO AI Workspace"
      />
      {user?.role === "admin" && (
        <div className="m-3 mt-0">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/20"
          >
            <ShieldCheck className="h-4 w-4" />
            Admin Portal
          </Link>
        </div>
      )}
    </div>
  );
}
