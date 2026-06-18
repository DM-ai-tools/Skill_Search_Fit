"use client";

import { LayoutDashboard, FolderKanban, Puzzle, User, FileCheck } from "lucide-react";
import { ShellSidebar } from "@/components/layout/shell-sidebar";

const nav = [
  { href: "/dashboard",       label: "Dashboard",     icon: LayoutDashboard },
  { href: "/plugins",         label: "Plugin Library", icon: Puzzle },
  { href: "/projects",        label: "Projects",       icon: FolderKanban },
  { href: "/reports/review",  label: "Report Review",  icon: FileCheck },
  { href: "/profile",         label: "Profile",        icon: User },
];

export function AppSidebar() {
  return (
    <ShellSidebar
      items={nav}
      homeHref="/dashboard"
      footerLabel="SEO AI Workspace"
    />
  );
}
