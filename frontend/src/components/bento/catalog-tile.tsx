"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
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
        "bento-tile group flex h-full flex-col overflow-hidden border-border/30 p-0",
        featured && "lg:flex-row lg:items-stretch",
        className,
      )}
    >
      <div
        className={cn(
          "relative z-[1] flex flex-1 flex-col gap-3 p-4",
          featured && "lg:flex-row lg:items-start lg:gap-5",
        )}
      >
        <div className={cn("flex items-start justify-between gap-2", featured && "lg:shrink-0")}>
          {icon && <div className="shrink-0">{icon}</div>}
          {badge && (
            <div className={cn(!icon && "ml-auto")}>
              {typeof badge === "string" ? <Badge variant="outline">{badge}</Badge> : badge}
            </div>
          )}
        </div>

        <div className={cn("min-w-0 flex-1", featured && "lg:min-w-0")}>
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary">
            {title}
          </h3>
          {description && (
            <div className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted">
              {description}
            </div>
          )}
          {meta && <div className="mt-3 text-xs text-muted">{meta}</div>}
        </div>

        {actionLabel && (
          <span
            className={cn(
              "mt-auto inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-all duration-200",
              "border-border/50 bg-surface/30 text-foreground/85",
              "group-hover:border-primary/35 group-hover:bg-primary/10 group-hover:text-primary",
            )}
          >
            <span>{actionLabel.replace(/\s*→\s*$/, "")}</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
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
