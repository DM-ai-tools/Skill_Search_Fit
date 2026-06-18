"use client";

import { Activity, LayoutDashboard, Puzzle, ScrollText, Users } from "lucide-react";
import { AdminSidebarBadge, ShellSidebar } from "@/components/layout/shell-sidebar";

const nav = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/plugins", label: "Plugins", icon: Puzzle },
  { href: "/admin/prompts", label: "Prompts", icon: ScrollText },
  { href: "/admin/logs", label: "Activity Logs", icon: Activity },
];

export function AdminSidebar() {
  return (
    <ShellSidebar
      items={nav}
      homeHref="/admin/dashboard"
      badge={<AdminSidebarBadge />}
      footerLabel="Admin Portal"
    />
  );
}
