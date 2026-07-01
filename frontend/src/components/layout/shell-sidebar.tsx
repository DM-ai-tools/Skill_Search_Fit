"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Flame, Menu, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavBody = (
    <>
      <div className="border-b border-border/40 px-5 py-5">
        <Link href={homeHref} className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
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
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
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
    </>
  );

  return (
    <>
      <div className="m-3 mb-0 md:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4" />
          Menu
        </Button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside className="glass-panel-strong absolute left-3 right-3 top-3 bottom-3 flex flex-col overflow-hidden rounded-2xl">
            <div className="flex items-center justify-end border-b border-border/40 px-3 py-2">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {NavBody}
          </aside>
        </div>
      )}

      <aside className="glass-panel-strong m-3 hidden w-60 shrink-0 flex-col rounded-2xl md:flex">
        {NavBody}
      </aside>
    </>
  );
}

export function AdminSidebarBadge() {
  return <Badge variant="secondary">Admin</Badge>;
}
