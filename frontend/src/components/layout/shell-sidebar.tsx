"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ShellNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export function ShellSidebar({
  items,
  homeHref,
  badge,
  footerLabel,
}: {
  items: ShellNavItem[];
  homeHref: string;
  badge?: ReactNode;
  footerLabel?: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="glass-panel-strong m-3 flex w-60 shrink-0 flex-col rounded-2xl">
      <div className="border-b border-border/40 px-5 py-5">
        <Link href={homeHref} className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/30">
            <Flame className="h-4 w-4 text-primary" />
          </div>
          <span className="text-[15px] font-semibold text-foreground">SkillSearchFit</span>
          {badge || null}
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_rgba(224,138,60,0.20)]"
                  : "text-muted hover:bg-surface/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted")} />
              {label}
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>

      {footerLabel && (
        <div className="border-t border-border/30 px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted/60">{footerLabel}</p>
        </div>
      )}
    </aside>
  );
}

export function AdminSidebarBadge() {
  return <Badge variant="secondary">Admin</Badge>;
}
