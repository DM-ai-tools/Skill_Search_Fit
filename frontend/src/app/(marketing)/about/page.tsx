import { Flame, Target, Cpu, Users } from "lucide-react";
import {
  MarketingSection,
  MarketingShell,
} from "@/components/marketing/marketing-section";

const pillars = [
  {
    icon: Target,
    title: "Built for SEO work",
    desc: "This is not a general chatbot. It is set up for SEO tasks — keyword research, content work, technical checks — with reports you can save and come back to.",
  },
  {
    icon: Cpu,
    title: "Workflow-based",
    desc: "Each task is a workflow with clear inputs and a structured output. Admins can manage the catalog; you run what you need and get consistent results.",
  },
  {
    icon: Users,
    title: "Separate from ClickTrends",
    desc: "SkillSearchFit is its own product with its own UI. It links to ClickTrends where that helps your workflow, but it stands on its own.",
  },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <MarketingSection className="marketing-section--tight">
        <div className="bento-tile-strong relative overflow-hidden rounded-3xl marketing-card-inset">
          <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25">
              <Flame className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground md:text-4xl">About SkillSearchFit</h1>
            <p className="mt-4 max-w-2xl marketing-lead text-muted">
              A workspace for SEO teams who want site scans, filled-in forms, and
              saved reports — without bouncing between a dozen different tools.
            </p>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {pillars.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="bento-tile flex flex-col gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">{p.title}</h2>
                  <p className="mt-2 marketing-body-sm text-muted">{p.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-xl border border-border/30 bg-surface/30 px-6 py-5">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted/60">
            Where we are today
          </p>
          <p className="mt-2 marketing-body-sm text-muted">
            The current version covers accounts, the workflow library, the
            workspace, and admin tools. More prompts and AI integrations are on
            the way in later releases.
          </p>
        </div>
      </MarketingSection>
    </MarketingShell>
  );
}
