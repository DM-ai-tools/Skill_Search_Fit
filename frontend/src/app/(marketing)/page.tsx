import Link from "next/link";
import {
  Flame,
  Search,
  Layers,
  FolderKanban,
  ArrowRight,
  Zap,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Globe,
  FileText,
  CheckCircle2,
  Brain,
  Users,
  Briefcase,
  Building2,
  Target,
  ChevronRight,
  Database,
  Activity,
  Cpu,
  Puzzle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnimatedReveal } from "@/components/marketing/animated-reveal";

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      {/* ── Ambient background blobs ── */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]"
          style={{ animation: "lp-blob-float 20s ease-in-out infinite" }}
        />
        <div
          className="absolute top-1/3 -right-40 h-[500px] w-[500px] rounded-full bg-secondary/5 blur-[120px]"
          style={{ animation: "lp-blob-float-alt 24s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-0 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-primary/4 blur-[120px]"
          style={{ animation: "lp-blob-float 28s ease-in-out infinite 5s" }}
        />
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.018]"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="mx-auto max-w-6xl px-6">
        {/* ══════════════════════════════════════════════════════════════
            HERO
            ══════════════════════════════════════════════════════════════ */}
        <section className="py-16 md:py-24">
          <div className="bento-tile-strong relative overflow-hidden rounded-3xl">
            {/* Inner glow layers */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
              <div
                className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-primary/18 blur-3xl"
                style={{ animation: "lp-glow-breathe 8s ease-in-out infinite" }}
              />
              <div
                className="absolute -bottom-20 right-0 h-[380px] w-[380px] rounded-full bg-secondary/10 blur-3xl"
                style={{
                  animation: "lp-glow-breathe 11s ease-in-out infinite 2s",
                }}
              />
              {/* Shimmer pass */}
              <div className="absolute inset-0 overflow-hidden">
                <div
                  className="absolute top-0 h-full w-[180px] bg-gradient-to-r from-transparent via-white/[0.025] to-transparent"
                  style={{ animation: "lp-shimmer 9s ease-in-out infinite 4s" }}
                />
              </div>
            </div>

            <div className="relative px-8 py-14 md:px-14 md:py-20">
              <div className="grid items-center gap-12 lg:grid-cols-[1fr_420px] lg:gap-16">
                {/* Left: copy */}
                <div>
                  <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs font-mono font-semibold uppercase tracking-widest text-primary">
                    <Flame className="h-3.5 w-3.5" />
                    SEO AI Platform
                  </div>

                  <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-[3.4rem] lg:leading-[1.1]">
                    The AI workspace that{" "}
                    <span className="text-primary">outpaces your SEO team</span>
                  </h1>

                  <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
                    Scan any website in under 60 seconds. Auto-discover
                    competitors. Run 50+ structured AI workflows with every
                    input pre-filled from your site analysis.
                  </p>

                  <div className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {[
                      { icon: Zap, text: "Website analysis in <60s" },
                      { icon: Target, text: "Auto competitor discovery" },
                      { icon: Brain, text: "50+ AI plugin workflows" },
                      { icon: FolderKanban, text: "Project-based outputs" },
                    ].map(({ icon: Icon, text }) => (
                      <div
                        key={text}
                        className="flex items-center gap-2 text-sm text-muted"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                        {text}
                      </div>
                    ))}
                  </div>

                  <div className="mt-10 flex flex-wrap gap-3">
                    <Link href="/signup">
                      <Button size="lg" className="gap-2">
                        <Flame className="h-4 w-4" />
                        Get Started Free
                      </Button>
                    </Link>
                    <Link href="/features">
                      <Button size="lg" variant="outline" className="gap-2">
                        See all features
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Right: mock product preview */}
                <div
                  className="hidden lg:block"
                  style={{ animation: "lp-card-float 7s ease-in-out infinite" }}
                >
                  <div className="relative">
                    <div className="absolute -inset-4 rounded-3xl bg-primary/6 blur-2xl" />
                    <div className="relative space-y-3 rounded-2xl border border-border/60 bg-surface p-4">
                      {/* URL bar */}
                      <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                        <Globe className="h-3.5 w-3.5 text-muted/50" />
                        <span className="flex-1 font-mono text-xs text-muted">
                          acme-company.com.au
                        </span>
                        <div className="flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5">
                          <CheckCircle2 className="h-3 w-3 text-success" />
                          <span className="text-[10px] font-medium text-success">
                            Analyzed
                          </span>
                        </div>
                      </div>

                      {/* Score card */}
                      <div className="flex items-start justify-between gap-4 rounded-xl border border-border/50 bg-surface-elevated p-4">
                        <div>
                          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
                            SEO Score
                          </p>
                          <p className="mt-1 text-4xl font-bold tabular-nums text-primary">
                            72
                            <span className="text-base font-normal text-muted">
                              /100
                            </span>
                          </p>
                          <div className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-surface">
                            <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-primary to-warning" />
                          </div>
                          <p className="mt-1.5 text-xs font-medium text-warning">
                            Moderate — 8 quick wins
                          </p>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/12">
                          <TrendingUp className="h-5 w-5 text-primary" />
                        </div>
                      </div>

                      {/* Mini stats */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-border/50 bg-surface-elevated p-3">
                          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                            Competitors
                          </p>
                          <p className="mt-1 text-2xl font-bold text-foreground">
                            10
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted">
                            auto-discovered
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-surface-elevated p-3">
                          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                            Workflows
                          </p>
                          <p className="mt-1 text-2xl font-bold text-secondary">
                            50+
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted">
                            ready to run
                          </p>
                        </div>
                      </div>

                      {/* Status bar */}
                      <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-surface/60 px-3 py-2.5">
                        <div
                          className="h-2 w-2 shrink-0 rounded-full bg-success"
                          style={{
                            animation: "lp-glow-breathe 2s ease-in-out infinite",
                          }}
                        />
                        <p className="text-xs text-muted">
                          <span className="font-medium text-foreground">
                            All inputs pre-filled
                          </span>{" "}
                          — ready to run any workflow
                        </p>
                      </div>
                    </div>

                    {/* Floating badge */}
                    <div className="absolute -top-3 -right-3 flex items-center gap-1.5 rounded-xl border border-primary/25 bg-surface-elevated px-3 py-1.5 shadow-lg">
                      <Flame className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-semibold text-primary">
                        AI-Powered
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════
            STATS STRIP
            ══════════════════════════════════════════════════════════════ */}
        <AnimatedReveal className="pb-16">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              {
                value: "50+",
                label: "SEO Plugins",
                icon: Puzzle,
                accent: "text-primary",
                bg: "border-primary/20 bg-primary/10",
              },
              {
                value: "<60s",
                label: "Site Analysis",
                icon: Zap,
                accent: "text-secondary",
                bg: "border-secondary/20 bg-secondary/10",
              },
              {
                value: "10",
                label: "Auto Competitors",
                icon: Target,
                accent: "text-category-content",
                bg: "border-category-content/20 bg-category-content/10",
              },
              {
                value: "100%",
                label: "AI-Autofilled",
                icon: Brain,
                accent: "text-category-local-seo",
                bg: "border-category-local-seo/20 bg-category-local-seo/10",
              },
            ].map(({ value, label, icon: Icon, accent, bg }, i) => (
              <AnimatedReveal key={label} delay={i * 80}>
                <div className="bento-tile lp-card flex flex-col gap-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl border",
                      bg,
                    )}
                  >
                    <Icon className={cn("h-4 w-4", accent)} />
                  </div>
                  <p className={cn("text-3xl font-bold tabular-nums", accent)}>
                    {value}
                  </p>
                  <p className="text-sm text-muted">{label}</p>
                </div>
              </AnimatedReveal>
            ))}
          </div>
        </AnimatedReveal>

        {/* ══════════════════════════════════════════════════════════════
            CORE CAPABILITIES
            ══════════════════════════════════════════════════════════════ */}
        <AnimatedReveal className="pb-20">
          <div className="mb-8">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-primary/70">
              Platform capabilities
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              Everything in one workspace
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Hero cell: AI Scanner */}
            <AnimatedReveal delay={0} className="md:col-span-2 md:row-span-2">
              <div className="bento-tile lp-card group flex h-full flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center justify-center rounded-2xl border border-primary/25 bg-primary/12 p-4 transition-transform duration-300 group-hover:scale-110">
                    <Globe className="h-8 w-8 text-primary" />
                  </div>
                  <span className="select-none font-mono text-5xl font-bold text-border-strong/20">
                    01
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-foreground">
                    AI Website Scanner
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-muted">
                    Deep-crawl any site and get a full business intelligence
                    profile in under 60 seconds. Instant SEO scoring across 5
                    dimensions: on-page, technical, content & UX, reputation,
                    and competitive signals.
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {[
                      "SEO readiness score",
                      "Quick wins list",
                      "Competitor signals",
                      "On-page issues",
                      "Priority actions",
                      "Technical health",
                    ].map((item) => (
                      <div
                        key={item}
                        className="flex items-center gap-2 text-sm text-muted"
                      >
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Inline score preview */}
                <div className="mt-auto rounded-xl border border-border/40 bg-background/40 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                      SEO dimensions scored on first scan
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    {[
                      { label: "On-page", val: 72, color: "bg-primary" },
                      { label: "Technical", val: 85, color: "bg-secondary" },
                      {
                        label: "Content & UX",
                        val: 58,
                        color: "bg-category-content",
                      },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="flex items-center gap-3">
                        <p className="w-24 text-xs text-muted">{label}</p>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                          <div
                            className={cn("h-full rounded-full", color)}
                            style={{ width: `${val}%` }}
                          />
                        </div>
                        <p className="w-8 text-right font-mono text-xs text-muted">
                          {val}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </AnimatedReveal>

            {/* Plugin Library */}
            <AnimatedReveal delay={100}>
              <div className="bento-tile lp-card group flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center justify-center rounded-2xl border border-category-technical/25 bg-category-technical/12 p-3 transition-transform duration-300 group-hover:scale-110">
                    <Puzzle className="h-6 w-6 text-category-technical" />
                  </div>
                  <span className="select-none font-mono text-3xl font-bold text-border-strong/20">
                    02
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Plugin Library
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    50+ structured AI workflows organized by category. Every
                    plugin launches with inputs auto-filled from your site
                    analysis — no manual setup.
                  </p>
                </div>
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {[
                    "Keyword Research",
                    "Technical Audit",
                    "Content Brief",
                    "Competitor Gap",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-lg border border-border/50 bg-surface/60 px-2.5 py-1 text-xs text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </AnimatedReveal>

            {/* Competitor Discovery */}
            <AnimatedReveal delay={180}>
              <div className="bento-tile lp-card lp-card-teal group flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center justify-center rounded-2xl border border-secondary/25 bg-secondary/12 p-3 transition-transform duration-300 group-hover:scale-110">
                    <Target className="h-6 w-6 text-secondary" />
                  </div>
                  <span className="select-none font-mono text-3xl font-bold text-border-strong/20">
                    03
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Competitor Discovery
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Automatically finds your top 10 competitors from your site
                    URL alone — powered by live web intelligence, no manual
                    research needed.
                  </p>
                </div>
                <div className="mt-auto flex items-center gap-2 rounded-lg border border-secondary/20 bg-secondary/8 px-3 py-2">
                  <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                  <p className="text-xs font-medium text-secondary">
                    Powered by Perplexity live search
                  </p>
                </div>
              </div>
            </AnimatedReveal>

            {/* Workspace */}
            <AnimatedReveal delay={60}>
              <div className="bento-tile lp-card group flex flex-col gap-4">
                <div className="flex items-center justify-center rounded-2xl border border-category-research/25 bg-category-research/12 p-3 transition-transform duration-300 group-hover:scale-110 w-fit">
                  <Layers className="h-6 w-6 text-category-research" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    3-Panel Workspace
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Form → AI → Output. A focused environment built for deep,
                    structured analysis — not open-ended chat.
                  </p>
                </div>
              </div>
            </AnimatedReveal>

            {/* Projects */}
            <AnimatedReveal delay={140}>
              <div className="bento-tile lp-card group flex flex-col gap-4">
                <div className="flex items-center justify-center rounded-2xl border border-category-content/25 bg-category-content/12 p-3 transition-transform duration-300 group-hover:scale-110 w-fit">
                  <FolderKanban className="h-6 w-6 text-category-content" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Projects & Outputs
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Save every AI output. Organize by client or campaign.
                    Resume sessions and revisit reports anytime.
                  </p>
                </div>
              </div>
            </AnimatedReveal>

            {/* Pipelines — full width */}
            <AnimatedReveal delay={200} className="md:col-span-3">
              <div className="bento-tile lp-card group flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
                <div className="flex items-center gap-4">
                  <div className="flex shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/12 p-3 transition-transform duration-300 group-hover:scale-110">
                    <Zap className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Multi-Step Pipelines
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      Chain plugins into automated workflows. Competitor gap →
                      Content brief → Keyword cluster — in one run.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 md:ml-auto">
                  {["Audit", "→", "Brief", "→", "Publish"].map((item, i) => (
                    <span
                      key={i}
                      className={cn(
                        "font-mono text-xs",
                        item === "→"
                          ? "text-muted/50"
                          : "rounded-lg border border-border/50 bg-surface/80 px-2.5 py-1 text-muted",
                      )}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </AnimatedReveal>
          </div>
        </AnimatedReveal>

        {/* ══════════════════════════════════════════════════════════════
            HOW IT WORKS
            ══════════════════════════════════════════════════════════════ */}
        <AnimatedReveal className="pb-20">
          <div className="mb-10 text-center">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-primary/70">
              How it works
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              From URL to insight in four steps
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[
              {
                icon: Globe,
                title: "Enter your URL",
                desc: "Paste any domain. The AI scanner starts crawling and building your business profile immediately.",
                accent: "text-primary",
                ring: "border-primary/25 bg-primary/10",
              },
              {
                icon: Brain,
                title: "AI profiles the site",
                desc: "Deep crawl + Perplexity live intelligence builds your SEO score, competitor map, and analysis in <60s.",
                accent: "text-secondary",
                ring: "border-secondary/25 bg-secondary/10",
              },
              {
                icon: Puzzle,
                title: "Run a workflow",
                desc: "Choose any plugin. Every input field is pre-filled from your analysis — just review and run.",
                accent: "text-category-technical",
                ring: "border-category-technical/25 bg-category-technical/10",
              },
              {
                icon: FolderKanban,
                title: "Save to projects",
                desc: "Every output persists. Build a growing knowledge base per client or campaign over time.",
                accent: "text-category-content",
                ring: "border-category-content/25 bg-category-content/10",
              },
            ].map(({ icon: Icon, title, desc, accent, ring }, i) => (
              <AnimatedReveal key={title} delay={i * 100}>
                <div className="bento-tile lp-card flex flex-col items-center gap-4 text-center">
                  <div
                    className={cn(
                      "relative flex h-14 w-14 items-center justify-center rounded-2xl border",
                      ring,
                    )}
                  >
                    <Icon className={cn("h-6 w-6", accent)} />
                    <span
                      className={cn(
                        "absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-surface-elevated font-mono text-[9px] font-bold",
                        accent,
                      )}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {desc}
                    </p>
                  </div>
                </div>
              </AnimatedReveal>
            ))}
          </div>
        </AnimatedReveal>

        {/* ══════════════════════════════════════════════════════════════
            KEY FEATURES
            ══════════════════════════════════════════════════════════════ */}
        <AnimatedReveal className="pb-20">
          <div className="mb-8">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-primary/70">
              Built for professionals
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              Every detail thought through
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {[
              {
                icon: BarChart3,
                title: "5-Dimension SEO Score",
                desc: "Instant scoring across on-page, technical, content & UX, reputation, and competitive signals — mathematically calculated, not guessed.",
                accent: "text-primary",
                ring: "border-primary/25 bg-primary/12",
              },
              {
                icon: Cpu,
                title: "AI-Autofilled Inputs",
                desc: "Every form field in every plugin is pre-populated from your site analysis. Review, adjust if needed, and run — that's it.",
                accent: "text-secondary",
                ring: "border-secondary/25 bg-secondary/12",
              },
              {
                icon: Activity,
                title: "Live Perplexity Intelligence",
                desc: "Real-time web intelligence via Perplexity Sonar Pro. Business overview, reputation signals, and industry context from live sources.",
                accent: "text-category-technical",
                ring: "border-category-technical/25 bg-category-technical/12",
              },
              {
                icon: FileText,
                title: "Structured Report Export",
                desc: "Every plugin output is clean, structured markdown. Download, share with clients, or feed into your agency deliverables.",
                accent: "text-category-content",
                ring: "border-category-content/25 bg-category-content/12",
              },
              {
                icon: Database,
                title: "7-Day Analysis Cache",
                desc: "Site analysis is cached for 7 days. Re-run any plugin without rescanning — unless you need fresh data.",
                accent: "text-category-reporting",
                ring: "border-border-strong/30 bg-surface-elevated",
              },
              {
                icon: ShieldCheck,
                title: "Admin Control Panel",
                desc: "Full user management, plugin toggling, prompt control, and execution logs. Built for agencies managing multiple clients.",
                accent: "text-category-local-seo",
                ring: "border-category-local-seo/25 bg-category-local-seo/12",
              },
            ].map(({ icon: Icon, title, desc, accent, ring }, i) => (
              <AnimatedReveal key={title} delay={i * 80}>
                <div className="bento-tile lp-card group flex h-full flex-col gap-4">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl border transition-transform duration-300 group-hover:scale-110",
                      ring,
                    )}
                  >
                    <Icon className={cn("h-5 w-5", accent)} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {desc}
                    </p>
                  </div>
                </div>
              </AnimatedReveal>
            ))}
          </div>
        </AnimatedReveal>

        {/* ══════════════════════════════════════════════════════════════
            WHO IT'S FOR
            ══════════════════════════════════════════════════════════════ */}
        <AnimatedReveal className="pb-20">
          <div className="mb-8 text-center">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-primary/70">
              Who it's for
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              Built for every kind of SEO professional
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                icon: Building2,
                title: "SEO Agencies",
                badge: "Scale delivery",
                badgeStyle: "text-primary bg-primary/10 border-primary/20",
                desc: "Deliver deeper insights to more clients in less time. Standardize your process and reduce the work per client by 60%.",
                benefits: [
                  "Multi-client project management",
                  "Consistent, auditable workflows",
                  "White-label ready outputs",
                ],
                accent: "text-primary",
                ring: "border-primary/25 bg-primary/12",
                hover:
                  "hover:border-primary/30 hover:shadow-[0_16px_40px_rgba(224,138,60,0.1)]",
              },
              {
                icon: Users,
                title: "In-House SEO Teams",
                badge: "Stay aligned",
                badgeStyle: "text-secondary bg-secondary/10 border-secondary/20",
                desc: "Keep your team on the same page with structured workflows, saved outputs, and a shared foundation for every campaign.",
                benefits: [
                  "Shared project workspace",
                  "Repeatable analysis framework",
                  "Cross-team output visibility",
                ],
                accent: "text-secondary",
                ring: "border-secondary/25 bg-secondary/12",
                hover:
                  "hover:border-secondary/30 hover:shadow-[0_16px_40px_rgba(79,168,159,0.1)]",
              },
              {
                icon: Briefcase,
                title: "Freelance SEOs",
                badge: "Scale yourself",
                badgeStyle:
                  "text-category-technical bg-category-technical/10 border-category-technical/20",
                desc: "Compete with agencies. The AI handles the grunt work — you focus on strategy, client relationships, and winning more work.",
                benefits: [
                  "Agency-quality outputs solo",
                  "AI autofill saves hours",
                  "Instant competitor intelligence",
                ],
                accent: "text-category-technical",
                ring: "border-category-technical/25 bg-category-technical/12",
                hover:
                  "hover:border-category-technical/30 hover:shadow-[0_16px_40px_rgba(79,168,159,0.08)]",
              },
            ].map(({ icon: Icon, title, badge, badgeStyle, desc, benefits, accent, ring, hover }, i) => (
              <AnimatedReveal key={title} delay={i * 120}>
                <div
                  className={cn(
                    "bento-tile flex h-full flex-col gap-5",
                    "transition-all duration-300 hover:-translate-y-1",
                    hover,
                  )}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div
                      className={cn(
                        "flex items-center justify-center rounded-2xl border p-3",
                        ring,
                      )}
                    >
                      <Icon className={cn("h-6 w-6", accent)} />
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        badgeStyle,
                      )}
                    >
                      {badge}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {desc}
                    </p>
                  </div>
                  <ul className="mt-auto space-y-2">
                    {benefits.map((b) => (
                      <li
                        key={b}
                        className="flex items-center gap-2 text-sm text-muted"
                      >
                        <CheckCircle2
                          className={cn("h-4 w-4 shrink-0", accent)}
                        />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </AnimatedReveal>
            ))}
          </div>
        </AnimatedReveal>

        {/* ══════════════════════════════════════════════════════════════
            BOTTOM CTA
            ══════════════════════════════════════════════════════════════ */}
        <AnimatedReveal className="pb-24">
          <div className="bento-tile-strong relative overflow-hidden rounded-3xl">
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
              <div
                className="absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/22 blur-3xl"
                style={{ animation: "lp-glow-breathe 7s ease-in-out infinite" }}
              />
              <div className="absolute right-0 bottom-0 h-60 w-60 rounded-full bg-secondary/10 blur-3xl" />
            </div>

            <div className="relative px-8 py-16 text-center md:px-14">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs font-mono font-semibold uppercase tracking-widest text-primary">
                <Flame className="h-3.5 w-3.5" />
                Get started today
              </div>

              <h2 className="text-3xl font-bold text-foreground md:text-4xl">
                Start analyzing in{" "}
                <span className="text-primary">under 60 seconds</span>
              </h2>

              <p className="mx-auto mt-4 max-w-lg leading-relaxed text-muted">
                No setup. No manual data entry. Enter your URL and the AI
                builds your complete SEO foundation — then run any workflow
                from the library with every input already filled.
              </p>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Link href="/signup">
                  <Button size="lg" className="gap-2 px-8">
                    <Flame className="h-4 w-4" />
                    Get Started Free
                  </Button>
                </Link>
                <Link href="/features">
                  <Button size="lg" variant="outline" className="gap-2">
                    Explore features
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-muted">
                {[
                  "No credit card required",
                  "AI-autofilled from first scan",
                  "50+ workflows ready instantly",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AnimatedReveal>
      </div>
    </div>
  );
}
