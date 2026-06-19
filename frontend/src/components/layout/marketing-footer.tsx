import Link from "next/link";
import { Flame } from "lucide-react";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/30 bg-background/60 backdrop-blur-xl">
      <div className="marketing-shell flex flex-col gap-6 py-12 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
            <Flame className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">SkillSearchFit</p>
            <p className="mt-0.5 text-xs text-muted">SEO workflows for people who do this for a living.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-6 text-sm text-muted">
          <Link href="/features" className="transition-colors hover:text-foreground">Features</Link>
          <Link href="/about" className="transition-colors hover:text-foreground">About</Link>
          <Link href="/contact" className="transition-colors hover:text-foreground">Contact</Link>
          <a
            href="https://clicktrends.io"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            ClickTrends ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
