import Link from "next/link";
import {
  Layers,
  FolderKanban,
  ArrowRight,
  Zap,
  ShieldCheck,
  BarChart3,
  Globe,
  FileText,
  CheckCircle2,
  Brain,
  Target,
  ChevronRight,
  Database,
  Activity,
  Cpu,
  Puzzle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CANONICAL_PLUGINS } from "@/lib/plugin-catalog";
import {
  MarketingSection,
  MarketingSectionIntro,
  MarketingShell,
} from "@/components/marketing/marketing-section";

const WORKFLOW_COUNT = CANONICAL_PLUGINS.length;

const HERO_POINTS = [
  "Site scan in under a minute",
  "Competitors found for you",
  `${WORKFLOW_COUNT} ready-made workflows`,
  "Save work by project",
] as const;

const STATS = [
  {
    value: String(WORKFLOW_COUNT),
    label: "Workflows in the library",
    detail: "Keyword research, technical audits, content briefs, competitor analysis, and more.",
  },
  {
    value: "<60s",
    label: "Typical site scan",
    detail: "SEO score, competitor list, and form prefills from one URL.",
  },
  {
    value: "3",
    label: "Built-in pipelines",
    detail: "Chain audit, content, and visibility steps without switching tools.",
  },
] as const;

export default function HomePage() {
  return (
    <MarketingShell>
      <MarketingSection className="marketing-section--tight">
        <p className="marketing-eyebrow">For SEO teams</p>
        <h1 className="mt-2 max-w-2xl text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          Run SEO audits and reports{" "}
          <span className="text-primary">from one place</span>
        </h1>
        <p className="mt-6 max-w-2xl marketing-lead text-muted">
          Paste a website URL. We scan the site, find competitors, and fill in the
          form fields for you. Pick a workflow — keyword research, content briefs,
          technical checks — and get a report you can save or send to a client.
        </p>

        <ul className="mt-8 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
          {HERO_POINTS.map((text) => (
            <li key={text} className="flex items-center gap-2 text-sm text-muted">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              {text}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/signup">
            <Button size="lg" className="gap-2">
              Get started free
            </Button>
          </Link>
          <Link href="/features">
            <Button size="lg" variant="outline" className="gap-2">
              See how it works
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </MarketingSection>

      <MarketingSection>
        <div className="grid gap-4 md:grid-cols-3">
          {STATS.map(({ value, label, detail }) => (
            <div
              key={label}
              className="rounded-2xl border border-border/50 bg-surface/60 px-5 py-4"
            >
              <p className="text-3xl font-bold tabular-nums text-primary">{value}</p>
              <p className="mt-1 font-semibold text-foreground">{label}</p>
              <p className="mt-2 marketing-body-sm text-muted">{detail}</p>
            </div>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection>
        <MarketingSectionIntro
          eyebrow="What you get"
          title="The main parts of the product"
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="bento-tile md:col-span-2 md:row-span-2 flex flex-col gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/12">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">Website scanner</h3>
              <p className="mt-2 marketing-body text-muted">
                We crawl your site and put together a short picture of how it&apos;s
                doing: an SEO score, a list of quick fixes, competitor notes, on-page
                issues, and technical health. Most scans finish in under a minute.
              </p>
            </div>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                "SEO readiness score",
                "Quick wins list",
                "Competitor signals",
                "On-page issues",
                "Priority actions",
                "Technical health",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-muted">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="bento-tile flex flex-col gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-category-technical/25 bg-category-technical/12">
              <Puzzle className="h-5 w-5 text-category-technical" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Workflow library</h3>
              <p className="mt-2 marketing-body-sm text-muted">
                {WORKFLOW_COUNT} workflows for keyword research, technical audits,
                content briefs, competitor gaps, and more. Fields are filled from
                your site scan — check them and run.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Keyword Research", "Technical Audit", "Content Brief", "Competitor Gap"].map(
                (tag) => (
                  <span
                    key={tag}
                    className="rounded-lg border border-border/50 bg-surface/60 px-2.5 py-1 text-xs text-muted"
                  >
                    {tag}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="bento-tile flex flex-col gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-secondary/25 bg-secondary/12">
              <Target className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Competitor lookup</h3>
              <p className="mt-2 marketing-body-sm text-muted">
                Give us your URL and we find up to 10 competitors using live web
                search. You don&apos;t need to build that list yourself.
              </p>
            </div>
          </div>

          <div className="bento-tile flex flex-col gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-category-research/25 bg-category-research/12">
              <Layers className="h-5 w-5 text-category-research" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Three-panel workspace</h3>
              <p className="mt-2 marketing-body-sm text-muted">
                Inputs on the left, the run in the middle, output on the right. Clear
                steps instead of an open-ended chat.
              </p>
            </div>
          </div>

          <div className="bento-tile flex flex-col gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-category-content/25 bg-category-content/12">
              <FolderKanban className="h-5 w-5 text-category-content" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Projects and saved reports</h3>
              <p className="mt-2 marketing-body-sm text-muted">
                Every run saves to a project. Organize by client or campaign and come
                back to old reports whenever you need them.
              </p>
            </div>
          </div>

          <div className="bento-tile md:col-span-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/12">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Multi-step pipelines</h3>
                <p className="mt-1 marketing-body-sm text-muted">
                  Run workflows back to back — audit, then brief, then keywords — in
                  one go.
                </p>
              </div>
            </div>
            <p className="text-sm text-muted md:text-right">
              Audit → Brief → Publish
            </p>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection>
        <MarketingSectionIntro
          eyebrow="How it works"
          title="How it works, in four steps"
          align="center"
          className="max-w-none"
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[
            {
              step: 1,
              icon: Globe,
              title: "Paste your URL",
              desc: "Drop in any domain. We start scanning and building a profile right away.",
            },
            {
              step: 2,
              icon: Brain,
              title: "We scan the site",
              desc: "You get an SEO score, competitor list, and notes on what to fix. Usually under a minute.",
            },
            {
              step: 3,
              icon: Puzzle,
              title: "Pick a workflow",
              desc: "Choose what you need — audit, brief, keywords, whatever. The form is mostly filled already.",
            },
            {
              step: 4,
              icon: FolderKanban,
              title: "Save the report",
              desc: "Output goes into a project. Pull it up again later or hand it to a client.",
            },
          ].map(({ step, icon: Icon, title, desc }) => (
            <div key={title} className="bento-tile flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-surface-elevated text-xs font-semibold text-muted">
                  {step}
                </span>
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="mt-2 marketing-body-sm text-muted">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection>
        <MarketingSectionIntro
          eyebrow="Useful details"
          title="Things people ask about"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {[
            {
              icon: BarChart3,
              title: "SEO score breakdown",
              desc: "One number plus scores for on-page, technical, content, reputation, and competitors — calculated from the scan, not guessed.",
            },
            {
              icon: Cpu,
              title: "Forms filled for you",
              desc: "Workflow fields pull from your site scan. Skim them, tweak if you want, and hit run.",
            },
            {
              icon: Activity,
              title: "Live web search",
              desc: "For competitor and business context we use Perplexity Sonar Pro — current web results, not stale training data.",
            },
            {
              icon: FileText,
              title: "Clean report output",
              desc: "Reports come out as structured markdown. Download them, paste into a doc, or send straight to a client.",
            },
            {
              icon: Database,
              title: "Scan cached for 7 days",
              desc: "We keep your site analysis for a week. Re-run workflows without scanning again unless you want fresh data.",
            },
            {
              icon: ShieldCheck,
              title: "Admin panel",
              desc: "Manage users, turn workflows on or off, edit prompts, and check run logs. Handy if you run a team or agency.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bento-tile flex flex-col gap-3">
              <Icon className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="mt-2 marketing-body-sm text-muted">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection>
        <div className="rounded-2xl border border-border/50 bg-surface/40 px-6 py-10 text-center md:px-10">
          <h2 className="text-2xl font-bold text-foreground md:text-3xl">
            Try it on a site in under a minute
          </h2>
          <p className="mx-auto mt-4 max-w-lg marketing-body text-muted">
            No setup call, no manual data entry. Paste a URL, get a scan, and run a
            workflow with the form already filled in.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button size="lg" className="gap-2">
                Get started free
              </Button>
            </Link>
            <Link href="/features">
              <Button size="lg" variant="outline" className="gap-2">
                Explore features
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
            {["No credit card", "Forms filled from your first scan", `${WORKFLOW_COUNT} workflows ready to run`].map(
              (item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  {item}
                </li>
              ),
            )}
          </ul>
        </div>
      </MarketingSection>
    </MarketingShell>
  );
}
