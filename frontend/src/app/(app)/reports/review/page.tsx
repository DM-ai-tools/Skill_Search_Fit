"use client";

import { UploadStep } from "./_steps/upload-step";
import { BentoSectionHeader } from "@/components/bento";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { useReportReviewStore } from "@/stores/report-review-store";

export default function ReportReviewPage() {
  const { reset } = useReportReviewStore();

  return (
    <div className="space-y-8">
      <BentoSectionHeader
        eyebrow="Report Review"
        title="New Report"
        description="Upload an audit report and Claude will generate an implementation plan."
        actions={<Button
          variant="ghost"
          size="sm"
          onClick={reset}
          title="Clear stored report"
          className="flex items-center gap-1.5 text-muted hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Clear
        </Button>}
      />
      <UploadStep />
    </div>
  );
}
