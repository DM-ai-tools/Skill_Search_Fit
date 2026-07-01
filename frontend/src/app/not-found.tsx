import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-muted">The page you requested does not exist or may have been moved.</p>
      <Link href="/dashboard">
        <Button>Go to dashboard</Button>
      </Link>
    </div>
  );
}

