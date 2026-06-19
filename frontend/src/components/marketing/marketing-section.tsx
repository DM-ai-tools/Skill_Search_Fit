import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type MarketingSectionProps = {
  children: ReactNode;
  className?: string;
  id?: string;
};

/** Consistent vertical padding for marketing pages. */
export function MarketingSection({ children, className, id }: MarketingSectionProps) {
  return (
    <section id={id} className={cn("marketing-section", className)}>
      {children}
    </section>
  );
}

type MarketingSectionIntroProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  titleAs?: "h1" | "h2";
  className?: string;
};

export function MarketingSectionIntro({
  eyebrow,
  title,
  description,
  align = "left",
  titleAs = "h2",
  className,
}: MarketingSectionIntroProps) {
  const TitleTag = titleAs;
  return (
    <div
      className={cn(
        "marketing-intro",
        align === "center" && "marketing-intro--center text-center",
        className,
      )}
    >
      {eyebrow ? <p className="marketing-eyebrow">{eyebrow}</p> : null}
      <TitleTag
        className={cn(
          "marketing-section-title",
          titleAs === "h1" && "marketing-page-title",
        )}
      >
        {title}
      </TitleTag>
      {description ? (
        <p className={cn("marketing-body text-muted", align === "center" && "mx-auto")}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** Page-width container shared across marketing routes. */
export function MarketingShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("marketing-shell", className)}>{children}</div>;
}
