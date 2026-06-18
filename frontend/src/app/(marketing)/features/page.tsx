import { Puzzle, Layers, FolderKanban, ScrollText, ShieldCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Puzzle,
    title: "Plugin Library",
    desc: "An admin-controlled catalog of AI-powered SEO workflows. Browse by category, preview plugin capabilities, and launch directly into a structured workspace — no setup required.",
    accent: "text-category-technical",
    accentBg: "bg-category-technical/15 border-category-technical/25",
    size: "featured",
    cta: { label: "Browse plugins", href: "/plugins" },
  },
  {
    icon: Layers,
    title: "Three-Panel Workspace",
    desc: "A purpose-built environment for structured AI work: inputs on the left, AI execution in the center, notes and saved outputs on the right.",
    accent: "text-category-research",
    accentBg: "bg-category-research/15 border-category-research/25",
    size: "tall",
  },
  {
    icon: FolderKanban,
    title: "Projects",
    desc: "Persist outputs across sessions. Organize work by client or campaign and resume anytime.",
    accent: "text-category-content",
    accentBg: "bg-category-content/15 border-category-content/25",
    size: "short",
  },
  {
    icon: ScrollText,
    title: "Execution Audit Trail",
    desc: "Every plugin run is versioned. Schema changes are tracked and surfaced before re-execution.",
    accent: "text-category-reporting",
    accentBg: "bg-category-reporting/15 border-category-reporting/25",
    size: "short",
  },
  {
    icon: ShieldCheck,
    title: "Admin Portal",
    desc: "Full control over users, plugins, prompts, and logs. Built for agencies and operators managing multiple clients.",
    accent: "text-category-local-seo",
    accentBg: "bg-category-local-seo/15 border-category-local-seo/25",
    size: "wide",
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      {/* Header */}
      <div className="mb-10">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-primary/70">
          Platform features
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">
          Everything you need to run
          <br className="hidden md:block" /> professional SEO AI workflows
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          A framework-first platform built for structured, auditable, and repeatable SEO work.
        </p>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.title}
              className={cn(
                "bento-tile group flex flex-col gap-4",
                f.size === "featured" && "md:col-span-2 md:row-span-2",
                f.size === "tall" && "md:col-span-1 md:row-span-2",
                f.size === "wide" && "md:col-span-3",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={cn(
                    "flex items-center justify-center rounded-2xl border p-3 transition-all duration-200 group-hover:scale-110",
                    f.accentBg,
                    f.size === "featured" && "p-4",
                  )}
                >
                  <Icon className={cn("h-6 w-6", f.accent, f.size === "featured" && "h-8 w-8")} />
                </div>
              </div>

              <div className="flex-1">
                <h2
                  className={cn(
                    "font-semibold text-foreground",
                    f.size === "featured" ? "text-2xl" : "text-base",
                  )}
                >
                  {f.title}
                </h2>
                <p
                  className={cn(
                    "mt-2 leading-relaxed text-muted",
                    f.size === "featured" ? "text-base" : "text-sm",
                  )}
                >
                  {f.desc}
                </p>
              </div>

              {f.cta && (
                <Link
                  href={f.cta.href}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:gap-2.5 transition-all duration-150"
                >
                  {f.cta.label} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
