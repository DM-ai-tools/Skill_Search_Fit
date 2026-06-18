import * as React from "react";
import { cn } from "@/lib/utils";

type BentoColumns = 2 | 3 | 4;

export function BentoGrid({
  columns = 3,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { columns?: BentoColumns }) {
  return (
    <div
      className={cn(
        columns === 4 ? "bento-grid-4" : columns === 3 ? "bento-grid-3" : "bento-grid grid-cols-1 md:grid-cols-2",
        className,
      )}
      {...props}
    />
  );
}
