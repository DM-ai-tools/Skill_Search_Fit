import * as React from "react";
import { cn } from "@/lib/utils";

type BentoTileVariant = "default" | "strong" | "spotlight";
type BentoTileSpan = "default" | "hero" | "wide" | "strip";

export function BentoTile({
  variant = "default",
  span = "default",
  interactive = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: BentoTileVariant;
  span?: BentoTileSpan;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        variant === "spotlight" ? "bento-spotlight" : variant === "strong" ? "bento-tile-strong" : "bento-tile",
        span === "hero" && "bento-hero",
        span === "wide" && "bento-wide",
        span === "strip" && "bento-strip",
        interactive && "cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}
