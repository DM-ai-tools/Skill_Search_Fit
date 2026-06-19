import Link from "next/link";
import { Flame, Globe, Puzzle, Target, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Globe,
    title: "Website scanner",
    sub: "SEO score and quick fixes in under a minute",
    accent: "text-primary",
    bg: "border-primary/20 bg-primary/10",
  },
  {
    icon: Puzzle,
    title: "50+ workflows",
    sub: "Forms filled from your site scan",
    accent: "text-category-technical",
    bg: "border-category-technical/20 bg-category-technical/10",
  },
  {
    icon: Target,
    title: "Competitor lookup",
    sub: "Up to 10 competitors from your URL",
    accent: "text-secondary",
    bg: "border-secondary/20 bg-secondary/10",
  },
  {
    icon: FolderKanban,
    title: "Projects and reports",
    sub: "Save everything and come back later",
    accent: "text-category-content",
    bg: "border-category-content/20 bg-category-content/10",
  },
];

const stats = [
  { value: "<60s", label: "Typical scan", accent: "text-primary" },
  { value: "50+", label: "Workflows", accent: "text-secondary" },
  { value: "10", label: "Competitors", accent: "text-category-technical" },
];

export function AuthLeftPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-surface md:flex md:w-1/2 md:flex-col">
      {/* Background ambient layers */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-primary/8 blur-[100px]"
          style={{ animation: "lp-blob-float 22s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-secondary/6 blur-[100px]"
          style={{ animation: "lp-blob-float-alt 26s ease-in-out infinite 3s" }}
        />
        <div
          className="absolute top-1/2 left-1/4 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-primary/4 blur-[80px]"
          style={{ animation: "lp-glow-breathe 14s ease-in-out infinite 6s" }}
        />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "38px 38px",
          }}
        />
        {/* Right edge divider */}
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-border-strong/50 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative flex flex-1 flex-col justify-center px-10 py-14 lg:px-14">
        {/* Logo link */}
        <Link
          href="/"
          className="auth-enter mb-10 inline-flex w-fit items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/30">
            <Flame className="h-5 w-5 text-primary" />
          </div>
          <span className="text-[15px] font-semibold text-foreground">
            SkillSearchFit
          </span>
        </Link>

        {/* Headline block */}
        <div className="auth-enter auth-enter-d1 mb-7">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-[10px] font-mono font-semibold uppercase tracking-widest text-primary">
            <Flame className="h-3 w-3" />
            For SEO teams
          </div>
          <h2 className="text-2xl font-bold leading-snug text-foreground lg:text-[1.7rem]">
            SEO audits and reports{" "}
            <span className="text-primary">from one place</span>
          </h2>
          <p className="mt-3 marketing-body-sm text-muted">
            Scan a site, get competitors and filled-in forms, then run keyword
            research, audits, or content briefs — and save the reports by
            project.
          </p>
        </div>

        {/* Feature cards */}
        <div className="auth-enter auth-enter-d2 mb-7 space-y-2">
          {features.map(({ icon: Icon, title, sub, accent, bg }) => (
            <div
              key={title}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/25 px-4 py-3 backdrop-blur-sm transition-colors duration-200 hover:border-border/60 hover:bg-background/40"
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                  bg,
                )}
              >
                <Icon className={cn("h-4 w-4", accent)} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div className="auth-enter auth-enter-d3 grid grid-cols-3 gap-3">
          {stats.map(({ value, label, accent }) => (
            <div
              key={label}
              className="rounded-xl border border-border/40 bg-background/25 p-3 text-center backdrop-blur-sm"
            >
              <p className={cn("text-xl font-bold tabular-nums", accent)}>
                {value}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">{label}</p>
            </div>
          ))}
        </div>

        {/* Floating decorative card — bottom right corner visual */}
        <div className="auth-enter auth-enter-d4 mt-8 flex items-center gap-2.5 rounded-xl border border-border/35 bg-background/20 px-4 py-3 backdrop-blur-sm">
          <div className="flex h-2 w-2 shrink-0 rounded-full bg-success"
               style={{ animation: "lp-glow-breathe 2.5s ease-in-out infinite" }} />
          <p className="text-xs text-muted">
            <span className="font-medium text-foreground">Scans kept for 7 days</span>
            {" "}— run more workflows without scanning again
          </p>
        </div>
      </div>
    </div>
  );
}
