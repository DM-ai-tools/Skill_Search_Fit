import { parseBlocksFromBody } from "@/lib/report-view-model";
import type { PipelineStepReport, StructuredSection } from "@/lib/report-view-model";
import type { UnifiedPipelineReport } from "@/lib/types";
import type { ReportPdfDocument } from "@/lib/report-pdf-document";

export function unifiedReportToPdfDocument(
  report: UnifiedPipelineReport,
  opts: {
    pipelineName: string;
    siteUrl?: string;
    executionId?: string;
    pipelineSteps?: PipelineStepReport[];
  },
): ReportPdfDocument {
  const score = report.sections
    .map((s) => s.metrics.score as number | undefined)
    .find((v) => v !== undefined);

  const sections: StructuredSection[] = report.sections.map((sec, i) => ({
    id: sec.id,
    title: sec.title,
    level: 2,
    blocks: parseBlocksFromBody(sec.combined_markdown),
    isNumbered: true,
    sectionNumber: i + 1,
  }));

  return {
    pluginName: opts.pipelineName,
    title: report.pipeline_name || opts.pipelineName,
    executionId: opts.executionId,
    siteUrl: opts.siteUrl || report.domain || null,
    generatedAt: new Date().toISOString(),
    overallScore: score ?? null,
    executiveSummary: report.narrative || report.headline_summary.outcome,
    sections,
    pipelineSteps: undefined,
  };
}
