"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntegrationsPanel } from "@/components/integrations/integrations-panel";

export default function IntegrationsPage() {
  const router = useRouter();
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted">Settings</p>
          <h1 className="text-xl font-semibold text-foreground">Business Integrations</h1>
        </div>
        <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <IntegrationsPanel open onClose={goBack} mode="page" />
    </div>
  );
}
