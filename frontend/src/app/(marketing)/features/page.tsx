import { Puzzle, Layers, FolderKanban, ScrollText, ShieldCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  MarketingSection,
  MarketingSectionIntro,
  MarketingShell,
} from "@/components/marketing/marketing-section";

const features = [
  {
    icon: Puzzle,
    title: "Workflow library",
    desc: "Browse SEO workflows by category — keyword research, technical audits, content briefs, and more. Open one, review the prefilled fields, and run it.",
    accent: "text-category-technical",
    accentBg: "bg-category-technical/15 border-category-technical/25",
    size: "featured",
    cta: { label: "Browse workflows", href: "/plugins" },
  },
  {
    icon: Layers,
    title: "Three-panel workspace",
    desc: "Inputs on the left, the run in the middle, notes and saved output on the right. You always know where you are in the process.",
    accent: "text-category-research",
    accentBg: "bg-category-research/15 border-category-research/25",
    size: "tall",
  },
  {
    icon: FolderKanban,
    title: "Projects",
    desc: "Reports stay saved. Group work by client or campaign and pick up where you left off.",
    accent: "text-category-content",
    accentBg: "bg-category-content/15 border-category-content/25",
    size: "short",
  },
  {
    icon: ScrollText,
    title: "Run history",
    desc: "Every workflow run is logged. If a workflow changes, you see that before you run it again.",
    accent: "text-category-reporting",
    accentBg: "bg-category-reporting/15 border-category-reporting/25",
    size: "short",
  },
  {
    icon: ShieldCheck,
    title: "Admin panel",
    desc: "Add users, turn workflows on or off, edit prompts, and check logs. Built for teams that manage more than one account.",
    accent: "text-category-local-seo",
    accentBg: "bg-category-local-seo/15 border-category-local-seo/25",
    size: "wide",
  },
];

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <MarketingSection className="marketing-section--tight">
        <MarketingSectionIntro
          eyebrow="Features"
          title={
            <>
              What you can do
              <br className="hidden md:block" /> with SkillSearchFit
            </>
          }
          titleAs="h1"
          description="Scan a site, run structured SEO workflows, and keep the reports — without juggling spreadsheets and copy-paste between tools."
        />

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
                      "mt-2 text-muted",
                      f.size === "featured" ? "marketing-body" : "marketing-body-sm",
                    )}
                  >
                    {f.desc}
                  </p>
                </div>

                {f.cta && (
                  <Link
                    href={f.cta.href}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-all duration-150 hover:gap-2.5"
                  >
                    {f.cta.label} <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </MarketingSection>
    </MarketingShell>
  );
}
