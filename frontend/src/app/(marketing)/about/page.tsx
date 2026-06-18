import { Flame, Target, Cpu, Users } from "lucide-react";

const pillars = [
  {
    icon: Target,
    title: "Built for professionals",
    desc: "Not a generic AI chatbot. SkillSearchFit is structured around SEO workflows — keyword research, content optimization, technical audits — with outputs that persist, version, and export.",
  },
  {
    icon: Cpu,
    title: "Plugin-driven architecture",
    desc: "Every capability is a plugin: a defined input schema, a versioned prompt, a structured output. Admins control the catalog; professionals execute with precision.",
  },
  {
    icon: Users,
    title: "Distinct from ClickTrends",
    desc: "Sister product with its own branding, UI, and architecture. Cross-linked for workflow continuity, but designed to stand alone as a purpose-built SEO AI workspace.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      {/* Hero */}
      <div className="bento-tile-strong relative mb-10 overflow-hidden rounded-3xl px-8 py-12 md:px-14">
        <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25">
            <Flame className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">About SkillSearchFit</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
            A standalone AI-powered SEO workspace built on structured workflows, auditable
            execution, and professional-grade output quality.
          </p>
        </div>
      </div>

      {/* Pillars bento */}
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
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* MVP note */}
      <div className="mt-8 rounded-xl border border-border/30 bg-surface/30 px-6 py-5">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-muted/60">
          MVP Status
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The current MVP focuses on platform foundation: authentication, plugin architecture,
          interactive workspace, and admin management — with broader prompt and AI integration
          planned for subsequent phases.
        </p>
      </div>
    </div>
  );
}
