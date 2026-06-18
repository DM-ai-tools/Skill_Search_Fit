"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CatalogTile({
  href,
  onClick,
  title,
  description,
  icon,
  badge,
  meta,
  actionLabel,
  featured = false,
  className,
}: {
  href?: string;
  onClick?: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  actionLabel?: string;
  featured?: boolean;
  className?: string;
}) {
  const content = (
    <div
      className={cn(
        "bento-tile group flex h-full flex-col gap-4 border-border/30 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30",
        featured && "lg:flex-row lg:items-start lg:gap-5",
        className,
      )}
    >
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-foreground transition-colors group-hover:text-primary">
            {title}
          </h3>
          {typeof badge === "string" ? <Badge variant="outline">{badge}</Badge> : badge}
        </div>
        {description && <div className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{description}</div>}
        {meta && <div className="mt-4 text-xs text-muted">{meta}</div>}
        {actionLabel && (
          <span className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-xl border border-primary/25 bg-primary-soft text-sm font-medium text-primary transition-all group-hover:border-primary group-hover:bg-primary/20">
            {actionLabel}
          </span>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className="block h-full w-full text-left">
      {content}
    </button>
  );
}
