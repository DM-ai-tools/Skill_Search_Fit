import Link from "next/link";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl">
      <div className="marketing-shell flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/30">
            <Flame className="h-4 w-4 text-primary" />
          </div>
          <span className="text-[15px] font-semibold text-foreground">SkillSearchFit</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          <Link href="/features" className="transition-colors hover:text-foreground">Features</Link>
          <Link href="/about" className="transition-colors hover:text-foreground">About</Link>
          <Link href="/contact" className="transition-colors hover:text-foreground">Contact</Link>
        </nav>

        {/* CTAs */}
        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-muted hover:text-foreground">
              Log in
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Start free</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
