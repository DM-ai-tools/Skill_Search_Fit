"use client";

import { Activity, FileText, LayoutDashboard, Puzzle, ScrollText, Settings, Users } from "lucide-react";
import { AdminSidebarBadge, ShellSidebar } from "@/components/layout/shell-sidebar";

const nav = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/reports", label: "Reports", icon: FileText },
  { href: "/admin/plugins", label: "Plugins", icon: Puzzle },
  { href: "/admin/prompts", label: "Prompts", icon: ScrollText },
  { href: "/admin/config", label: "Configuration", icon: Settings },
  { href: "/admin/logs", label: "Audit Trail", icon: Activity },
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
