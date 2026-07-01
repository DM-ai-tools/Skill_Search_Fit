"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-3 px-4 text-center">
      <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="text-sm text-muted">An unexpected error occurred while loading this page.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

